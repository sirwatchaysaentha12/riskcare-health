# -*- coding: utf-8 -*-
"""
เทรนโมเดลพยากรณ์ PM2.5 production — ข้อมูลเต็ม 24,765 แถว (air_quality_daily)
ตามคำสั่งผู้ใช้: metric หลัก = hit rate ±2 µg/m³ (รายงาน ±5/MAE/R² ควบคู่)
กัน leakage: features ณ วัน origin d ใช้ข้อมูล ≤ d เท่านั้น · target = pm25 ที่ d+h
Split ตามเวลา (target date): Train ≤2026-03-31 · Val 2026-04→06 · Test(holdout) 2026-07-01→09-30
"""
import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from sklearn.ensemble import HistGradientBoostingRegressor
from xgboost import XGBRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

CSV = Path(r"C:\Users\ACER\projectweb\data\vertex\pm25_daily_vertex.csv")
OUT = Path(r"C:\Users\ACER\projectweb\notebooks\pm25_model_production.joblib")

df = pd.read_csv(CSV)
df["timestamp"] = pd.to_datetime(df["timestamp"])
df = df.sort_values(["location_id", "timestamp"]).reset_index(drop=True)

def build_features(g):
    """features ณ วัน d (ใช้ข้อมูล ≤ d; target คือ pm25 ที่ d+h ซึ่งอยู่หน้า features เสมอ → ไม่มี leakage)"""
    s = g.set_index("timestamp")["pm25"].asfreq("D")
    f = pd.DataFrame(index=s.index)
    for k in [1, 2, 3, 4, 5, 6, 7, 14]:
        f[f"lag_{k}"] = s.shift(k - 1)  # lag_1 = ค่าของวัน d เอง (ข้อมูลล่าสุดที่มี ณ origin)
    for w in [3, 7, 14]:
        f[f"roll_mean_{w}"] = s.rolling(w).mean()
        f[f"roll_std_{w}"] = s.rolling(w).std()
    for w in [3, 7]:
        f[f"roll_min_{w}"] = s.rolling(w).min()
        f[f"roll_max_{w}"] = s.rolling(w).max()
    f["day_of_week"] = f.index.dayofweek
    f["month"] = f.index.month
    # seasonality เชิงฤดูกาล (ฝุ่นไทยพีค ธ.ค.-มี.ค.)
    f["is_high_season"] = f["month"].isin([12, 1, 2, 3]).astype(int)
    return f.reset_index().rename(columns={"index": "timestamp"})

frames = []
for sid, g in df.groupby("location_id"):
    fe = build_features(g)
    fe["location_id"] = sid
    frames.append(fe)
features = pd.concat(frames, ignore_index=True)
features = features.merge(df[["location_id", "timestamp", "pm25"]], on=["location_id", "timestamp"], how="left")

# dataset ต่อ horizon: target = pm25 ณ d+h (features ยังคงเป็นของวัน d)
datasets = {}
for h in [1, 2, 3]:
    t = features.copy()
    t["target"] = t.groupby("location_id")["pm25"].shift(-h)
    t = t.dropna(subset=["target"])
    datasets[h] = t

FEATS = [c for c in features.columns if c not in ("timestamp", "location_id", "pm25", "target")]
print(f"features: {len(FEATS)} ตัว | แถวต่อ horizon: " + ", ".join(f"h{h}={len(t)}" for h, t in datasets.items()))

VAL_START, TEST_START = pd.Timestamp("2026-04-01"), pd.Timestamp("2026-07-01")

def split(t):
    tr = t[t["timestamp"] < VAL_START]
    va = t[(t["timestamp"] >= VAL_START) & (t["timestamp"] < TEST_START)]
    te = t[t["timestamp"] >= TEST_START]
    return tr, va, te

def metrics(y, p):
    e = np.abs(np.asarray(y, float) - np.asarray(p, float))
    return {
        "n": len(e), "MAE": round(float(e.mean()), 2),
        "RMSE": round(float(np.sqrt((e ** 2).mean())), 2),
        "R2": round(float(r2_score(y, p)), 3),
        "±2%": round(100 * (e <= 2).mean(), 1),
        "±5%": round(100 * (e <= 5).mean(), 1),
        "±10%": round(100 * (e <= 10).mean(), 1),
    }

def make_models(seed=42):
    return {
        "hgb": lambda: HistGradientBoostingRegressor(max_iter=300, learning_rate=0.06, max_leaf_nodes=31, l2_regularization=1.0, random_state=seed),
        "xgb": lambda: XGBRegressor(n_estimators=400, learning_rate=0.05, max_depth=6, subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0, random_state=seed, n_jobs=-1, verbosity=0),
    }

