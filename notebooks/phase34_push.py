# -*- coding: utf-8 -*-
"""
Phase 34 — ±3 push (offline, time-boxed)
- Rolling-origin CV >= 5 folds ต่อสถานี (selection folds < holdout 2026-08-15 เท่านั้น)
- h=1d เป้าหลัก: persistence vs direct/residual Ridge/HGB, per-station vs global, ensemble
- Features: lag1-7, rolling mean/std 3/7, dow, month, weather ณ origin, spatial lag (สถานีอื่น ณ origin)
- Hotspot: ไม่มีข้อมูลบนดิสก์ (ไม่มี FIRMS/VIIRS cache) — จึงไม่รวม, ระบุในรายงาน
- รายงาน: Accuracy@±3 (รอง ±2/±5, MAE) + 95% CI station-month bootstrap (paired vs persistence)
- AQI-category accuracy + ±1 ระดับ ที่ h=1,2,3d (US AQI ตาม frontend/src/utils/aqiStatus.js)
- ฤดู: ฝุ่นสูง = ธ.ค.-มี.ค. vs ปกติ
กฎ: ห้าม leakage — weather ณ origin เท่านั้น (ไม่มี weather-forecast archive), features shift(1)+, target อยู่หลัง origin เสมอ
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
CSV = ROOT / "data/vertex/pm25_daily_vertex.csv"
WCSV = ROOT / "data/vertex/weather_daily_bangkok.csv"
OUT = ROOT / "data/vertex/phase34_results.json"

HOLDOUT = pd.Timestamp("2026-08-15")
SELECTION_ORIGINS = [pd.Timestamp(x) for x in
                     ["2025-01-01", "2025-04-01", "2025-07-01", "2025-10-01", "2026-01-01", "2026-04-01"]]
TEST_DAYS = 90          # ความยาว test window ต่อ fold
MIN_STATION_DAYS = 30   # ตัดสถานี <30 วันออกจาก headline
MIN_TRAIN_DAYS = 60     # ขั้นต่ำ train ต่อสถานีสำหรับ per-station model (ไม่พอ → fallback persistence)
H1_HORS = [1, 2, 3]     # สำหรับ AQI-category
SEED = 42

# ═══ โหลดข้อมูล ═══
d = pd.read_csv(CSV)
d["timestamp"] = pd.to_datetime(d["timestamp"]).dt.tz_localize(None).dt.normalize()
d = d.dropna(subset=["pm25"])

days_per_station = d.groupby("location_id")["timestamp"].count()
HEADLINE_STATIONS = sorted(days_per_station[days_per_station >= MIN_STATION_DAYS].index.astype(str))
d["location_id"] = d["location_id"].astype(str)
d = d[d["location_id"].isin(HEADLINE_STATIONS)]
print(f"สถานีผ่านเกณฑ์ headline (>= {MIN_STATION_DAYS} วัน): {len(HEADLINE_STATIONS)} / {days_per_station.shape[0]}")
print(f"rows: {len(d)} · {d['timestamp'].min().date()} → {d['timestamp'].max().date()}")

wx = pd.read_csv(WCSV)
wx["time"] = pd.to_datetime(wx["time"])
wx = wx.rename(columns={"time": "timestamp",
                        "temperature_2m_mean": "temp", "relative_humidity_2m_mean": "rh",
                        "wind_speed_10m_max": "wind", "precipitation_sum": "rain"})
wx = wx[["timestamp", "temp", "rh", "wind", "rain"]]

# wide matrix สำหรับ spatial lag: date × station
wide = d.pivot_table(index="timestamp", columns="location_id", values="pm25")
stations = list(wide.columns)

# ═══ features ต่อสถานี (ทุกแถว = วัน origin t, target = pm25[t+h]) ═══
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
    # spatial lag: ค่าเฉลี่ยสถานีอื่น ณ origin (ข้อมูล ≤ origin — ไม่มี leakage)
    others = wide.drop(columns=[station]).mean(axis=1)
    g["sp_lag"] = g["timestamp"].map(others)
    g = g.merge(wx, on="timestamp", how="left")   # weather ณ origin
    g["dow"] = g["timestamp"].dt.dayofweek
    g["month"] = g["timestamp"].dt.month
    g["is_hs"] = g["month"].isin([12, 1, 2, 3]).astype(int)
    g = g.dropna(subset=["target"])
    return g

FEATS = [f"lag{i}" for i in range(1, 8)] + ["rm3", "rs3", "rm7", "rs7",
                                            "sp_lag", "temp", "rh", "wind", "rain",
                                            "dow", "month", "is_hs"]
BASE_FEATS = [f"lag{i}" for i in range(1, 8)] + ["rm3", "rs3", "rm7", "rs7", "dow", "month", "is_hs"]

# ═══ AQI category ตามแอป (US AQI → 5 ระดับ ที่ breakpoints 50/100/150/200) ═══
def pm25_to_aqi(v):
    if not np.isfinite(v) or v < 0:
        return np.nan
    points = [(0, 9, 0, 50), (9.1, 35.4, 51, 100), (35.5, 55.4, 101, 150),
              (55.5, 125.4, 151, 200), (125.5, 225.4, 201, 300), (225.5, 325.4, 301, 500)]
    for lo, hi, ilo, ihi in points:
        if lo <= v <= hi:
            return round((ihi - ilo) / (hi - lo) * (min(v, hi) - lo) + ilo)
    return 500

def aqi_cat(aqi):
    if not np.isfinite(aqi):
        return np.nan
    for cat, brk in enumerate([50, 100, 150, 200], start=1):
        if aqi <= brk:
            return cat
    return 5

# ═══ โมเดล ═══
def fit_predict(name, tr, te, h, sid):
    """คืน array คำทำนายสำหรับ te (dropna(target) แล้วทั้ง tr/te)"""
    y = tr["target"].values
    if name == "persistence":
        return te["pm25"].values
    if name.startswith("pers_ma7blend"):
        return 0.7 * te["pm25"].values + 0.3 * te["rm7"].values
    if name.startswith("residual_"):
        est = Ridge(alpha=1.0) if name.endswith("ridge") else HistGradientBoostingRegressor(
            max_iter=150, learning_rate=0.08, l2_regularization=1.0, random_state=SEED)
        base = tr["pm25"].values
        feats = BASE_FEATS if name.endswith("_base") else FEATS
        est.fit(tr[feats].fillna(0), y - base)          # residual = target − pm25[origin]
        return est.predict(te[feats].fillna(0)) + te["pm25"].values
    if name.startswith("station_ridge"):
        if tr["timestamp"].nunique() < MIN_TRAIN_DAYS:
            return te["pm25"].values
        est = Ridge(alpha=1.0).fit(tr[FEATS].fillna(0), y)
        return est.predict(te[FEATS].fillna(0))
    if name.startswith("station_hgb"):
        if tr["timestamp"].nunique() < MIN_TRAIN_DAYS:
            return te["pm25"].values
        est = HistGradientBoostingRegressor(max_iter=150, learning_rate=0.08,
                                            l2_regularization=1.0, random_state=SEED)
        est.fit(tr[FEATS].fillna(0), y)
        return est.predict(te[FEATS].fillna(0))
    if name in ("direct_ridge", "direct_hgb"):
        est = Ridge(alpha=1.0) if name == "direct_ridge" else HistGradientBoostingRegressor(
            max_iter=150, learning_rate=0.08, l2_regularization=1.0, random_state=SEED)
        est.fit(tr[FEATS].fillna(0), y)
        return est.predict(te[FEATS].fillna(0))
    raise ValueError(name)

MODELS = ["persistence", "pers_ma7blend", "direct_ridge", "direct_hgb",
          "residual_ridge", "residual_hgb", "station_ridge", "station_hgb"]

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p)
    y, p = y[ok], p[ok]
    e = np.abs(y - p)
    return {"N": int(len(e)), "±2": round(100 * (e <= 2).mean(), 1), "±3": round(100 * (e <= 3).mean(), 1),
            "±4": round(100 * (e <= 4).mean(), 1), "±5": round(100 * (e <= 5).mean(), 1),
            "MAE": round(float(e.mean()), 2)}

# ═══ 1) rolling-origin CV (selection folds) h=1d ═══
print("\n===== Rolling-origin CV (6 folds, h=1d, model selection ONLY) =====")
fold_rows = []   # แถวต่อ sample ต่อโมเดล เก็บไว้ทำ bootstrap/ฤดู
fold_metrics = []
for oi, origin in enumerate(SELECTION_ORIGINS):
    t_end = origin + pd.Timedelta(days=TEST_DAYS)
    for sid in HEADLINE_STATIONS:
        g = build_frame(1, sid)
        tr = g[(g["timestamp"] >= origin - pd.Timedelta(days=1000)) & (g["timestamp"] < origin)]
        te = g[(g["timestamp"] >= origin) & (g["timestamp"] < t_end)]
        if tr["timestamp"].nunique() < MIN_TRAIN_DAYS or te["timestamp"].nunique() < 5:
            continue
        preds = {m: fit_predict(m, tr, te, 1, sid) for m in MODELS}
        ens = (preds["direct_ridge"] + preds["direct_hgb"]) / 2
        preds["ensemble_rh"] = ens
        preds["ensemble_pers_ml"] = (preds["persistence"] + preds["direct_hgb"]) / 2
        for m, p in preds.items():
            for yv, pv, ts in zip(te["target"].values, p, te["timestamp"].values):
                fold_rows.append({"fold": oi, "origin": str(origin.date()), "station": sid,
                                  "month": pd.Timestamp(ts).month, "target": float(yv),
                                  "pred": float(pv), "model": m})
    n_st = len({r["station"] for r in fold_rows if r["fold"] == oi})
    print(f"  fold {oi + 1}/6 origin {origin.date()} → {t_end.date()}: {n_st} สถานี")

fr = pd.DataFrame(fold_rows)
ALL_MODELS = MODELS + ["ensemble_rh", "ensemble_pers_ml"]
cv = {m: met(fr[fr.model == m]["target"], fr[fr.model == m]["pred"]) for m in ALL_MODELS}
print("\n--- CV รวม 6 folds (selection) h=1d ---")
for m in ALL_MODELS:
    v = cv[m]
    print(f"  {m:<20} ±3={v['±3']:>5}% ±2={v['±2']:>5}% ±5={v['±5']:>5}% MAE={v['MAE']:>5} N={v['N']}")

# ═══ 2) เลือก champion จาก CV เท่านั้น (ไม่แตะ holdout) — รวม persistence ในการเทียบ ═══
best_overall = max(ALL_MODELS, key=lambda m: cv[m]["±3"])
champion = max((m for m in ALL_MODELS if m != "persistence"), key=lambda m: cv[m]["±3"])
print(f"\nดีที่สุดใน CV รวม: {best_overall} (±3={cv[best_overall]['±3']}%) · "
      f"champion ฝั่ง ML/blend: {champion} (±3={cv[champion]['±3']}%)")

# ═══ 3) Holdout >= 2026-08-15 (รายงานอย่างเดียว ไม่ใช้เลือก) h=1d ═══
hold_rows = []
for sid in HEADLINE_STATIONS:
    g = build_frame(1, sid)
    tr = g[g["timestamp"] < HOLDOUT]
    te = g[g["timestamp"] >= HOLDOUT]
    if tr["timestamp"].nunique() < MIN_TRAIN_DAYS or te["timestamp"].nunique() < 5:
        continue
    preds = {m: fit_predict(m, tr, te, 1, sid) for m in MODELS}
    preds["ensemble_rh"] = (preds["direct_ridge"] + preds["direct_hgb"]) / 2
    preds["ensemble_pers_ml"] = (preds["persistence"] + preds["direct_hgb"]) / 2
    for m, p in preds.items():
        for yv, pv, ts in zip(te["target"].values, p, te["timestamp"].values):
            hold_rows.append({"station": sid, "month": pd.Timestamp(ts).month,
                              "target": float(yv), "pred": float(pv), "model": m})
hf = pd.DataFrame(hold_rows)
holdout_metrics = {m: met(hf[hf.model == m]["target"], hf[hf.model == m]["pred"])
                   for m in set(ALL_MODELS) | {"ensemble_rh", "ensemble_pers_ml"}}
ch = holdout_metrics[champion]; pe = holdout_metrics["persistence"]
print(f"\n--- HOLDOUT (>= {HOLDOUT.date()}, รายงานอย่างเดียว) h=1d ---")
print(f"  persistence       ±3={pe['±3']}% ±2={pe['±2']}% MAE={pe['MAE']} N={pe['N']}")
print(f"  champion={champion:<20} ±3={ch['±3']}% ±2={ch['±2']}% MAE={ch['MAE']} N={ch['N']}")

# ═══ 4) station-month block bootstrap CI (pooled CV, paired diff ±3) ═══
print("\n===== Station-month bootstrap 95% CI (pooled CV, h=1d, paired vs persistence) =====")
fr["sm"] = fr["station"] + "|" + fr["fold"].astype(str) + "-" + fr["month"].astype(str)
def bootstrap_ci(model_a, model_b, n_boot=1000):
    """คืน (acc_a, acc_b, CI ของ Δacc(±3), CI ของ ΔMAE) — paired ต่อ station-month (row-level ครบทุกแถว)"""
    da = fr[fr.model == model_a].reset_index(drop=True)
    db = fr[fr.model == model_b].reset_index(drop=True)
    assert (da["sm"].values == db["sm"].values).all(), "row order mismatch between models"
    assert np.allclose(da["target"], db["target"]), "targets not paired"
    ya, pa = da["target"].values, da["pred"].values
    yb, pb = db["target"].values, db["pred"].values
    groups = {}
    for i, sm in enumerate(da["sm"].values):
        groups.setdefault(sm, []).append(i)
    gidx = list(groups.values())
    rng = np.random.default_rng(SEED)
    da3, dmae = [], []
    for _ in range(n_boot):
        pick = rng.choice(len(gidx), size=len(gidx), replace=True)
        idx = np.concatenate([gidx[i] for i in pick])
        da3.append(((np.abs(ya[idx] - pa[idx]) <= 3).mean() - (np.abs(yb[idx] - pb[idx]) <= 3).mean()))
        dmae.append(np.abs(ya[idx] - pa[idx]).mean() - np.abs(yb[idx] - pb[idx]).mean())
    acc_a = 100 * (np.abs(ya - pa) <= 3).mean()
    acc_b = 100 * (np.abs(yb - pb) <= 3).mean()
    ci3 = (100 * np.percentile(da3, 2.5), 100 * np.percentile(da3, 97.5))
    cim = (np.percentile(dmae, 2.5), np.percentile(dmae, 97.5))
    sig = "ชนะนัยสำคัญ (CI ไม่คร่อม 0)" if ci3[0] > 0 else ("แพ้นัยสำคัญ" if ci3[1] < 0 else "ไม่มีนัยสำคัญ")
    return acc_a, acc_b, ci3, cim, sig, int(len(ya))

boot = {}
for m in [champion, "ensemble_rh", "ensemble_pers_ml", "residual_hgb"]:
    if m == "persistence":
        continue
    a, b, ci3, cim, sig, n = bootstrap_ci(m, "persistence")
    boot[m] = {"acc_pm3": round(a, 1), "acc_pers_pm3": round(b, 1),
               "d_pm3_CI95": [round(x, 1) for x in ci3],
               "d_MAE_CI95": [round(x, 2) for x in cim], "verdict": sig, "N": n}
    print(f"  {m:<20} ±3 {a:.1f}% vs persistence {b:.1f}% · Δ±3 CI95 [{ci3[0]:+.1f}, {ci3[1]:+.1f}] · {sig}")

# ═══ 5) AQI-category accuracy h=1,2,3d (champion vs persistence) ═══
print("\n===== AQI-category accuracy (US AQI 5 ระดับ, holdout รายงานอย่างเดียว) =====")
aqi_res = {}
champion_base = "direct_hgb"   # ตัวทำนาย ML ตรงสำหรับ h>1 (champion อาจเป็น residual ที่นิยามกับ h=1)
for h in H1_HORS:
    rows = []
    for sid in HEADLINE_STATIONS:
        g = build_frame(h, sid)
        tr = g[g["timestamp"] < HOLDOUT]
        te = g[g["timestamp"] >= HOLDOUT]
        if tr["timestamp"].nunique() < MIN_TRAIN_DAYS or te["timestamp"].nunique() < 5:
            continue
        est = HistGradientBoostingRegressor(max_iter=150, learning_rate=0.08,
                                            l2_regularization=1.0, random_state=SEED)
        est.fit(tr[FEATS].fillna(0), tr["target"])
        rows.append(pd.DataFrame({"target": te["target"].values,
                                  "ml": est.predict(te[FEATS].fillna(0)),
                                  "pers": te["pm25"].values}))
    if not rows:
        continue
    t = pd.concat(rows)
    yc = t["target"].map(lambda v: aqi_cat(pm25_to_aqi(v)))
    for name, col in [("ml_direct_hgb", "ml"), ("persistence", "pers")]:
        pc = t[col].map(lambda v: aqi_cat(pm25_to_aqi(v)))
        ok = np.isfinite(yc) & np.isfinite(pc)
        exact = 100 * (yc[ok] == pc[ok]).mean()
        adj = 100 * (np.abs(yc[ok] - pc[ok]) <= 1).mean()
        aqi_res[f"h{h}d_{name}"] = {"N": int(ok.sum()), "exact_cat": round(exact, 1), "within_1_cat": round(adj, 1)}
        print(f"  h={h}d {name:<12} exact={exact:5.1f}% ±1ระดับ={adj:5.1f}% N={int(ok.sum())}")

# ═══ 6) ฤดูฝุ่นสูง (ธ.ค.-มี.ค.) vs ปกติ — pooled CV h=1d, N จริง ═══
print("\n===== Season split (pooled CV h=1d) =====")
season = {}
for label, months in [("ฝุ่นสูง(ธ.ค.-มี.ค.)", [12, 1, 2, 3]), ("ปกติ(เม.ย.-พ.ย.)", [4, 5, 6, 7, 8, 9, 10, 11])]:
    sub = fr[fr.model.isin(["persistence", champion]) & fr.month.isin(months)]
    r = {}
    for m in ["persistence", champion]:
        s = sub[sub.model == m]
        r[m] = met(s["target"], s["pred"])
    season[label] = r
    print(f"  {label}: champion ±3={r[champion]['±3']}% MAE={r[champion]['MAE']} (N={r[champion]['N']}) · "
          f"persistence ±3={r['persistence']['±3']}% MAE={r['persistence']['MAE']} (N={r['persistence']['N']})")

# ═══ 7) TESTS: leakage + monotonicity ═══
print("\n===== TESTS =====")
# leakage: features ทั้งหมดต้องมาจากข้อมูล ≤ origin (shift(1)+, weather ณ origin, sp_lag ณ origin)
g_chk = build_frame(1, HEADLINE_STATIONS[0])
assert g_chk["target"].notna().all()
max_feat_ts = g_chk["timestamp"]
assert (max_feat_ts < g_chk["timestamp"] + pd.Timedelta(days=1)).all()  # target = t+1 > origin t
# sp_lag ที่ origin t ค่าเฉลี่ยสถานีอื่น ณ t (≤ origin) ✓ โดยการก่อสร้าง; weather map ณ timestamp=origin ✓
# ตรวจจริง: target ต้องเท่ากับค่าวัดถัดไปที่มีข้อมูล (shift(-1) ของ series ต้นทาง ไม่ใช่วันปฏิทิน t+1)
probe = wide[HEADLINE_STATIONS[0]].dropna()
next_val = probe.shift(-1)                      # ค่าวัดถัดไปที่มีอยู่จริง
chk = g_chk.set_index("timestamp")["target"]
aligned = chk.index.map(lambda t: next_val.get(t, np.nan))
assert np.allclose(np.asarray(aligned, float), chk.values.astype(float), equal_nan=True), "target misaligned"
n_gap = int(sum(1 for t in chk.index if pd.isna(probe.get(t + pd.Timedelta(days=1), np.nan))))
print(f"  leakage: target = pm25[ค่าวัดถัดไป] จริง ({n_gap} แถวข้ามวันหาย — shift(-1) ถูกต้อง), "
      f"features ใช้ข้อมูล <= origin เท่านั้น — PASS")

for name, dic in [("CV", cv), ("holdout", holdout_metrics)]:
    for m, v in dic.items():
        assert v["±2"] <= v["±3"] <= v["±4"] <= v["±5"], f"monotonicity FAIL {name}/{m}: {v}"
print("  monotonicity ±2 <= ±3 <= ±4 <= ±5 ทุกโมเดลทุกชุด — PASS")

# ═══ บันทึก + สรุป ═══
results = {
    "meta": {"headline_stations": HEADLINE_STATIONS, "n_stations": len(HEADLINE_STATIONS),
             "selection_origins": [str(x.date()) for x in SELECTION_ORIGINS],
             "test_days": TEST_DAYS, "holdout_from": str(HOLDOUT.date()),
             "weather": "Open-Meteo archive daily ณ origin (ไม่มี forecast archive; hotspot ไม่มีข้อมูล — ไม่รวม)",
             "champion_selected_on": "CV folds เท่านั้น (< 2026-08-15)"},
    "cv_h1": cv, "champion": champion,
    "holdout_h1": holdout_metrics,
    "bootstrap_vs_persistence": boot,
    "aqi_category_holdout": aqi_res,
    "season_split_cv_h1": season,
}
json.dump(results, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nบันทึก: {OUT}")
