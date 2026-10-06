# -*- coding: utf-8 -*-
"""
Phase 35-extension — Accuracy@±2/±3/±5 ที่ 24/48/72 ชั่วโมง (h=1/2/3 วัน)
Protocol เดียวกับ phase34_push.py: rolling-origin 6 folds (เลือกโมเดลไม่ได้จาก holdout) + holdout >= 2026-08-15
โมเดล: persistence (baseline), pers_ma7blend (production fallback), direct_hgb (ML ทดลอง)
Output: data/vertex/horizon_metrics_24_48_72.json
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "data/vertex/pm25_daily_vertex.csv"
WCSV = ROOT / "data/vertex/weather_daily_bangkok.csv"
OUT = ROOT / "data/vertex/horizon_metrics_24_48_72.json"

HOLDOUT = pd.Timestamp("2026-08-15")
SELECTION_ORIGINS = [pd.Timestamp(x) for x in
                     ["2025-01-01", "2025-04-01", "2025-07-01", "2025-10-01", "2026-01-01", "2026-04-01"]]
TEST_DAYS = 90
MIN_STATION_DAYS = 30
MIN_TRAIN_DAYS = 60
SEED = 42

d = pd.read_csv(CSV)
d["timestamp"] = pd.to_datetime(d["timestamp"]).dt.tz_localize(None).dt.normalize()
d = d.dropna(subset=["pm25"])
cnt = d.groupby("location_id")["timestamp"].count()
stations = sorted(cnt[cnt >= MIN_STATION_DAYS].index.astype(str))
d["location_id"] = d["location_id"].astype(str)
d = d[d["location_id"].isin(stations)]

wx = pd.read_csv(WCSV)
wx["time"] = pd.to_datetime(wx["time"])
wx = wx.rename(columns={"time": "timestamp", "temperature_2m_mean": "temp",
                        "relative_humidity_2m_mean": "rh", "wind_speed_10m_max": "wind",
                        "precipitation_sum": "rain"})[["timestamp", "temp", "rh", "wind", "rain"]]

wide = d.pivot_table(index="timestamp", columns="location_id", values="pm25")

FEATS = [f"lag{i}" for i in range(1, 8)] + ["rm3", "rs3", "rm7", "rs7",
                                            "sp_lag", "temp", "rh", "wind", "rain",
                                            "dow", "month", "is_hs"]

def build_frame(h, station):
    s = wide[station].dropna().to_frame("pm25")
    s["target"] = s["pm25"].shift(-h)
    g = s.reset_index(drop=False)
    pm = g["pm25"]
    for lag in range(1, 8):
        g[f"lag{lag}"] = pm.shift(lag)
    for w in (3, 7):
        g[f"rm{w}"] = pm.shift(1).rolling(w, min_periods=2).mean()
        g[f"rs{w}"] = pm.shift(1).rolling(w, min_periods=2).std()
    others = wide.drop(columns=[station]).mean(axis=1)
    g["sp_lag"] = g["timestamp"].map(others)
    g = g.merge(wx, on="timestamp", how="left")
    g["dow"] = g["timestamp"].dt.dayofweek
    g["month"] = g["timestamp"].dt.month
    g["is_hs"] = g["month"].isin([12, 1, 2, 3]).astype(int)
    return g.dropna(subset=["target"])

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p)
    y, p = y[ok], p[ok]
    e = np.abs(y - p)
    return {"N": int(len(e)), "±2": round(100 * (e <= 2).mean(), 1), "±3": round(100 * (e <= 3).mean(), 1),
            "±5": round(100 * (e <= 5).mean(), 1), "MAE": round(float(e.mean()), 2)}

def predict(model, tr, te):
    if model == "persistence":
        return te["pm25"].values
    if model == "pers_ma7blend":
        return 0.7 * te["pm25"].values + 0.3 * te["rm7"].values
    est = HistGradientBoostingRegressor(max_iter=150, learning_rate=0.08,
                                        l2_regularization=1.0, random_state=SEED)
    est.fit(tr[FEATS].fillna(0), tr["target"])
    return est.predict(te[FEATS].fillna(0))

MODELS = ["persistence", "pers_ma7blend", "direct_hgb"]
res = {m: {"cv": {}, "holdout": {}} for m in MODELS}

for h, label in [(1, "24h"), (2, "48h"), (3, "72h")]:
    cv_rows = {m: [] for m in MODELS}
    hold_rows = {m: [] for m in MODELS}
    for origin in SELECTION_ORIGINS:
        t_end = origin + pd.Timedelta(days=TEST_DAYS)
        for sid in stations:
            g = build_frame(h, sid)
            tr = g[(g["timestamp"] >= origin - pd.Timedelta(days=1000)) & (g["timestamp"] < origin)]
            te = g[(g["timestamp"] >= origin) & (g["timestamp"] < t_end)]
            if tr["timestamp"].nunique() < MIN_TRAIN_DAYS or te["timestamp"].nunique() < 5:
                continue
            for m in MODELS:
                p = predict(m, tr, te)
                cv_rows[m].extend(zip(te["target"].values, p))
    for sid in stations:
        g = build_frame(h, sid)
        tr = g[g["timestamp"] < HOLDOUT]
        te = g[g["timestamp"] >= HOLDOUT]
        if tr["timestamp"].nunique() < MIN_TRAIN_DAYS or te["timestamp"].nunique() < 5:
            continue
        for m in MODELS:
            p = predict(m, tr, te)
            hold_rows[m].extend(zip(te["target"].values, p))
    print(f"\n===== {label} (h={h} วัน) =====")
    for m in MODELS:
        cvm = met([a for a, _ in cv_rows[m]], [b for _, b in cv_rows[m]])
        hm = met([a for a, _ in hold_rows[m]], [b for _, b in hold_rows[m]])
        res[m]["cv"][label] = cvm
        res[m]["holdout"][label] = hm
        print(f"  {m:<15} CV: ±2={cvm['±2']:>5}% ±3={cvm['±3']:>5}% ±5={cvm['±5']:>5}% MAE={cvm['MAE']:>5} N={cvm['N']}"
              f"  |  holdout: ±2={hm['±2']:>5}% ±3={hm['±3']:>5}% ±5={hm['±5']:>5}% MAE={hm['MAE']:>5} N={hm['N']}")

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nบันทึก: {OUT}")
