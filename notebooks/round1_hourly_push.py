# -*- coding: utf-8 -*-
"""
Round 1 — Hourly short-horizon push: หา ±2/±3 @87-90% อย่างถูกต้อง
Horizons: 1/3/6/12/24 ชั่วโมง · สถานีประวัติยาว 3 ตัว · ไม่มี leakage
- persistence: ค่า ณ origin
- rolling_median_6h / rolling_mean_3h: ใช้ข้อมูล ≤ origin (shift(1))
- Ridge ML: lags 1,2,3,6,12,24 + rolling 3/6/12/24 + hour/dow — train <2026-07-01, val→2026-08-15, test ≥2026-08-15
- baseline วัดซ้ำทั้ง dataset (รวมฤดูฝุ่น) เพื่อรายงานฤดูจริง
Output: data/vertex/round1_hourly_push.json
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/vertex/round1_hourly_push.json"
VAL_D, TEST_D = pd.Timestamp("2026-07-01"), pd.Timestamp("2026-08-15")
HORS = [1, 3, 6, 12, 24]
SEED = 42

con = ROOT / "data/hourly/pm25_hourly.sqlite"
import sqlite3
df = pd.read_sql("SELECT station_id, ts_local, pm25 FROM hourly_pm25 WHERE pm25 IS NOT NULL AND pm25 >= 0 AND pm25 <= 500", sqlite3.connect(con))
df["ts_local"] = pd.to_datetime(df["ts_local"])
long_st = df["station_id"].value_counts()
LONG = sorted(long_st[long_st > 1000].index.astype(str))
df["station_id"] = df["station_id"].astype(str)
df = df[df["station_id"].isin(LONG)]
print(f"สถานีประวัติยาว: {LONG} · rows={len(df)}")

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p)
    y, p = y[ok], p[ok]
    e = np.abs(y - p)
    return {"N": int(len(e)), "±2": round(100 * (e <= 2).mean(), 1), "±3": round(100 * (e <= 3).mean(), 1),
            "±5": round(100 * (e <= 5).mean(), 1), "MAE": round(float(e.mean()), 2)}

FEATS = [f"lag{i}" for i in (1, 2, 3, 6, 12, 24)] + ["rm3", "rs3", "rm6", "rm12", "rm24", "hour", "dow"]

results = {}
for h in HORS:
    rows_base = {"persistence": [], "rolling_mean_6h": [], "rolling_mean_3h": []}
    rows_ml_tr, rows_ml_te, rows_ml_full = [], [], []
    for sid in LONG:
        g = df[df.station_id == sid].sort_values("ts_local").drop_duplicates("ts_local")
        s = g.set_index("ts_local")["pm25"].asfreq("h")   # grid รายชั่วโมง (ช่องว่าง = NaN ไม่เดา)
        f = pd.DataFrame({"pm25": s})
        f["target"] = s.shift(-h)
        for lag in (1, 2, 3, 6, 12, 24):
            f[f"lag{lag}"] = s.shift(lag)
        for w in (3, 6, 12, 24):
            f[f"rm{w}"] = s.shift(1).rolling(w, min_periods=max(2, w // 2)).mean()
        f["rs3"] = s.shift(1).rolling(3, min_periods=2).std()
        f["hour"] = f.index.hour; f["dow"] = f.index.dayofweek
        f = f.dropna(subset=["target"])
        # baselines: ต้องมีค่า ณ origin (grid h ชั่วโมงข้างหน้า — NaN target ถูกตัดแล้ว, origin NaN ตัดเอง)
        ok = f["pm25"].notna()
        rows_base["persistence"].extend(zip(f.loc[ok, "target"], f.loc[ok, "pm25"]))
        ok6 = f["rm6"].notna() & f["pm25"].notna()
        rows_base["rolling_mean_6h"].extend(zip(f.loc[ok6, "target"], f.loc[ok6, "rm6"]))
        ok3 = f["rm3"].notna() & f["pm25"].notna()
        rows_base["rolling_mean_3h"].extend(zip(f.loc[ok3, "target"], f.loc[ok3, "rm3"]))
        ts = f.index
        if h == 1:
            rows_ml_full.extend(zip(ts, f["target"]))
        tr = f[(ts < VAL_D)]; va = f[(ts >= VAL_D) & (ts < TEST_D)]; te = f[ts >= TEST_D]
        trm, vam, tem = tr.dropna(subset=FEATS), va.dropna(subset=FEATS), te.dropna(subset=FEATS)
        if len(trm) < 500 or len(vam) < 100 or len(tem) < 100:
            continue
        model = Ridge(alpha=1.0).fit(trm[FEATS], trm["target"])
        rows_ml_te.extend(zip(te["target"], model.predict(tem[FEATS])))

    results[f"h{h}h"] = {m: met([a for a, _ in r], [b for _, b in r]) for m, r in rows_base.items()}
    results[f"h{h}h"]["ridge_ml_test"] = met([a for a, _ in rows_ml_te], [b for _, b in rows_ml_te])
    print(f"\n===== h={h} ชั่วโมง =====")
    for m, v in results[f"h{h}h"].items():
        tag = " ←±2 และ ±3 ผ่าน 87-90%" if v["±2"] >= 87 and v["±3"] >= 87 else ""
        print(f"  {m:<18} ±2={v['±2']:>5}% ±3={v['±3']:>5}% ±5={v['±5']:>5}% MAE={v['MAE']:>5} N={v['N']}{tag}")

json.dump(results, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nบันทึก: {OUT}")
