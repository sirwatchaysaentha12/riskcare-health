# -*- coding: utf-8 -*-
"""
Round 5 — พัฒนาความแม่นยำรายชั่วโมงต่อ: ขยายโซน ±2/±3 >= 87-90% ให้ครอบคลุม horizon มากขึ้น
- Horizons: 1,2,3,4,6,8,12 ชม. · 3 สถานีประวัติยาว · grid รายชั่วโมง (ช่องว่าง = NaN ไม่เดาข้าม)
- Features เต็มรูปแบบ (ครั้งแรกกับ hourly): lags 1-72, rolling mean/std 3/6/12/24, min/max 6/24,
  ROC 1/6, momentum 3-12, hour sin/cos, dow, month, is_hs
- Models: persistence / Ridge / HGB / residual-HGB / blend(pers+ML) — เลือก weight บน val เท่านั้น
- Split: train <2026-07-01 · val ก.ค.-14 ส.ค. · test >=2026-08-15 (รายงาน)
Output: data/vertex/round5_hourly_ml_deep.json
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
OUT = ROOT / "data/vertex/round5_hourly_ml_deep.json"
VAL_D, TEST_D = pd.Timestamp("2026-07-01"), pd.Timestamp("2026-08-15")
HORS = [1, 2, 3, 4, 6, 8, 12]
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

# frames ต่อสถานี (สร้างครั้งเดียว ใช้ทุก horizon)
frames = {sid: {h: build_frame(h, sid) for h in HORS} for sid in vc[vc > 1000].index}
res = {}
for h in HORS:
    trs, vas, tes = [], [], []
    for sid in frames:
        g = frames[sid][h]
        trs.append(g[g.index < VAL_D])
        vas.append(g[(g.index >= VAL_D) & (g.index < TEST_D)])
        tes.append(g[g.index >= TEST_D])
    TR, VA, TE = pd.concat(trs), pd.concat(vas), pd.concat(tes)
    trm, vam, tem = TR.dropna(subset=["pm25"] + FEATS), VA.dropna(subset=["pm25"] + FEATS), TE.dropna(subset=["pm25"] + FEATS)
    y_tr = trm["target"].values

    ridge = Ridge(alpha=1.0).fit(trm[FEATS], y_tr)
    hgb = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
                                        l2_regularization=1.0, random_state=SEED).fit(trm[FEATS], y_tr)
    hgb_res = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
                                            l2_regularization=1.0, random_state=SEED
                                            ).fit(trm[FEATS], y_tr - trm["pm25"].values)

    preds = {
        "persistence": tem["pm25"].values,
        "ridge": ridge.predict(tem[FEATS]),
        "hgb": hgb.predict(tem[FEATS]),
        "residual_hgb": hgb_res.predict(tem[FEATS]) + tem["pm25"].values,
    }
    # blend weight เลือกบน val เท่านั้น (grid 0..1 step 0.1 กับ hgb)
    val_r = hgb.predict(vam[FEATS])
    yv = vam["target"].values
    best_w, best_mae = 0.0, float("inf")
    for w in np.arange(0, 1.01, 0.1):
        mae = float(np.abs(yv - ((1 - w) * vam["pm25"].values + w * val_r)).mean())
        if mae < best_mae:
            best_mae, best_w = mae, w
    preds["blend_val_w%02d" % round(best_w * 10)] = (1 - best_w) * tem["pm25"].values + best_w * hgb.predict(tem[FEATS])

    out = {"blend_w": round(best_w, 1)}
    for m, p in preds.items():
        out[m] = met(tem["target"].values, p)
    res[f"h{h}h"] = out
    tag = ""
    for m in preds:
        v = out[m]
        if v["±2"] >= 87 and v["±3"] >= 87:
            tag += f" [{m} ผ่าน87-90]"
    print(f"h={h:>2}ชม. w={best_w:.1f} · " + " · ".join(
        f"{m}: ±2={out[m]['±2']}/±3={out[m]['±3']}/±5={out[m]['±5']}/MAE={out[m]['MAE']}" for m in preds) + tag)

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("บันทึก:", OUT)
