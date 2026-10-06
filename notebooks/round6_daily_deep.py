# -*- coding: utf-8 -*-
"""
Round 6 — 24-72 ชม. ด้วยบทเรียน round5: deep features + dropna (ไม่ใช้ fillna(0)) + residual HGB
- Features รายวันเต็มรูปแบบ: lags 1-14, rolling mean/std 3/7/14/30, min/max 7/14, ROC 1/7,
  momentum 3-7, sp_lag, dow, month, is_hs
- Models: persistence / pers_ma7_w05 (deployed) / HGB direct / residual HGB / Ridge / blend
- Rolling-origin CV 6 folds (เลือกโมเดล) + holdout >= 2026-08-15 (รายงาน) + แยกฤดูฝุ่น
Output: data/vertex/round6_daily_deep.json
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/vertex/round6_daily_deep.json"
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

FEATS = ([f"lag{i}" for i in range(1, 15)]
         + ["rm3", "rs3", "rm7", "rs7", "rm14", "rs14", "rm30", "rs30",
            "min7", "max7", "min14", "max14", "roc1", "roc7", "mom3_7",
            "sp_lag", "dow", "month", "is_hs"])

def build_frame(h, station):
    s = wide[station].dropna()
    f = s.to_frame("pm25")
    f["target"] = s.shift(-h)
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
    return f.dropna(subset=["target"])

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p)
    y, p = y[ok], p[ok]
    e = np.abs(y - p)
    return {"N": int(len(e)), "±2": round(100 * (e <= 2).mean(), 1), "±3": round(100 * (e <= 3).mean(), 1),
            "±5": round(100 * (e <= 5).mean(), 1), "MAE": round(float(e.mean()), 2)}

MODELS = ["persistence", "pers_ma7_w05", "hgb", "residual_hgb", "ridge", "pers_hgb_blend"]
res = {}
for h, label in [(1, "24h"), (2, "48h"), (3, "72h")]:
    frames = {sid: build_frame(h, sid) for sid in ST}
    cv = {m: ([], []) for m in MODELS}
    for origin in ORIGINS:
        t_end = origin + pd.Timedelta(days=TEST_DAYS)
        trs, tes = [], []
        for sid in ST:
            g = frames[sid]
            tr = g[(g.index >= origin - pd.Timedelta(days=1100)) & (g.index < origin)]
            te = g[(g.index >= origin) & (g.index < t_end)]
            if len(tr) < 60 or len(te) < 5:
                continue
            trs.append(tr); tes.append(te)
        if not trs:
            continue
        TR, TE = pd.concat(trs), pd.concat(tes)
        trm, tem = TR.dropna(subset=["pm25"] + FEATS), TE.dropna(subset=["pm25"] + FEATS)
        hgb = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
                                            l2_regularization=1.0, random_state=SEED).fit(trm[FEATS], trm["target"].values)
        hgb_res = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
                                                l2_regularization=1.0, random_state=SEED
                                                ).fit(trm[FEATS], trm["target"].values - trm["pm25"].values)
        ridge = Ridge(alpha=1.0).fit(trm[FEATS], trm["target"].values)
        hp = hgb.predict(tem[FEATS])
        preds = {
            "persistence": tem["pm25"].values,
            "pers_ma7_w05": 0.5 * tem["pm25"].values + 0.5 * tem["rm7"].values,
            "hgb": hp,
            "residual_hgb": hgb_res.predict(tem[FEATS]) + tem["pm25"].values,
            "ridge": ridge.predict(tem[FEATS]),
            "pers_hgb_blend": 0.5 * tem["pm25"].values + 0.5 * hp,
        }
        for m in MODELS:
            cv[m][0].extend(tem["target"].values); cv[m][1].extend(preds[m])
    # holdout (รายงานเท่านั้น)
    trs, tes = [], []
    for sid in ST:
        g = frames[sid]
        tr = g[g.index < HOLDOUT]; te = g[g.index >= HOLDOUT]
        if len(tr) < 60 or len(te) < 5:
            continue
        trs.append(tr); tes.append(te)
    TR, TE = pd.concat(trs), pd.concat(tes)
    trm, tem = TR.dropna(subset=["pm25"] + FEATS), TE.dropna(subset=["pm25"] + FEATS)
    hgb = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
                                        l2_regularization=1.0, random_state=SEED).fit(trm[FEATS], trm["target"].values)
    hgb_res = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
                                            l2_regularization=1.0, random_state=SEED
                                            ).fit(trm[FEATS], trm["target"].values - trm["pm25"].values)
    ridge = Ridge(alpha=1.0).fit(trm[FEATS], trm["target"].values)
    hp = hgb.predict(tem[FEATS])
    hold_preds = {
        "persistence": tem["pm25"].values,
        "pers_ma7_w05": 0.5 * tem["pm25"].values + 0.5 * tem["rm7"].values,
        "hgb": hp,
        "residual_hgb": hgb_res.predict(tem[FEATS]) + tem["pm25"].values,
        "ridge": ridge.predict(tem[FEATS]),
        "pers_hgb_blend": 0.5 * tem["pm25"].values + 0.5 * hp,
    }
    cvm = {m: met(cv[m][0], cv[m][1]) for m in MODELS}
    best = max(MODELS, key=lambda m: cvm[m]["±5"])
    hm = {m: met(tem["target"].values, hold_preds[m]) for m in MODELS}
    # แยกฤดูฝุ่น (holdout, best model vs persistence)
    hs = tem["is_hs"].values.astype(bool)
    y = tem["target"].values
    season = {}
    for m in ["persistence", best]:
        e = np.abs(y - hold_preds[m])
        season[m] = {"hs": {"N": int(hs.sum()), "±5": round(100 * (e[hs] <= 5).mean(), 1), "MAE": round(float(e[hs].mean()), 2)},
                     "normal": {"N": int((~hs).sum()), "±5": round(100 * (e[~hs] <= 5).mean(), 1), "MAE": round(float(e[~hs].mean()), 2)}}
    res[label] = {"cv": cvm, "best_by_cv_pm5": best, "holdout": hm, "holdout_season": season}
    print(f"\n===== {label} =====")
    for m in MODELS:
        star = " ←BEST" if m == best else ""
        print(f"  {m:<15} CV ±5={cvm[m]['±5']:>5}% ±3={cvm[m]['±3']:>5}% ±2={cvm[m]['±2']:>5}% MAE={cvm[m]['MAE']:>5}"
              f"  | holdout ±5={hm[m]['±5']:>5}% MAE={hm[m]['MAE']:>5}{star}")
    s = season
    print(f"  ฤดูฝุ่น(holdout N={s['persistence']['hs']['N']}): persistence ±5={s['persistence']['hs']['±5']}% · {best} ±5={s[best]['hs']['±5']}%"
          f" | ปกติ(N={s['persistence']['normal']['N']}): {s['persistence']['normal']['±5']}% vs {s[best]['normal']['±5']}%")

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nบันทึก:", OUT)
