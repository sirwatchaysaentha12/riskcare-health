# -*- coding: utf-8 -*-
"""
Phase 31 — Accuracy@±2/±3/±4/±5 µg/m³ สำหรับทุกโมเดลบน holdout
protocol เดียวกับ Phase 18 (holdout ≥ Aug 15 2026 · time-based split)
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

TEST = pd.Timestamp("2026-08-15")
HORS = [1, 6, 24, 48, 72]

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p); y, p = y[ok], p[ok]
    if not len(p): return None
    e = np.abs(y - p)
    return {"N": int(len(e)),
            "±2": round(100*float((e<=2).mean()),1),
            "±3": round(100*float((e<=3).mean()),1),
            "±4": round(100*float((e<=4).mean()),1),
            "±5": round(100*float((e<=5).mean()),1),
            "MAE": round(float(e.mean()),2),
            "RMSE": round(float(np.sqrt((e**2).mean())),2),
            "Bias": round(float((y - p).mean()),2)}

# ═══ Train models + evaluate on holdout ═══
all_results = {}

for h in HORS:
    # ── persistence ──
    per_pairs = []
    for sid in STATIONS:
        s = all_nw[all_nw.station_id == sid].set_index("timestamp")["pm25"]
        for t in s.index:
            if t < TEST: continue
            pt = t - pd.Timedelta(hours=h)
            if pt in s.index and np.isfinite(s[pt]) and np.isfinite(s[t]):
                per_pairs.append((s[t], s[pt]))
    y_vals = [a for a, b in per_pairs]; p_vals = [b for _, b in per_pairs]
    m = met(y_vals, p_vals)
    if m:
        all_results[f"persistence_h{h}"] = {"model": "persistence", "h": h, **m}
        print(f"persistence h={h:2}: ±2={m['±2']}% ±3={m['±3']}% ±4={m['±4']}% ±5={m['±5']}% MAE={m['MAE']} N={m['N']}")

    # ── Ridge PM-only ──
    t = all_nw.copy()
    t["target"] = t.groupby("station_id")["pm25"].shift(-h)
    t = t.dropna(subset=["target"]); t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
    tr = t[pd.to_datetime(t["timestamp"]) < TEST]; te = t[pd.to_datetime(t["timestamp"]) >= TEST]
    model = Ridge(alpha=1.0).fit(tr[FN].fillna(0), tr["target"])
    m = met(te["target"], model.predict(te[FN].fillna(0)))
    if m:
        all_results[f"ridge_pm_h{h}"] = {"model": "Ridge PM-only", "h": h, **m}
        print(f"ridge_pm  h={h:2}: ±2={m['±2']}% ±3={m['±3']}% ±4={m['±4']}% ±5={m['±5']}% MAE={m['MAE']} N={m['N']}")

    # ── Ridge+wx ──
    t = all_wx.copy()
    t["target"] = t.groupby("station_id")["pm25"].shift(-h)
    t = t.dropna(subset=["target"]); t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
    tr = t[pd.to_datetime(t["timestamp"]) < TEST]; te = t[pd.to_datetime(t["timestamp"]) >= TEST]
    model = Ridge(alpha=1.0).fit(tr[FW].fillna(0), tr["target"])
    m = met(te["target"], model.predict(te[FW].fillna(0)))
    if m:
        all_results[f"ridge_wx_h{h}"] = {"model": "Ridge+wx", "h": h, **m}
        print(f"ridge_wx  h={h:2}: ±2={m['±2']}% ±3={m['±3']}% ±4={m['±4']}% ±5={m['±5']}% MAE={m['MAE']} N={m['N']}")

    # ── HGB+wx ──
    model = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08, l2_regularization=1.0, random_state=42).fit(tr[FW].fillna(0), tr["target"])
    m = met(te["target"], model.predict(te[FW].fillna(0)))
    if m:
        all_results[f"hgb_wx_h{h}"] = {"model": "HGB+wx", "h": h, **m}
        print(f"hgb_wx    h={h:2}: ±2={m['±2']}% ±3={m['±3']}% ±4={m['±4']}% ±5={m['±5']}% MAE={m['MAE']} N={m['N']}")

    # ── Station-specific HGB+wx ──
    all_wx["target"] = all_wx.groupby("station_id")["pm25"].shift(-h)
    for sid in STATIONS:
        ts_data = all_wx[all_wx.station_id == sid]
        tr_s = ts_data[pd.to_datetime(ts_data["timestamp"]) < TEST].dropna(subset=["target"])
        te_s = ts_data[pd.to_datetime(ts_data["timestamp"]) >= TEST]
        if len(tr_s) < 50 or len(te_s) < 10: continue
        model = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08, l2_regularization=1.0, random_state=42).fit(tr_s[FW].fillna(0), tr_s["target"])
        m = met(te_s["target"], model.predict(te_s[FW].fillna(0)))
        if m:
            all_results[f"station_{sid}_h{h}"] = {"model": f"Station {sid} HGB", "h": h, **m}

    # ── Station-specific Ridge ──
    for sid in STATIONS:
        ts_data = all_wx[all_wx.station_id == sid]
        tr_s = ts_data[pd.to_datetime(ts_data["timestamp"]) < TEST].dropna(subset=["target"])
        te_s = ts_data[pd.to_datetime(ts_data["timestamp"]) >= TEST]
        if len(tr_s) < 50 or len(te_s) < 10: continue
        model = Ridge(alpha=1.0).fit(tr_s[FW].fillna(0), tr_s["target"])
        m = met(te_s["target"], model.predict(te_s[FW].fillna(0)))
        if m:
            all_results[f"station_ridge_{sid}_h{h}"] = {"model": f"Station {sid} Ridge", "h": h, **m}

json.dump(all_results, open(r"C:\Users\ACER\projectweb\data\vertex\accuracy_thresholds.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nบันทึก: data/vertex/accuracy_thresholds.json")
