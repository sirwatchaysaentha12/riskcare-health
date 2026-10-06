# -*- coding: utf-8 -*-
"""
Round 2b — Daily h=1 ด้วย AutoGluon (รันใน .venv-ml: .venv-ml/Scripts/python round2b_autogluon_daily.py)
features เดียวกับ Phase 34 (lags/rolling/sp_lag/weather ณ origin) · train < 2026-08-15 · predict holdout
time_limit 600 วินาที · เทียบ persistence
Output: data/vertex/round2b_autogluon_daily.json
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/vertex/round2b_autogluon_daily.json"
HOLDOUT = pd.Timestamp("2026-08-15")

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

tr_parts, te_parts = [], []
for sid in ST:
    g = build_frame(1, sid)
    tr_parts.append(g[g["timestamp"] < HOLDOUT].assign(station_id=sid))
    te_parts.append(g[g["timestamp"] >= HOLDOUT].assign(station_id=sid))
tr = pd.concat(tr_parts).dropna(subset=FEATS)
te = pd.concat(te_parts).dropna(subset=FEATS)
print(f"train rows={len(tr)} · holdout rows={len(te)}")

y_te, pers = te["target"].values, te["pm25"].values
def met(y, p):
    e = np.abs(np.asarray(y, float) - np.asarray(p, float))
    return {"N": int(len(e)), "±2": round(100 * (e <= 2).mean(), 1), "±3": round(100 * (e <= 3).mean(), 1),
            "±5": round(100 * (e <= 5).mean(), 1), "MAE": round(float(e.mean()), 2)}
res = {"persistence": met(y_te, pers)}

from autogluon.tabular import TabularPredictor
predictor = TabularPredictor(label="target", problem_type="regression",
                             eval_metric="mean_absolute_error", verbosity=0)
predictor.fit(tr[FEATS + ["target"]].assign(station_id=tr["station_id"]),
              time_limit=600, presets="medium_quality")
ag = predictor.predict(te[FEATS].assign(station_id=te["station_id"]))
res["autogluon"] = met(y_te, ag.values)
res["leaderboard_top5"] = predictor.leaderboard().head(5).to_dict("records")
print("persistence:", res["persistence"])
print("autogluon:", res["autogluon"])
json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
print("บันทึก:", OUT)
