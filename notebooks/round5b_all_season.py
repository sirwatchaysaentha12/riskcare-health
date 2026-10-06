# -*- coding: utf-8 -*-
"""
Round 5b — ตรวจซ้ำแบบ all-season: train <2025-07-01 · test = 12 เดือนเต็ม 2025-07→2026-06 (คลุมฝุ่นสูง)
เฉพาะโมเดลที่ดีที่สุดจากรอบ 5 (residual_hgb, ridge) เทียบ persistence ที่ h=4/6/8/12
Output: data/vertex/round5b_all_season.json
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import sqlite3
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/vertex/round5b_all_season.json"
TRAIN_END = pd.Timestamp("2025-07-01")
TEST_END = pd.Timestamp("2026-07-01")
HORS = [4, 6, 8, 12]
SEED = 42

df = pd.read_sql("SELECT station_id, ts_local, pm25 FROM hourly_pm25 WHERE pm25 IS NOT NULL AND pm25>=0 AND pm25<=500",
                 sqlite3.connect(ROOT / "data/hourly/pm25_hourly.sqlite"))
df["ts_local"] = pd.to_datetime(df["ts_local"])
df["station_id"] = df["station_id"].astype(str)
vc = df["station_id"].value_counts()
df = df[df["station_id"].isin(vc[vc > 1000].index)]

FEATS = ([f"lag{i}" for i in (1, 2, 3, 4, 6, 8, 12, 24, 48, 72)]
         + ["rm3", "rs3", "rm6", "rs6", "rm12", "rs12", "rm24", "rs24", "min6", "max6", "min24", "max24",
            "roc1", "roc6", "mom3_12", "sin_h", "cos_h", "dow", "month", "is_hs"])

def build_frame(h, station):
    s = (df[df.station_id == station].sort_values("ts_local")
         .drop_duplicates("ts_local").set_index("ts_local")["pm25"].asfreq("h"))
    f = pd.DataFrame({"pm25": s})
    f["target"] = s.shift(-h)
    for lag in (1, 2, 3, 4, 6, 8, 12, 24, 48, 72):
        f[f"lag{lag}"] = s.shift(lag)
    for w in (3, 6, 12, 24):
        f[f"rm{w}"] = s.shift(1).rolling(w, min_periods=max(2, w // 2)).mean()
        f[f"rs{w}"] = s.shift(1).rolling(w, min_periods=max(2, w // 2)).std()
    f["min6"] = s.shift(1).rolling(6, min_periods=3).min()
    f["max6"] = s.shift(1).rolling(6, min_periods=3).max()
    f["min24"] = s.shift(1).rolling(24, min_periods=12).min()
    f["max24"] = s.shift(1).rolling(24, min_periods=12).max()
    f["roc1"] = s.shift(1) - s.shift(2)
    f["roc6"] = s.shift(1) - s.shift(7)
    f["mom3_12"] = s.shift(1).rolling(3, min_periods=2).mean() - s.shift(1).rolling(12, min_periods=6).mean()
    f["sin_h"] = np.sin(2 * np.pi * f.index.hour / 24)
    f["cos_h"] = np.cos(2 * np.pi * f.index.hour / 24)
    f["dow"] = f.index.dayofweek
    f["month"] = f.index.month
    f["is_hs"] = f.index.month.isin([12, 1, 2, 3]).astype(int)
    return f.dropna(subset=["target"])

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p)
    y, p = y[ok], p[ok]
    e = np.abs(y - p)
    return {"N": int(len(e)), "±2": round(100 * (e <= 2).mean(), 1), "±3": round(100 * (e <= 3).mean(), 1),
            "±5": round(100 * (e <= 5).mean(), 1), "MAE": round(float(e.mean()), 2)}

frames = {sid: {h: build_frame(h, sid) for h in HORS} for sid in vc[vc > 1000].index}
res = {}
for h in HORS:
    trs, tes = [], []
    hs_flags = {"persistence": [], "residual_hgb": [], "ridge": []}
    for sid in frames:
        g = frames[sid][h]
        trs.append(g[g.index < TRAIN_END])
        tes.append(g[(g.index >= TRAIN_END) & (g.index < TEST_END)])
    TR, TE = pd.concat(trs), pd.concat(tes)
    trm, tem = TR.dropna(subset=["pm25"] + FEATS), TE.dropna(subset=["pm25"] + FEATS)
    ridge = Ridge(alpha=1.0).fit(trm[FEATS], trm["target"].values)
    hgb_res = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
                                            l2_regularization=1.0, random_state=SEED
                                            ).fit(trm[FEATS], trm["target"].values - trm["pm25"].values)
    out = {
        "persistence": met(tem["target"].values, tem["pm25"].values),
        "residual_hgb": met(tem["target"].values, hgb_res.predict(tem[FEATS]) + tem["pm25"].values),
        "ridge": met(tem["target"].values, ridge.predict(tem[FEATS])),
    }
    # ฤดูฝุ่น (ธ.ค.-มี.ค.) แยกด้วย
    months = tem.index.month.values
    hs = np.isin(months, [12, 1, 2, 3])
    y = tem["target"].values
    for m, p in [("persistence", tem["pm25"].values),
                 ("residual_hgb", hgb_res.predict(tem[FEATS]) + tem["pm25"].values),
                 ("ridge", ridge.predict(tem[FEATS]))]:
        e = np.abs(y - p)
        out[f"{m}_hs"] = {"N": int(hs.sum()), "±2": round(100 * (e[hs] <= 2).mean(), 1),
                          "±3": round(100 * (e[hs] <= 3).mean(), 1), "MAE": round(float(e[hs].mean()), 2)}
    res[f"h{h}h"] = out
    print(f"h={h:>2}ชม. ALL-SEASON(12M): " + " · ".join(
        f"{m}: ±2={out[m]['±2']}/±3={out[m]['±3']}/MAE={out[m]['MAE']} (N={out[m]['N']})" for m in out if "_" not in m))
    print(f"        ฝุ่นสูง: persistence ±3={out['persistence_hs']['±3']}% · residual_hgb ±3={out['residual_hgb_hs']['±3']}% (N={out['persistence_hs']['N']})")

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("บันทึก:", OUT)
