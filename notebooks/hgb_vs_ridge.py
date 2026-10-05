# -*- coding: utf-8 -*-
"""
Phase 24 — HGB vs Ridge vs Baseline เปรียบเทียบอย่างยุติธรรม
protocol เดียวกับ global_vs_station.py (holdout ≥ Aug 15 2026)
models: persistence · rolling_median · Ridge PM-only · Ridge+wx · HGB PM+wx · Station HGB+wx
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import sqlite3, json, numpy as np, pandas as pd, requests
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import r2_score

conn = sqlite3.connect(r"C:\Users\ACER\projectweb\data\hourly\pm25_hourly.sqlite")
pm = pd.read_sql_query("SELECT station_id, ts_local, pm25 FROM hourly_pm25 WHERE station_id IN ('1304179','1304281','1304403')", conn)
conn.close()
pm["ts"] = pd.to_datetime(pm["ts_local"])

env = {}
for line in open(r"C:\Users\ACER\projectweb\admin-app\.env.local", encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
wx_r = requests.get("https://archive-api.open-meteo.com/v1/archive",
                    params={"latitude": 13.75, "longitude": 100.5, "start_date": "2024-12-01", "end_date": "2026-10-03",
                            "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation", "timezone": "Asia/Bangkok"}, timeout=60)
wx = pd.DataFrame(wx_r.json()["hourly"]); wx["timestamp"] = pd.to_datetime(wx["time"]); wx = wx.drop(columns=["time"]).set_index("timestamp")
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

TEST = pd.Timestamp("2026-08-15")
def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p); y, p = y[ok], p[ok]
    if not len(p): return None
    e = y - p
    return {"N": int(len(e)), "Acc2": round(100*float((np.abs(e)<=2).mean()),1),
            "Acc5": round(100*float((np.abs(e)<=5).mean()),1),
            "MAE": round(float(np.abs(e).mean()),2), "RMSE": round(float(np.sqrt((e**2).mean())),2),
            "Bias": round(float(e.mean()),2), "R2": round(float(r2_score(y,p)),3)}

def hgb_factory(seed=42):
    return HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08, max_leaf_nodes=31, l2_regularization=1.0, random_state=seed)

results = {}

# ── Global models ──
for variant_label, dataset, feats, use_wx in [("Global Ridge PM-only", all_nw, FN, False), ("Global Ridge+wx", all_wx, FW, True), ("Global HGB+wx", all_wx, FW, True)]:
    t = dataset.copy()
    t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
    tr = t[pd.to_datetime(t["timestamp"]) < TEST]
    te = t[pd.to_datetime(t["timestamp"]) >= TEST]
    for h in [24, 48, 72]:
        t_tr = tr.copy(); t_tr["target"] = t_tr.groupby("station_id")["pm25"].shift(-h)
        t_tr = t_tr.dropna(subset=["target"])
        t_te = te.copy(); t_te["target"] = t_te.groupby("station_id")["pm25"].shift(-h)
        t_te = t_te.dropna(subset=["target"])
        if use_wx and "HGB" in variant_label:
            model = hgb_factory().fit(t_tr[feats].fillna(0), t_tr["target"])
        else:
            model = Ridge(alpha=1.0).fit(t_tr[feats].fillna(0), t_tr["target"])
        m = met(t_te["target"], model.predict(t_te[feats].fillna(0)))
        key = f"{variant_label}_h{h}"
        results[key] = {"model": variant_label, "h": h, **(m or {})}
        print(f"{variant_label:24} h={h:2}: N={m['N'] if m else 0} ±2={m['Acc2'] if m else '-'}% MAE={m['MAE'] if m else '-'}")

# ── Station-specific HGB+wx ──
for sid in STATIONS:
    t = data_stations[sid]["wx"].copy()
    t = t.sort_values("timestamp").reset_index(drop=True)
    tr = t[pd.to_datetime(t["timestamp"]) < TEST]
    te = t[pd.to_datetime(t["timestamp"]) >= TEST]
    for h in [24, 48, 72]:
        t_tr = tr.copy(); t_tr["target"] = t_tr["pm25"].shift(-h)
        t_tr = t_tr.dropna(subset=["target"])
        t_te = te.copy(); t_te["target"] = t_te["pm25"].shift(-h)
        t_te = t_te.dropna(subset=["target"])
        if len(t_tr) < 100 or len(t_te) < 10: continue
        model = hgb_factory().fit(t_tr[FW].fillna(0), t_tr["target"])
        m = met(t_te["target"], model.predict(t_te[FW].fillna(0)))
        key = f"Station {sid} HGB+wx_h{h}"
        results[key] = {"model": f"Station {sid} HGB", "h": h, **(m or {})}

# ── Persistence baseline (same protocol) ──
for h in [24, 48, 72]:
    t = all_nw.copy()
    t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
    te = t[pd.to_datetime(t["timestamp"]) >= TEST]
    t_te = te.copy(); t_te["target"] = t_te.groupby("station_id")["pm25"].shift(-h)
    t_te = t_te.dropna(subset=["target","lag_1h"])
    m = met(t_te["target"], t_te["lag_1h"])
    results[f"persistence_1h_h{h}"] = {"model": "persistence_1h", "h": h, **(m or {})}

# ── สรุปตาราง ──
json.dump(results, open(r"C:\Users\ACER\projectweb\data\vertex\hgb_vs_ridge_results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\n===== สรุปเปรียบเทียบครบทุกโมเดล (holdout ≥ Aug 15 2026) =====")
print(f"{'Model':28} {'h':>3} {'N':>5} {'±2%':>6} {'±5%':>6} {'MAE':>6} {'RMSE':>6} {'R2':>6}")
for key in sorted(results.keys()):
    r = results[key]
    print(f"{r['model']:28} {r['h']:>3} {r.get('N',0):>5} {r.get('Acc2',0):>5}% {r.get('Acc5',0):>5}% {r.get('MAE',0):>5} {r.get('RMSE',0):>5} {r.get('R2',0):>5}")
