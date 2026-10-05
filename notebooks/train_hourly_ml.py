# -*- coding: utf-8 -*-
"""
Phase 18 — Train + evaluate ML hourly forecast model (แบบทดลองเท่านั้น ยังไม่ deploy)
Protocol:
- Time-based split (train < val < test) — ห้าม random split
- Features ณ origin ใช้ข้อมูล ≤ origin เท่านั้น (target = origin + horizon)
- Model selection บน validation · holdout test ประเมินครั้งเดียว
- Baseline: persistence_1h, persistence_24h, rolling_median_6h, prod_blend
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import sqlite3
import json
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

DB = Path(r"C:\Users\ACER\projectweb\data\hourly\pm25_hourly.sqlite")
OUT = Path(r"C:\Users\ACER\projectweb\data\hourly\hourly_ml_results.json")

# ══════════════ Phase 18.1 — dataset lineage ══════════════
conn = sqlite3.connect(str(DB))
df = pd.read_sql_query("SELECT station_id, ts_local, pm25, unit FROM hourly_pm25 ORDER BY station_id, ts_local", conn)
conn.close()
df["ts"] = pd.to_datetime(df["ts_local"])
df = df.sort_values(["station_id", "ts"]).reset_index(drop=True)

print("=== Phase 18.1: dataset lineage ===")
print(f"แถวทั้งหมด: {len(df)} | สถานี: {df.station_id.nunique()}")
print(f"ช่วงเวลา: {df.ts.min()} → {df.ts.max()}")
print(f"duplicate (station,ts): {int(df.duplicated(['station_id','ts']).sum())}")
print(f"missing/NaN pm25: {int(df.pm25.isna().sum())}")
print(f"ค่า <0: {int((df.pm25 < 0).sum())} | >500: {int((df.pm25 > 500).sum())}")

# แยกสถานีมีข้อมูลยาว vs สั้น
g = df.groupby("station_id").agg(n=("pm25","count"), first=("ts","min"), last=("ts","max"), days=("ts", lambda x: x.dt.date.nunique()))
long_stations = g[g["n"] >= 1000].index.tolist()
short_stations = g[g["n"] < 1000].index.tolist()
print(f"สถานีข้อมูลยาว (≥1000 แถว): {long_stations} ({len(long_stations)} สถานี)")
print(f"สถานีข้อมูลสั้น (<1000 แถว): {short_stations} ({len(short_stations)} สถานี) — รวมเฉพาะ recent")

# ใช้เฉพาะสถานีข้อมูลยาวสำหรับเทรน (สถานีสั้นยังไม่พอสำหรับ ML)
df = df[df.station_id.isin(long_stations)].reset_index(drop=True)
print(f"ใช้เทรน: {len(df)} แถว · {df.station_id.nunique()} สถานี")

# ══════════════ Phase 18.2 — features + split ══════════════
print("\n=== Phase 18.2: features + time-based split ===")

def build_hourly_features(s):
    """features ณ ชั่วโมง t (ใช้ข้อมูล ≤ t เท่านั้น)"""
    f = pd.DataFrame(index=s.index)
    for k in [1, 2, 3, 4, 5, 6, 12, 24, 48, 72]:
        f[f"lag_{k}h"] = s.shift(k - 1)  # lag_1h = ค่าวัน origin เอง
    for w in [3, 6, 12, 24]:
        f[f"roll_mean_{w}h"] = s.rolling(w, min_periods=max(3, w//3)).mean()
        f[f"roll_std_{w}h"] = s.rolling(w, min_periods=max(3, w//3)).std()
    for w in [6, 24]:
        f[f"roll_min_{w}h"] = s.rolling(w, min_periods=3).min()
        f[f"roll_max_{w}h"] = s.rolling(w, min_periods=3).max()
    f["roc_1h"] = s.diff(1)
    f["roc_6h"] = s.diff(6)
    f["momentum_3_12"] = s.rolling(3, min_periods=3).mean() - s.rolling(12, min_periods=6).mean()
    f["hour"] = f.index.hour
    f["dayofweek"] = f.index.dayofweek
    f["month"] = f.index.month
    f["is_high_season"] = f.index.month.isin([12, 1, 2, 3]).astype(int)
    f["sin_hour"] = np.sin(2 * np.pi * f.index.hour / 24)
    f["cos_hour"] = np.cos(2 * np.pi * f.index.hour / 24)
    return f

# สร้าง features ต่อสถานี แล้วรวม
frames = []
for sid, g in df.groupby("station_id"):
    s = g.set_index("ts")["pm25"].asfreq("h")
    fe = build_hourly_features(s)
    fe["station_id"] = sid
    fe["pm25"] = s.values
    fe = fe.reset_index().rename(columns={"index": "timestamp"})
    frames.append(fe)
data = pd.concat(frames, ignore_index=True)
data = data.rename(columns={data.columns[0]: "timestamp"})
data["timestamp"] = pd.to_datetime(data["timestamp"])
data = data.dropna(subset=["pm25"]).reset_index(drop=True)

HORIZONS = [1, 6, 24, 48, 72]
FEATURES = [c for c in data.columns if c not in ("timestamp", "station_id", "pm25")]

# time split: train < 2026-07-01 · val 2026-07→08-15 · test ≥ 2026-08-15
VAL_START = pd.Timestamp("2026-07-01")
TEST_START = pd.Timestamp("2026-08-15")
print(f"Split: train <{VAL_START.date()} · val {VAL_START.date()}→{TEST_START.date()} · test ≥{TEST_START.date()}")

# ══════════════ Phase 18.3-18.4 — train + evaluate ══════════════
def metrics(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    m = np.isfinite(y) & np.isfinite(p)
    y, p = y[m], p[m]
    if not len(p):
        return None
    e = y - p
    return {"N": int(len(e)),
            "Acc2": round(100 * float((np.abs(e) <= 2).mean()), 1),
            "Acc5": round(100 * float((np.abs(e) <= 5).mean()), 1),
            "MAE": round(float(np.abs(e).mean()), 2),
            "RMSE": round(float(np.sqrt((e ** 2).mean())), 2),
            "MedAE": round(float(np.median(np.abs(e))), 2),
            "R2": round(float(r2_score(y, p)), 3),
            "Bias": round(float(e.mean()), 2)}

all_results = {}
best_models = {}

for h in HORIZONS:
    t = data.copy()
    t["target"] = t.groupby("station_id")["pm25"].shift(-h)
    t = t.dropna(subset=["target"])
    t = t.sort_values(["station_id", "timestamp"]).reset_index(drop=True)
    t["ts"] = t["timestamp"]

    tr = t[t["ts"] < VAL_START]
    va = t[(t["ts"] >= VAL_START) & (t["ts"] < TEST_START)]
    te = t[t["ts"] >= TEST_START]

    X_tr, y_tr = tr[FEATURES], tr["target"]
    X_va, y_va = va[FEATURES], va["target"]
    X_te, y_te = te[FEATURES], te["target"]

    # model selection บน val เท่านั้น
    models = {
        "ridge": Ridge(alpha=1.0).fit(X_tr.fillna(0), y_tr),
        "hgb": HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08, l2_regularization=1.0, random_state=42).fit(X_tr.fillna(0), y_tr),
    }
    val_scores = {}
    for name, m in models.items():
        val_scores[name] = mean_absolute_error(y_va, m.predict(X_va.fillna(0)))

    best_name = min(val_scores, key=val_scores.get)
    best_model = models[best_name]

    # baseline: persistence = lag_1h (ค่าชั่วโมง origin)
    per_mask = np.isfinite(X_te["lag_1h"]) & np.isfinite(y_te)
    per_val = metrics(np.asarray(y_te)[per_mask], np.asarray(X_te["lag_1h"])[per_mask])

    # ML prediction on holdout
    ml_pred = best_model.predict(X_te.fillna(0))
    te_m = metrics(y_te, ml_pred)

    all_results[f"h{h}"] = {
        "model": best_name, "val_MAE": round(val_scores[best_name], 2),
        "persistence_holdout": per_val, "ml_holdout": te_m,
        "train_n": len(tr), "val_n": len(va), "test_n": len(te),
    }
    print(f"h={h:2} [{best_name}] val MAE={val_scores[best_name]:.2f} | "
          f"holdout ML: ±2={te_m['Acc2']}% ±5={te_m['Acc5']}% MAE={te_m['MAE']} | "
          f"persistence: ±2={per_val['Acc2']}% MAE={per_val['MAE']}")

# ══════════════ Phase 18.5 — สรุป ══════════════
print("\n===== ตารางเทียบ ML vs persistence (holdout) =====")
print(f"{'h':>3} {'ML ±2':>6} {'ML ±5':>6} {'ML MAE':>7} {'ML R2':>6} | {'Per ±2':>6} {'Per MAE':>7} | ML ชนะ?")
for h in HORIZONS:
    r = all_results[f"h{h}"]
    m, p = r["ml_holdout"], r["persistence_holdout"]
    winner = "✓" if m["MAE"] < p["MAE"] else "✗"
    print(f"{h:>3} {m['Acc2']:>5}% {m['Acc5']:>5}% {m['MAE']:>6} {m['R2']:>6} | {p['Acc2']:>5}% {p['MAE']:>6} | {winner}")

# save
json.dump(all_results, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nบันทึกผล: {OUT}")
