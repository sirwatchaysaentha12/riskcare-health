# -*- coding: utf-8 -*-
"""
Train ml-local-v4.0 residual model (h=1) — โมเดลดีที่สุดจาก round6 (CV ชนะ persistence ทุก metric)
- features ต้องตรง publish_forecasts.py ทุกตัว (lags 1-14, rm/rs 3/7/14/30, min/max 7/14, roc1/roc7, mom3_7)
- target = pm25[t+1] − pm25[t] (residual) — ตอน serve บวก persistence กลับ
- เทรนจากข้อมูลทั้งหมดที่มี (production retrain มาตรฐาน) · ผลที่คาดหวังจาก round6:
  CV ±5 68.9% / ±3 51.8% / ±2 38.4% / MAE 4.37 (ชนะ persistence 68.8/50.5/37.4/4.50)
Output: notebooks/pm25_model_v4_residual.joblib
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import warnings
warnings.filterwarnings("ignore")
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT = Path(__file__).resolve().parent
SEED = 42
VERSION = "ml-local-v4.0"

FEATS = ([f"lag{i}" for i in range(1, 15)]
         + ["rm3", "rs3", "rm7", "rs7", "rm14", "rs14", "rm30", "rs30",
            "min7", "max7", "min14", "max14", "roc1", "roc7", "mom3_7",
            "sp_lag", "dow", "month", "is_hs"])

d = pd.read_csv(ROOT.parent / "data/vertex/pm25_daily_vertex.csv")
d["timestamp"] = pd.to_datetime(d["timestamp"]).dt.tz_localize(None).dt.normalize()
d["location_id"] = d["location_id"].astype(str)
d = d.dropna(subset=["pm25"])
wide = d.pivot_table(index="timestamp", columns="location_id", values="pm25")

parts = []
for station in wide.columns:
    s = wide[station].dropna()
    if len(s) < 40:
        continue
    f = s.to_frame("pm25")
    f["target"] = s.shift(-1)
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
    others = wide.drop(columns=[station]).mean(axis=1)
    f["sp_lag"] = f.index.map(others)
    f["dow"] = f.index.dayofweek
    f["month"] = f.index.month
    f["is_hs"] = f.index.month.isin([12, 1, 2, 3]).astype(int)
    parts.append(f)

allf = pd.concat(parts).dropna(subset=["pm25"] + FEATS + ["target"])
print(f"train rows: {len(allf)} · stations: {wide.shape[1]} · span {allf.index.min().date()} → {allf.index.max().date()}")

model = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
                                      l2_regularization=1.0, random_state=SEED)
model.fit(allf[FEATS], allf["target"].values - allf["pm25"].values)

# sanity: in-sample ห้ามใช้อ้างแม่น (แค่เช็ค finite + ทิศทาง)
pred = model.predict(allf[FEATS]) + allf["pm25"].values
assert np.isfinite(pred).all()
mae = float(np.abs(allf["target"].values - pred).mean())
print(f"in-sample MAE (อ้างอิงไม่ได้ แค่ sanity): {mae:.2f}")

joblib.dump({"model": model, "features": FEATS, "version": VERSION,
             "recipe": "h1 = residual_hgb + persistence; h2-3 = 0.5×persistence + 0.5×MA7 (w05, CV-best round4)"},
            ROOT / "pm25_model_v4_residual.joblib")
print("บันทึก: pm25_model_v4_residual.joblib · version =", VERSION)
