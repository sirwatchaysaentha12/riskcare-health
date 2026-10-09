# -*- coding: utf-8 -*-
"""
Step 1 — Backtest โมเดลทุกเวอร์ชันบนช่วงหลัง trained_until (ห้ามเดา — คำนวณจริง)
- v3.0 (ml-local-v3.0): เทรน target ≤ 2026-03-31 (ยืนยันจาก training_rows) → unseen = 2026-04-01 → ล่าสุด
- v4.0 (ml-local-v4.0): เทรน target ≤ 2026-09-30 → unseen = 2026-10-01 → ล่าสุด (N น้อย รายงานตามจริง)
- baseline: persistence (พรุ่งนี้ = วันนี้) คำนวณบน sample เดียวกัน
รายงาน MAE/RMSE ต่อ horizon · ตัดสิน: horizon ไหนของโมเดลที่เลือกแย่กว่า baseline → หยุดถาม
Output: data/vertex/step1_backtest_all_provinces.json
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import warnings
warnings.filterwarnings("ignore")
import json
import joblib
import numpy as np
import pandas as pd
import requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
env = {}
for line in (ROOT / "admin-app/.env.local").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
URL, KEY = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), env["SUPABASE_SERVICE_ROLE_KEY"]
HDRS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

rows, offset = [], 0
while True:
    r = requests.get(f"{URL}/rest/v1/air_quality_daily",
                     headers={**HDRS, "Range": f"{offset}-{offset + 999}"},
                     params={"select": "station_id,date,pm25", "order": "station_id.asc,date.asc"}, timeout=30)
    r.raise_for_status()
    batch = r.json()
    if not batch:
        break
    rows.extend(batch)
    offset += 1000
df = pd.DataFrame(rows)
df["date"] = pd.to_datetime(df["date"])
df = df.dropna(subset=["pm25"]).sort_values(["station_id", "date"])
print(f"DB rows: {len(df)} · stations: {df['station_id'].nunique()} · span {df['date'].min().date()} → {df['date'].max().date()}")

wide = df.pivot_table(index="date", columns="station_id", values="pm25")

b3 = joblib.load(ROOT / "notebooks/pm25_model_production.joblib")
b4 = joblib.load(ROOT / "notebooks/pm25_model_v4_residual.joblib")

# ── features v3.0 (ตรง train_production.py: lag_1 = origin เอง, rolling ไม่ shift) ──
def build_v3(s):
    f = pd.DataFrame(index=s.index)
    for k in [1, 2, 3, 4, 5, 6, 7, 14]:
        f[f"lag_{k}"] = s.shift(k - 1)
    for w in [3, 7, 14]:
        f[f"roll_mean_{w}"] = s.rolling(w).mean()
        f[f"roll_std_{w}"] = s.rolling(w).std()
    for w in [3, 7]:
        f[f"roll_min_{w}"] = s.rolling(w).min()
        f[f"roll_max_{w}"] = s.rolling(w).max()
    f["day_of_week"] = f.index.dayofweek
    f["month"] = f.index.month
    f["is_high_season"] = f["month"].isin([12, 1, 2, 3]).astype(int)
    return f

# ── features v4 (ตรง train_v4_residual.py: lag1 = เมื่อวาน, rolling shift(1)) ──
def build_v4(s_all, s):
    f = pd.DataFrame(index=s.index)
    f["pm25"] = s
    for lag in range(1, 15):
        f[f"lag{lag}"] = s.shift(lag)
    for w in (3, 7, 14, 30):
        f[f"rm{w}"] = s.shift(1).rolling(w, min_periods=max(2, w // 2)).mean()
        f[f"rs{w}"] = s.shift(1).rolling(w, min_periods=max(2, w // 2)).std()
    f["min7"] = s.shift(1).rolling(7, min_periods=3).min()
    f["max7"] = s.shift(1).rolling(7, min_periods=3).max()
    f["min14"] = s.shift(1).rolling(14, min_periods=7).min()
    f["max14"] = s.shift(1).rolling(14, min_periods=7).max()
    f["roc1"] = s.shift(1) - s.shift(2)
    f["roc7"] = s.shift(1) - s.shift(8)
    f["mom3_7"] = s.shift(1).rolling(3, min_periods=2).mean() - s.shift(1).rolling(7, min_periods=3).mean()
    f["sp_lag"] = f.index.map(s_all.mean(axis=1))
    f["dow"] = f.index.dayofweek
    f["month"] = f.index.month
    f["is_hs"] = f.index.month.isin([12, 1, 2, 3]).astype(int)
    return f

def mae_rmse(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p)
    y, p = y[ok], p[ok]
    e = y - p
    return {"N": int(len(e)), "MAE": round(float(np.abs(e).mean()), 2), "RMSE": round(float(np.sqrt((e ** 2).mean())), 2)}

def evaluate(models_cfg, test_from, test_to=None, label=""):
    """models_cfg = {name: fn(origin_frame_row, station_series, date) -> pred or None}"""
    acc = {name: {h: ([], []) for h in (1, 2, 3)} for name in list(models_cfg) + ["persistence"]}
    cross_mean = wide.mean(axis=1)
    for sid in wide.columns:
        s = wide[sid].dropna()
        if len(s) < 40:
            continue
        f3, f4 = build_v3(s), build_v4(wide, s)
        for t in s.index:
            if t < test_from or (test_to and t >= test_to):
                continue
            for h in (1, 2, 3):
                if (t + pd.Timedelta(days=h)) not in s.index:
                    continue
                y = s.loc[t + pd.Timedelta(days=h)]
                base_p = s.loc[t]
                for name, fn in models_cfg.items():
                    p = fn(f3, f4, s, t, h)
                    if p is not None and np.isfinite(p):
                        acc[name][h][0].append(y)
                        acc[name][h][1].append(p)
                acc["persistence"][h][0].append(y)
                acc["persistence"][h][1].append(base_p)
    out = {}
    for name, hh in acc.items():
        out[name] = {f"h{h}d": mae_rmse(y, p) for h, (y, p) in hh.items() if len(y)}
    return out

def v3_pred(f3, f4, s, t, h):
    if t not in f3.index:
        return None
    x = f3.loc[[t], b3["features"]]
    if not np.isfinite(x.to_numpy()).all():
        return None
    ml = float(b3["models"][h].predict(x)[0])
    base = float(f3.loc[t, "lag_1"])
    if not np.isfinite(base):
        base = ml
    return max(0.0, 0.5 * ml + 0.5 * base)

def v4_pred(f3, f4, s, t, h):
    if h == 1:
        if t not in f4.index:
            return None
        x = f4.loc[[t], b4["features"]]
        if not np.isfinite(x.to_numpy()).all():
            return None
        return max(0.0, float(b4["model"].predict(x)[0]) + float(f4.loc[t, "pm25"]))
    last7 = s.loc[:t].tail(7)
    ma7 = float(last7.mean()) if len(last7) == 7 else float(s.loc[t])
    return max(0.0, 0.5 * float(s.loc[t]) + 0.5 * ma7)

results = {}
# v3.0: unseen 2026-04-01 → ล่าสุด
results["v3_unseen_2026-04→now"] = evaluate({"ml-local-v3.0": v3_pred}, pd.Timestamp("2026-04-01"), label="v3")
# v4: unseen 2026-10-01 → ล่าสุด
results["v4_unseen_2026-10→now"] = evaluate({"ml-local-v4.0": v4_pred}, pd.Timestamp("2026-10-01"), label="v4")

for label, block in results.items():
    print(f"\n===== {label} =====")
    for name in block:
        parts = [f"{k}: MAE={v['MAE']} RMSE={v['RMSE']} N={v['N']}" for k, v in block[name].items()]
        print(f"  {name:<14} " + " · ".join(parts))

json.dump(results, open(ROOT / "data/vertex/step1_backtest_all_provinces.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nบันทึก: data/vertex/step1_backtest_all_provinces.json")