best = {}
report = {}
for h in [1, 2, 3]:
    tr, va, te = split(datasets[h])
    X_tr, y_tr = tr[FEATS], tr["target"]
    X_va, y_va = va[FEATS], va["target"]
    X_te, y_te = te[FEATS], te["target"]

    # เลือกโมเดลบน VALIDATION เท่านั้น (ห้ามแอบดู test)
    scores = {}
    for name, factory in make_models().items():
        m = factory().fit(X_tr, y_tr)
        scores[name] = m, mean_absolute_error(y_va, m.predict(X_va))
    name_best, (model, va_mae) = min(scores.items(), key=lambda kv: kv[1][1])
    # persistence บน val (lag_1) เปรียบเทียบ — กรองแถวที่ lag เป็น NaN (วันห่างของสถานี)
    per_mask = np.isfinite(X_va["lag_1"]) & np.isfinite(y_va)
    per_val = mean_absolute_error(np.asarray(y_va)[per_mask], np.asarray(X_va["lag_1"])[per_mask])

    # ขั้นปรับปรุง (เลือกบน validation เท่านั้น): blend ML × persistence ที่น้ำหนักต่างกัน
    # lag_1 เป็น NaN (วันห่าง) → blend fallback เป็นค่า ML เพื่อไม่มีแถวหาย
    ml_va = model.predict(X_va)
    va_lag = np.asarray(X_va["lag_1"], float)
    va_lag = np.where(np.isfinite(va_lag), va_lag, ml_va)
    blend_candidates = {"ml": (ml_va, va_mae)}
    for w in [0.7, 0.5, 0.3]:
        blended = w * ml_va + (1 - w) * va_lag
        blend_candidates[f"blend{int(w*100)}"] = (blended, mean_absolute_error(y_va, blended))
    chosen_name, (chosen_val_pred, chosen_val_mae) = min(blend_candidates.items(), key=lambda kv: kv[1][1])

    # ผลจริงบน holdout (รายงานครั้งเดียว ไม่ใช้จูนต่อ)
    ml_te = model.predict(X_te)
    if chosen_name == "ml":
        te_pred = ml_te
    else:
        w = int(chosen_name.replace("blend", "")) / 100
        te_lag = np.asarray(X_te["lag_1"], float)
        te_lag = np.where(np.isfinite(te_lag), te_lag, ml_te)
        te_pred = w * ml_te + (1 - w) * te_lag
    te_m = metrics(y_te, te_pred)
    per_mask_te = np.isfinite(X_te["lag_1"]) & np.isfinite(y_te)
    te_per = metrics(np.asarray(y_te)[per_mask_te], np.asarray(X_te["lag_1"])[per_mask_te])
    report[f"h{h}"] = {
        "model": name_best, "chosen_variant": chosen_name, "val_MAE": round(va_mae, 2),
        "val_persistence_MAE": round(per_val, 2), "val_chosen_MAE": round(chosen_val_mae, 2),
        "holdout_model": te_m, "holdout_persistence": te_per,
    }
    best[h] = {"model": model, "model_name": name_best, "features": FEATS, "blend": chosen_name}
    print(f"h={h}: {name_best} + variant={chosen_name} (val MAE {chosen_val_mae:.2f} vs persistence {per_val:.2f})")

joblib.dump({
    "version": "ml-local-v3.0",
    "models": {h: best[h]["model"] for h in best},
    "model_names": {h: best[h]["model_name"] for h in best},
    "blend": {h: best[h]["blend"] for h in best},
    "features": FEATS,
    "trained_at": pd.Timestamp.utcnow().isoformat(),
    "training_rows": {h: int(len(datasets[h][datasets[h]["timestamp"] < VAL_START])) for h in datasets},
    "metric_note": "primary = hit rate ±2 µg/m³; ±5/MAE/R² รายงานควบคู่; holdout 2026-07-01→09-30",
}, OUT)
print(f"\nบันทึกโมเดล: {OUT}")
print("\n===== รายงานสรุป (holdout 2026-07-01→09-30) =====")
for h in [1, 2, 3]:
    r = report[f"h{h}"]
    hm, hp = r["holdout_model"], r["holdout_persistence"]
    print(f"h={h} [{r['model']}/{r['chosen_variant']}] ML: ±2={hm['±2%']}% ±5={hm['±5%']}% MAE={hm['MAE']} R2={hm['R2']} || persistence: ±2={hp['±2%']}% ±5={hp['±5%']}% MAE={hp['MAE']}")
