# -*- coding: utf-8 -*-
"""
Round 2 — Daily h=1 วัน ด้วยเครื่องมือใหม่: Prophet (main env) + AutoGluon (venv .venv-ml)
ทุกตัว: train < 2026-08-15 (holdout ห้ามใช้ tune), ทำนาย holdout ≥ 2026-08-15, เทียบ persistence
Output: data/vertex/round2_daily_newtools.json
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/vertex/round2_daily_newtools.json"
HOLDOUT = pd.Timestamp("2026-08-15")
TEST_END = pd.Timestamp("2026-10-01")

d = pd.read_csv(ROOT / "data/vertex/pm25_daily_vertex.csv")
d["timestamp"] = pd.to_datetime(d["timestamp"]).dt.tz_localize(None).dt.normalize()
d["location_id"] = d["location_id"].astype(str)
d = d.dropna(subset=["pm25"])
d = d[(d["timestamp"] >= pd.Timestamp("2025-10-01"))]   # จำกัด 1 ปีล่าสุด ให้ Prophet/AutoGluon เร็วขึ้น

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p)
    y, p = y[ok], p[ok]
    e = np.abs(y - p)
    return {"N": int(len(e)), "±2": round(100 * (e <= 2).mean(), 1), "±3": round(100 * (e <= 3).mean(), 1),
            "±5": round(100 * (e <= 5).mean(), 1), "MAE": round(float(e.mean()), 2)}

res = {}

# ── persistence บน window เดียวกัน (baseline ที่ต้องชนะ) ──
per = []
for sid, g in d.groupby("location_id"):
    g = g.sort_values("timestamp")
    s = g.set_index("timestamp")["pm25"]
    nxt = s.shift(-1)
    m = (s.index >= HOLDOUT) & (s.index < TEST_END) & s.notna() & nxt.notna()
    per.extend(zip(nxt[m], s[m]))
res["persistence"] = met([a for a, _ in per], [b for _, b in per])
print("persistence:", res["persistence"])

# ── Prophet (main env): fit ต่อสถานี บนข้อมูล < HOLDOUT, ทำนายวันถัดไปของ holdout ──
from prophet import Prophet
pp = []
for sid, g in d.groupby("location_id"):
    g = g.sort_values("timestamp")
    tr = g[g["timestamp"] < HOLDOUT]
    te = g[(g["timestamp"] >= HOLDOUT) & (g["timestamp"] < TEST_END)]
    if len(tr) < 60 or len(te) < 5:
        continue
    try:
        m = Prophet(daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=True,
                    seasonality_mode="additive")
        m.fit(tr[["timestamp", "pm25"]].rename(columns={"timestamp": "ds", "pm25": "y"}))
        fc = m.predict(te[["timestamp"]].rename(columns={"timestamp": "ds"}))
        pp.extend(zip(te["pm25"].values, fc["yhat"].values))
    except Exception as ex:
        print("prophet skip", sid, type(ex).__name__)
res["prophet"] = met([a for a, _ in pp], [b for _, b in pp])
print("prophet:", res["prophet"])

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("บันทึก:", OUT)
