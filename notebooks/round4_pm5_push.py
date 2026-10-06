# -*- coding: utf-8 -*-
"""
Round 4 — ดัน Accuracy@±5 ที่ 24-72 ชม. ให้สูงสุดเท่าที่ถูกต้องได้ + prediction interval 80%
(เวอร์ชันเร็ว: fit HGB รวมต่อ fold ไม่ใช่ต่อสถานี — ผลเดิมเพราะโมเดลเป็น global)
Output: data/vertex/round4_pm5_push.json
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/vertex/round4_pm5_push.json"
HOLDOUT = pd.Timestamp("2026-08-15")
ORIGINS = [pd.Timestamp(x) for x in
           ["2025-01-01", "2025-04-01", "2025-07-01", "2025-10-01", "2026-01-01", "2026-04-01"]]
TEST_DAYS = 90
SEED = 42

d = pd.read_csv(ROOT / "data/vertex/pm25_daily_vertex.csv")
d["timestamp"] = pd.to_datetime(d["timestamp"]).dt.tz_localize(None).dt.normalize()
d["location_id"] = d["location_id"].astype(str)
d = d.dropna(subset=["pm25"])
cnt = d.groupby("location_id")["timestamp"].count()
ST = sorted(cnt[cnt >= 30].index.astype(str))
d = d[d["location_id"].isin(ST)]
wide = d.pivot_table(index="timestamp", columns="location_id", values="pm25")

FEATS = [f"lag{i}" for i in range(1, 8)] + ["rm3", "rs3", "rm7", "rs7", "sp_lag", "dow", "month", "is_hs"]

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

def hgb_fit(tr):
    est = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
                                        l2_regularization=1.0, random_state=SEED)
    est.fit(tr[FEATS].fillna(0), tr["target"])
    return est

def predict_all(tr, te):
    """คืน dict model -> (y, p) สำหรับ te; HGB fit ครั้งเดียวต่อ (fold) แล้วใช้ร่วม"""
    out = {}
    est = hgb_fit(tr)
    hgb_pred = est.predict(te[FEATS].fillna(0))
    clim_map = tr.assign(m=tr["timestamp"].dt.month).groupby("m")["target"].mean()
    clim = te["timestamp"].dt.month.map(clim_map).values
    clim = np.nan_to_num(np.asarray(clim, float), nan=float(tr["pm25"].mean()))
    for m, p in {
        "persistence": te["pm25"].values,
        "pers_ma7_w07": 0.7 * te["pm25"].values + 0.3 * te["rm7"].values,
        "pers_ma7_w05": 0.5 * te["pm25"].values + 0.5 * te["rm7"].values,
        "clim_blend": 0.5 * te["pm25"].values + 0.5 * clim,
        "hgb": hgb_pred,
        "pers_hgb_blend": 0.5 * te["pm25"].values + 0.5 * hgb_pred,
    }.items():
        out[m] = (te["target"].values, p)
    out["_is_hs"] = te["is_hs"].values
    return out

MODELS = ["persistence", "pers_ma7_w07", "pers_ma7_w05", "clim_blend", "hgb", "pers_hgb_blend"]
res = {}
for h, label in [(1, "24h"), (2, "48h"), (3, "72h")]:
    frames = {sid: build_frame(h, sid) for sid in ST}
    cv = {m: ([], []) for m in MODELS}
    cv_hs = []
    for origin in ORIGINS:
        t_end = origin + pd.Timedelta(days=TEST_DAYS)
        trs, tes = [], []
        for sid in ST:
            g = frames[sid]
            tr = g[(g["timestamp"] >= origin - pd.Timedelta(days=1000)) & (g["timestamp"] < origin)]
            te = g[(g["timestamp"] >= origin) & (g["timestamp"] < t_end)]
            if tr["timestamp"].nunique() < 60 or te["timestamp"].nunique() < 5:
                continue
            trs.append(tr); tes.append(te)
        if not trs:
            continue
        TR, TE = pd.concat(trs), pd.concat(tes)
        preds = predict_all(TR, TE)
        cv_hs.extend(preds.pop("_is_hs"))
        for m in MODELS:
            y, p = preds[m]
            cv[m][0].extend(y); cv[m][1].extend(p)
    TR = pd.concat([g[g["timestamp"] < HOLDOUT] for g in frames.values() if (g["timestamp"] < HOLDOUT).sum() > 0])
    TE = pd.concat([g[g["timestamp"] >= HOLDOUT] for g in frames.values() if (g["timestamp"] >= HOLDOUT).sum() >= 5])
    preds = predict_all(TR, TE)
    hold_hs = preds.pop("_is_hs")
    hold = {m: preds[m] for m in MODELS}

    cvm = {m: met(cv[m][0], cv[m][1]) for m in MODELS}
    best = max(MODELS, key=lambda m: cvm[m]["±5"])
    hm = {m: met(hold[m][0], hold[m][1]) for m in MODELS}

    # prediction interval 80% (residual q80 แยกฤดูจาก CV pooled ของ best model) → ตรวจ coverage บน holdout
    y = np.asarray(cv[best][0], float); p = np.asarray(cv[best][1], float); hs = np.asarray(cv_hs, bool)
    resid = np.abs(y - p)
    q80_hs = float(np.quantile(resid[hs], 0.8)); q80_norm = float(np.quantile(resid[~hs], 0.8))
    hy = np.asarray(hold[best][0], float); hp = np.asarray(hold[best][1], float)
    hhs = np.asarray(hold_hs, bool)[:len(hy)]
    half = np.where(hhs, q80_hs, q80_norm)
    coverage = float(((np.abs(hy - hp) <= half).mean()) * 100)

    res[label] = {"cv": cvm, "holdout": hm, "best_by_cv_pm5": best,
                  "interval80": {"best_model": best, "half_width_hs": round(q80_hs, 1),
                                 "half_width_normal": round(q80_norm, 1), "holdout_coverage": round(coverage, 1)}}
    print(f"\n===== {label} =====")
    for m in MODELS:
        print(f"  {m:<16} CV ±5={cvm[m]['±5']:>5}% ±2={cvm[m]['±2']:>5}% ±3={cvm[m]['±3']:>5}% MAE={cvm[m]['MAE']:>5}"
              f"  | holdout ±5={hm[m]['±5']:>5}%")
    print(f"  BEST(CV ±5) = {best} · interval80: ±{q80_norm:.1f} (ปกติ) / ±{q80_hs:.1f} (ฝุ่นสูง) → coverage holdout = {coverage:.1f}%")

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nบันทึก:", OUT)
