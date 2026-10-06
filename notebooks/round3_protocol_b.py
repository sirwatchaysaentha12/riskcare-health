# -*- coding: utf-8 -*-
"""
Round 3 — Protocol B: เพิ่ม "พยากรณ์อากาศของวันเป้าหมาย" เข้า feature ที่ h=24 ชม. (h=1 วัน)
ที่มา: Open-Meteo historical-forecast archive = ค่าที่ระบบพยากรณ์ออกก่อนวันนั้น (มีให้จริง ณ origin เมื่อพยากรณ์ 1 วันข้างหน้า — ไม่ใช่ leakage)
- h=2/3 วันไม่ใช้ WF-target (ค่า archive ของวัน t+2 ออกหลัง origin → leakage) จึงปิดที่ h=1 วัน
- Protocol เดียวกับ Phase 34: rolling-origin 6 folds + holdout >= 2026-08-15, เทียบ persistence
Output: data/vertex/round3_protocol_b.json
"""
import json
import os
import urllib.request
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/vertex/round3_protocol_b.json"
WFCSV = ROOT / "data/vertex/weather_forecast_daily_bangkok.csv"
HOLDOUT = pd.Timestamp("2026-08-15")
ORIGINS = [pd.Timestamp(x) for x in
           ["2025-01-01", "2025-04-01", "2025-07-01", "2025-10-01", "2026-01-01", "2026-04-01"]]
TEST_DAYS = 90
SEED = 42

# ── 1) ดึง/แคช weather-forecast archive ──
if not WFCSV.exists():
    url = ("https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=13.75&longitude=100.5"
           "&start_date=2024-12-01&end_date=2026-09-30"
           "&daily=temperature_2m_mean,relative_humidity_2m_mean,wind_speed_10m_max,precipitation_sum"
           "&timezone=Asia%2FBangkok")
    with urllib.request.urlopen(url, timeout=120) as r:
        j = json.load(r)
    pd.DataFrame(j["daily"]).to_csv(WFCSV, index=False)
wf = pd.read_csv(WFCSV)
wf["time"] = pd.to_datetime(wf["time"])
wf = wf.rename(columns={"time": "wf_date", "temperature_2m_mean": "wf_temp",
                        "relative_humidity_2m_mean": "wf_rh", "wind_speed_10m_max": "wf_wind",
                        "precipitation_sum": "wf_rain"})
print(f"WF archive: {len(wf)} วัน ({wf['wf_date'].min().date()} → {wf['wf_date'].max().date()}), "
      f"missing={int(wf[['wf_temp','wf_rh','wf_wind','wf_rain']].isna().sum().sum())}")

# ── 2) features เดิม (Phase 34) + wf_* ของ "วันเป้าหมาย" ──
d = pd.read_csv(ROOT / "data/vertex/pm25_daily_vertex.csv")
d["timestamp"] = pd.to_datetime(d["timestamp"]).dt.tz_localize(None).dt.normalize()
d["location_id"] = d["location_id"].astype(str)
d = d.dropna(subset=["pm25"])
cnt = d.groupby("location_id")["timestamp"].count()
ST = sorted(cnt[cnt >= 30].index.astype(str))
d = d[d["location_id"].isin(ST)]
wide = d.pivot_table(index="timestamp", columns="location_id", values="pm25")

wx = pd.read_csv(ROOT / "data/vertex/weather_daily_bangkok.csv")
wx["time"] = pd.to_datetime(wx["time"])
wx = wx.rename(columns={"time": "timestamp", "temperature_2m_mean": "temp",
                        "relative_humidity_2m_mean": "rh", "wind_speed_10m_max": "wind",
                        "precipitation_sum": "rain"})[["timestamp", "temp", "rh", "wind", "rain"]]

FEATS = [f"lag{i}" for i in range(1, 8)] + ["rm3", "rs3", "rm7", "rs7", "sp_lag",
                                            "temp", "rh", "wind", "rain", "dow", "month", "is_hs"]
WF_FEATS = ["wf_temp", "wf_rh", "wf_wind", "wf_rain"]

def build_frame(station):
    s = wide[station].dropna().to_frame("pm25")
    s["target"] = s["pm25"].shift(-1)          # h = 1 วัน (24 ชม.)
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
    g["wf_date"] = g["timestamp"] + pd.Timedelta(days=1)   # วันเป้าหมาย
    g = g.merge(wf, on="wf_date", how="left")
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

def fit_predict(kind, tr, te):
    y = tr["target"].values
    if kind == "persistence":
        return te["pm25"].values
    if kind == "hgb_wf":
        est = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
                                            l2_regularization=1.0, random_state=SEED)
        est.fit(tr[FEATS + WF_FEATS].fillna(0), y)
        return est.predict(te[FEATS + WF_FEATS].fillna(0))
    if kind == "residual_ridge_wf":
        est = Ridge(alpha=1.0)
        est.fit(tr[FEATS + WF_FEATS].fillna(0), y - tr["pm25"].values)
        return est.predict(te[FEATS + WF_FEATS].fillna(0)) + te["pm25"].values
    raise ValueError(kind)

KINDS = ["persistence", "hgb_wf", "residual_ridge_wf"]
cv_rows = {k: [] for k in KINDS}
hold_rows = {k: [] for k in KINDS}
for origin in ORIGINS:
    t_end = origin + pd.Timedelta(days=TEST_DAYS)
    for sid in ST:
        g = build_frame(sid)
        tr = g[(g["timestamp"] >= origin - pd.Timedelta(days=1000)) & (g["timestamp"] < origin)]
        te = g[(g["timestamp"] >= origin) & (g["timestamp"] < t_end)]
        if tr["timestamp"].nunique() < 60 or te["timestamp"].nunique() < 5:
            continue
        for k in KINDS:
            cv_rows[k].extend(zip(te["target"].values, fit_predict(k, tr, te)))
for sid in ST:
    g = build_frame(sid)
    tr = g[g["timestamp"] < HOLDOUT]
    te = g[g["timestamp"] >= HOLDOUT]
    if tr["timestamp"].nunique() < 60 or te["timestamp"].nunique() < 5:
        continue
    for k in KINDS:
        hold_rows[k].extend(zip(te["target"].values, fit_predict(k, tr, te)))

res = {"cv": {}, "holdout": {}}
for k in KINDS:
    res["cv"][k] = met([a for a, _ in cv_rows[k]], [b for _, b in cv_rows[k]])
    res["holdout"][k] = met([a for a, _ in hold_rows[k]], [b for _, b in hold_rows[k]])
    print(f"{k:<18} CV: ±2={res['cv'][k]['±2']:>5}% ±3={res['cv'][k]['±3']:>5}% MAE={res['cv'][k]['MAE']:>5} N={res['cv'][k]['N']}"
          f"  | holdout: ±2={res['holdout'][k]['±2']:>5}% ±3={res['holdout'][k]['±3']:>5}% MAE={res['holdout'][k]['MAE']:>5} N={res['holdout'][k]['N']}")

# เพดาน: สัดส่วน |Δ 1 วัน| ≤ K ทั้ง dataset (อ้างอิง Phase 33)
deltas = []
for sid in ST:
    s = wide[sid].dropna()
    deltas.extend(np.abs(s.values[1:] - s.values[:-1]))
d = np.array(deltas)
res["ceiling_full_data"] = {"share(≤2)": round(100 * (d <= 2).mean(), 1), "share(≤3)": round(100 * (d <= 3).mean(), 1)}
print("ceiling (ทั้ง dataset):", res["ceiling_full_data"])

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("บันทึก:", OUT)
