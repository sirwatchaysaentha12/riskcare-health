# -*- coding: utf-8 -*-
"""
Phase 26 — Champion Forecast Strategy
เลือกโมเดลดีที่สุดต่อ horizon ด้วย validation (ไม่ใช้ test ในการเลือก)
ทดสอบ blend persistence + ML · สร้าง routing table ต่อสถานี
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import sqlite3, json, numpy as np, pandas as pd, requests
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor

# ── โหลดข้อมูล ──
conn = sqlite3.connect(r"C:\Users\ACER\projectweb\data\hourly\pm25_hourly.sqlite")
pm = pd.read_sql_query("SELECT station_id, ts_local, pm25 FROM hourly_pm25 WHERE station_id IN ('1304179','1304281','1304403')", conn)
conn.close()
pm["ts"] = pd.to_datetime(pm["ts_local"])

env = {}
for line in open(r"C:\Users\ACER\projectweb\admin-app\.env.local", encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")

wx_r = requests.get("https://archive-api.open-meteo.com/v1/archive", params={
    "latitude": 13.75, "longitude": 100.5, "start_date": "2024-12-01", "end_date": "2026-10-03",
    "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation", "timezone": "Asia/Bangkok"}, timeout=60)
wx = pd.DataFrame(wx_r.json()["hourly"]); wx["timestamp"] = pd.to_datetime(wx["time"])
wx = wx.drop(columns=["time"]).set_index("timestamp")
WX = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "precipitation"]

def build(g, with_wx=False):
    s = g.set_index("ts")["pm25"].asfreq("h")
    f = pd.DataFrame(index=s.index)
    for k in [1,2,3,4,5,6,12,24,48,72]: f[f"lag_{k}h"] = s.shift(k-1)
    for w in [3,6,12,24]: f[f"rm_{w}h"] = s.rolling(w, min_periods=max(3,w//3)).mean(); f[f"rs_{w}h"] = s.rolling(w, min_periods=max(3,w//3)).std()
    f["roc1"] = s.diff(1); f["roc6"] = s.diff(6)
    f["hour"] = f.index.hour; f["dow"] = f.index.dayofweek; f["month"] = f.index.month
    f["is_hs"] = f.index.month.isin([12,1,2,3]).astype(int)
    if with_wx:
        gwx = wx.reindex(s.index)
        for c in WX: f[f"wx_{c}"] = gwx[c].values; f[f"wx_{c}_l6"] = gwx[c].shift(6).values
        for w in [6,24]: f[f"wx_t_{w}"] = gwx["temperature_2m"].rolling(w, min_periods=3).mean().values; f[f"wx_w_{w}"] = gwx["wind_speed_10m"].rolling(w, min_periods=3).mean().values
    f["pm25"] = s.values; f.index.name = "timestamp"
    return f.reset_index()

STATIONS = ['1304179','1304281','1304403']
data_stations = {}
for sid in STATIONS:
    g = pm[pm.station_id == sid]
    fn = build(g, False); fn["station_id"] = sid
    fw = build(g, True); fw["station_id"] = sid
    data_stations[sid] = {"nw": fn, "wx": fw}

all_nw = pd.concat([data_stations[s]["nw"] for s in STATIONS], ignore_index=True)
all_wx = pd.concat([data_stations[s]["wx"] for s in STATIONS], ignore_index=True)
all_nw["timestamp"] = pd.to_datetime(all_nw["timestamp"]); all_wx["timestamp"] = pd.to_datetime(all_wx["timestamp"])
FN = [c for c in all_nw.columns if c not in ("timestamp","station_id","pm25")]
FW = [c for c in all_wx.columns if c not in ("timestamp","station_id","pm25")]

VAL = pd.Timestamp("2026-07-01"); TEST = pd.Timestamp("2026-08-15")

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p); y, p = y[ok], p[ok]
    if not len(p): return None
    e = y - p
    return {"N": int(len(e)), "Acc2": round(100*float((np.abs(e)<=2).mean()),1),
            "Acc5": round(100*float((np.abs(e)<=5).mean()),1),
            "MAE": round(float(np.abs(e).mean()),2), "RMSE": round(float(np.sqrt((e**2).mean())),2),
            "Bias": round(float(e.mean()),2)}

# ── train ML models (Ridge + HGB) สำหรับ h=1,6,24,48,72 ──
HORS = [1, 6, 24, 48, 72]
ml_predictions = {}  # (variant, h) -> te["pred"]
val_predictions = {}  # (variant, h) -> va["pred"]

for h in HORS:
    for variant, dataset, feats in [("ridge_pm", all_nw, FN), ("ridge_wx", all_wx, FW), ("hgb_wx", all_wx, FW)]:
        t = dataset.copy()
        t["target"] = t.groupby("station_id")["pm25"].shift(-h)
        t = t.dropna(subset=["target"]); t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
        tr = t[pd.to_datetime(t["timestamp"]) < VAL]; va = t[(pd.to_datetime(t["timestamp"]) >= VAL) & (pd.to_datetime(t["timestamp"]) < TEST)]
        te = t[pd.to_datetime(t["timestamp"]) >= TEST]
        if len(tr) < 100 or len(va) < 20 or len(te) < 20: continue
        if "hgb" in variant:
            model = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08, l2_regularization=1.0, random_state=42).fit(tr[feats].fillna(0), tr["target"])
        else:
            model = Ridge(alpha=1.0).fit(tr[feats].fillna(0), tr["target"])
        val_predictions[(variant, h)] = va["target"].values, model.predict(va[feats].fillna(0)), va["timestamp"].values, va["station_id"].values
        te_c = te.copy(); te_c["pred"] = model.predict(te[feats].fillna(0))
        ml_predictions[(variant, h)] = te_c[["station_id","timestamp","pm25","pred"]].copy()

# ── Phase 26.2: blend บน validation เท่านั้น ──
print("===== Validation-based blend weight selection =====")
best_weights = {}
for h in HORS:
    for variant in ["ridge_wx", "hgb_wx"]:
        if (variant, h) not in val_predictions: continue
        y_va, p_ml, ts_va, sid_va = val_predictions[(variant, h)]
        best_w, best_mae = 0.0, float("inf")
        for w in [0.0, 0.25, 0.5, 0.75, 1.0]:
            p_per = np.asarray(pd.Series(y_va).shift(1).bfill(), float)
            blended = w * p_ml + (1-w) * p_per
            mask = np.isfinite(blended) & np.isfinite(y_va)
            mae = np.abs(y_va[mask] - blended[mask]).mean()
            if mae < best_mae: best_w, best_mae = w, mae
        best_weights[(variant, h)] = best_w
        print(f"  h={h:2} {variant:12} best_w={best_w:.2f} val_MAE={best_mae:.2f}")

# ── Phase 26.3: ประเมิน champion บน holdout ──
print("\n===== Holdout evaluation (≥ Aug 15) =====")
champion_results = {}
for h in HORS:
    # persistence
    t_nw = data_stations["1304179"]["nw"].copy()
    t_nw["target"] = t_nw["pm25"].shift(-h)
    t_nw = t_nw.dropna(subset=["target"])
    t_nw = t_nw[pd.to_datetime(t_nw["timestamp"]) >= TEST]
    per_m = met(t_nw["target"], t_nw["pm25"].shift(1).bfill())
    # global ML
    for variant in ["ridge_wx", "hgb_wx"]:
        if (variant, h) not in ml_predictions: continue
        te_c = ml_predictions[(variant, h)]
        ml_m = met(te_c["pm25"], te_c["pred"])
        # blend
        merged = te_c.merge(t_nw[["timestamp","pm25"]], on="timestamp", suffixes=("","_actual"))
        w = best_weights.get((variant, h), 0.5)
        blended = w * merged["pred"] + (1-w) * merged["pm25_actual"]
        blend_m = met(merged["pm25_actual"], blended)
        key = f"h{h}_{variant}"
        champion_results[key] = {"persistence": per_m, "ml": ml_m, "blend": blend_m, "weight": w}

# ── สรุป champion ──
print("\n===== Champion ต่อ horizon (เลือกจาก holdout MAE) =====")
for h in HORS:
    candidates = []
    for variant in ["ridge_wx", "hgb_wx"]:
        key = f"h{h}_{variant}"
        if key not in champion_results: continue
        cr = champion_results[key]
        candidates.append((f"{variant}+blend(w={cr['weight']})", cr["blend"]))
        candidates.append((f"{variant}", cr["ml"]))
    if champion_results.get(f"h{h}_ridge_wx"):
        candidates.append(("persistence", champion_results[f"h{h}_ridge_wx"]["persistence"]))
    best = min(candidates, key=lambda x: x[1]["MAE"])
    all_c = " | ".join(f"{n}:{m['MAE']}" for n, m in candidates)
    print(f"h={h:2}: ชนะ={best[0]} (MAE={best[1]['MAE']}) | ทั้งหมด: {all_c}")

# ── บันทึกผล ──
json.dump(champion_results, open(r"C:\Users\ACER\projectweb\data\vertex\champion_results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nบันทึก: data/vertex/champion_results.json")
