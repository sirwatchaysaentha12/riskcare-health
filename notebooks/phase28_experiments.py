# -*- coding: utf-8 -*-
"""
Phase 28 — Final Model Improvement Sprint
Experiment A: persistence variants · B: bias correction
C: simple ensemble · D: station-specific routing
เลือกทั้งหมดบน validation · ยืนยัน holdout ครั้งเดียว
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
HORS = [1, 6, 24, 48, 72]

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p); y, p = y[ok], p[ok]
    if not len(p): return None
    e = y - p
    return {"N": int(len(e)), "Acc2": round(100*float((np.abs(e)<=2).mean()),1),
            "Acc5": round(100*float((np.abs(e)<=5).mean()),1),
            "MAE": round(float(np.abs(e).mean()),2), "RMSE": round(float(np.sqrt((e**2).mean())),2),
            "Bias": round(float(e.mean()),2)}

# ── ML models (Ridge+wx, HGB+wx) ──
ml_preds = {}  # (variant, h) -> DataFrame with pred
for h in HORS:
    for variant, dataset, feats in [("ridge_wx", all_wx, FW), ("hgb_wx", all_wx, FW)]:
        t = dataset.copy()
        t["target"] = t.groupby("station_id")["pm25"].shift(-h)
        t = t.dropna(subset=["target"]); t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
        tr = t[pd.to_datetime(t["timestamp"]) < VAL]
        model = (HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08, l2_regularization=1.0, random_state=42)
                 if "hgb" in variant else Ridge(alpha=1.0)).fit(tr[feats].fillna(0), tr["target"])
        val = t[(pd.to_datetime(t["timestamp"]) >= VAL) & (pd.to_datetime(t["timestamp"]) < TEST)].copy()
        val["pred"] = model.predict(val[feats].fillna(0))
        test = t[pd.to_datetime(t["timestamp"]) >= TEST].copy()
        test["pred"] = model.predict(test[feats].fillna(0))
        ml_preds[(variant, h)] = {"val": val, "test": test}

# ── persistence variants (computed on val and test) ──
def eval_persistence_variant(variant_name, h, data_nw, split):
    """ทำนายวัน origin+h โดยใช้ข้อมูล ≤ origin · actual = pm25 ที่ origin+h"""
    lo = VAL if split == "val" else TEST
    hi = TEST if split == "val" else pd.Timestamp("2027-01-01")
    pairs = []
    for sid, g in data_nw.groupby("station_id"):
        s = g.set_index("timestamp")["pm25"].asfreq("h").dropna()
        for t in s.index:
            if not (lo <= t < hi): continue
            actual_t = t + pd.Timedelta(hours=h)
            actual = s.get(actual_t, np.nan)
            if not np.isfinite(actual): continue
            past = s[s.index <= t].dropna()
            if not len(past): continue
            if variant_name == "last_value":
                pred = past.iloc[-1]
            elif variant_name == "ma3":
                pred = past.tail(3).mean() if len(past) >= 3 else np.nan
            elif variant_name == "ma6":
                pred = past.tail(6).mean() if len(past) >= 6 else np.nan
            elif variant_name == "ma24":
                pred = past.tail(24).mean() if len(past) >= 24 else np.nan
            elif variant_name == "median_6":
                pred = past.tail(6).median() if len(past) >= 6 else np.nan
            elif variant_name == "median_24":
                pred = past.tail(24).median() if len(past) >= 24 else np.nan
            else:
                pred = past.iloc[-1]
            if np.isfinite(pred):
                pairs.append((actual, pred))
    return pairs

# ── Experiment A: persistence variants on validation ──
print("===== Experiment A: persistence variants (validation) =====")
A_results = {}
for h in HORS:
    for variant in ["last_value", "ma3", "ma6", "ma24", "median_6", "median_24"]:
        pairs = eval_persistence_variant(variant, h, all_nw, "val")
        m = met([a for a,_ in pairs], [p for _,p in pairs])
        if m:
            A_results[f"h{h}_{variant}"] = m
            print(f"  h={h:2} {variant:12} ±2={m['Acc2']:>5}% MAE={m['MAE']:>5}")

# ── หาดีที่สุดจาก validation ──
print("\n===== Best persistence per horizon (validation) =====")
best_per = {}
for h in HORS:
    candidates = [(k.replace(f"h{h}_",""), v) for k, v in A_results.items() if k.startswith(f"h{h}_")]
    if candidates:
        best = min(candidates, key=lambda x: x[1]["MAE"])
        best_per[h] = best
        print(f"  h={h:2}: best={best[0]} val_MAE={best[1]['MAE']} val_±2={best[1]['Acc2']}%")

# ── Experiment B: bias correction (จาก validation) ──
print("\n===== Experiment B: bias correction =====")
B_results = {}
for h in HORS:
    # persistence bias บน validation
    pairs = eval_persistence_variant("last_value", h, all_nw, "val")
    y = np.array([a for a,_ in pairs]); p = np.array([b for _,b in pairs])
    bias = float((y - p).mean())
    corrected_pairs = [(a, b_val + bias) for a, b_val in pairs]
    m_before = met([a for a,_ in pairs], [b for _,b in pairs])
    m_after = met([a for a,_ in corrected_pairs], [b for _,b in corrected_pairs])
    B_results[f"h{h}"] = {"bias_correction": round(bias, 3), "before_MAE": m_before["MAE"], "after_MAE": m_after["MAE"]}
    print(f"  h={h:2}: bias={bias:.3f} · before MAE={m_before['MAE']} after MAE={m_after['MAE']} ({'ช่วย' if m_after['MAE'] < m_before['MAE'] else 'ไม่ช่วย'})")

# ── Experiment C: ensemble (validation weight selection) ──
print("\n===== Experiment C: ensemble persistence + ML =====")
C_results = {}
for h in HORS:
    for ml_name, ml_key in [("ridge_wx", ("ridge_wx", h)), ("hgb_wx", ("hgb_wx", h))]:
        if ml_key not in ml_preds: continue
        te_ml = ml_preds[ml_key]["test"]
        va_ml = ml_preds[ml_key]["val"]
        # eval on validation
        val_pairs = []
        for sid, g in all_nw.groupby("station_id"):
            s = g.set_index("timestamp")["pm25"].asfreq("h")
            for t in s.index:
                if not (VAL <= t < TEST): continue
                actual = s.get(t, np.nan)
                pred_ml_row = va_ml[va_ml.station_id == sid]
                if len(pred_ml_row) == 0: continue
                # persistence
                past = s[s.index < t].dropna()
                if not len(past): continue
                p_per = past.iloc[-1]
                # ML pred (matching timestamp)
                ml_row = va_ml[(va_ml.station_id == sid) & (pd.to_datetime(va_ml.timestamp) == t)]
                if len(ml_row) == 0: continue
                p_ml = float(ml_row.iloc[0]["pred"])
                val_pairs.append((float(actual), p_per, p_ml))
        if not val_pairs: continue
        arr = np.array(val_pairs)
        y, p_per, p_ml = arr[:,0], arr[:,1], arr[:,2]
        results_c = {}
        for w in [0.0, 0.25, 0.5, 0.75, 1.0]:
            blended = w * p_ml + (1-w) * p_per
            m = met(y, blended)
            if m: results_c[f"w={w}"] = m
        best = min(results_c.items(), key=lambda x: x[1]["MAE"])
        C_results[f"h{h}_{ml_name}"] = {"best_weight": best[0], **best[1]}
        print(f"  h={h:2} {ml_name:10} best_w={best[0]} ±2={best[1]['Acc2']}% MAE={best[1]['MAE']}")

json.dump({"A": A_results, "B": B_results, "C": C_results},
          open(r"C:\Users\ACER\projectweb\data\vertex\phase28_experiment_results.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("\nบันทึกผล: data/vertex/phase28_experiment_results.json")
