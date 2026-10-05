# -*- coding: utf-8 -*-
"""
Phase 23 — เปรียบเทียบ 3 โมเดล: Global PM-only, Global PM+wx, Station-specific PM+wx
Protocol: direct multi-horizon (h=24/48/72) · time-based split · ไม่มี leakage
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import sqlite3, json, numpy as np, pandas as pd, requests
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor

# ── โหลดข้อมูล + weather ──
conn = sqlite3.connect(r"C:\Users\ACER\projectweb\data\hourly\pm25_hourly.sqlite")
pm = pd.read_sql_query("SELECT station_id, ts_local, pm25 FROM hourly_pm25 WHERE station_id IN ('1304179','1304281','1304403')", conn)
conn.close()
pm["ts"] = pd.to_datetime(pm["ts_local"])

env = {}
for line in open(r"C:\Users\ACER\projectweb\admin-app\.env.local", encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
H = {"X-API-Key": env["OPENAQ_API_KEY"]}
wx_r = requests.get("https://archive-api.open-meteo.com/v1/archive", params={
    "latitude": 13.75, "longitude": 100.5, "start_date": "2024-12-01", "end_date": "2026-10-03",
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

STATIONS = ['1304179', '1304281', '1304403']
data_stations = {}
for sid in STATIONS:
    g = pm[pm.station_id == sid]
    fn = build(g, False); fn["station_id"] = sid
    fw = build(g, True); fw["station_id"] = sid
    data_stations[sid] = {"nw": fn, "wx": fw}

# merge weather รวม (global)
all_nw = pd.concat([data_stations[s]["nw"] for s in STATIONS], ignore_index=True)
all_wx = pd.concat([data_stations[s]["wx"] for s in STATIONS], ignore_index=True)
all_nw["timestamp"] = pd.to_datetime(all_nw["timestamp"]); all_wx["timestamp"] = pd.to_datetime(all_wx["timestamp"])
FN = [c for c in all_nw.columns if c not in ("timestamp","station_id","pm25")]
FW = [c for c in all_wx.columns if c not in ("timestamp","station_id","pm25")]

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p); y, p = y[ok], p[ok]
    if not len(p): return None
    e = y - p
    return {"N": int(len(e)), "Acc2": round(100*float((np.abs(e)<=2).mean()),1),
            "Acc5": round(100*float((np.abs(e)<=5).mean()),1),
            "MAE": round(float(np.abs(e).mean()),2), "RMSE": round(float(np.sqrt((e**2).mean())),2),
            "Bias": round(float(e.mean()),2)}

VAL = pd.Timestamp("2026-07-01"); TEST = pd.Timestamp("2026-08-15")
results = {}

# ── Model 1: Global PM-only ──
for h in [24, 48, 72]:
    t = all_nw.copy(); t["target"] = t.groupby("station_id")["pm25"].shift(-h)
    t = t.dropna(subset=["target"]); t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
    tr = t[pd.to_datetime(t["timestamp"]) < TEST]; te = t[pd.to_datetime(t["timestamp"]) >= TEST]
    model = Ridge(alpha=1.0).fit(tr[FN].fillna(0), tr["target"])
    m = met(te["target"], model.predict(te[FN].fillna(0)))
    results[f"global_pm_h{h}"] = {"model": "Global PM-only", "h": h, **(m or {})}
    print(f"Global PM-only h={h}: N={m['N'] if m else 0} ±2={m['Acc2'] if m else '-'}% MAE={m['MAE'] if m else '-'}")

# ── Model 2: Global PM+weather ──
for h in [24, 48, 72]:
    t = all_wx.copy(); t["target"] = t.groupby("station_id")["pm25"].shift(-h)
    t = t.dropna(subset=["target"]); t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
    tr = t[pd.to_datetime(t["timestamp"]) < TEST]; te = t[pd.to_datetime(t["timestamp"]) >= TEST]
    model = Ridge(alpha=1.0).fit(tr[FW].fillna(0), tr["target"])
    m = met(te["target"], model.predict(te[FW].fillna(0)))
    results[f"global_wx_h{h}"] = {"model": "Global PM+wx", "h": h, **(m or {})}
    print(f"Global PM+wx  h={h}: N={m['N'] if m else 0} ±2={m['Acc2'] if m else '-'}% MAE={m['MAE'] if m else '-'}")

# ── Model 3: Station-specific PM+weather ──
for sid in STATIONS:
    for h in [24, 48, 72]:
        t = data_stations[sid]["wx"].copy()
        t["target"] = t["pm25"].shift(-h)
        t = t.dropna(subset=["target"]); t = t.sort_values("timestamp").reset_index(drop=True)
        tr = t[pd.to_datetime(t["timestamp"]) < TEST]
        te = t[pd.to_datetime(t["timestamp"]) >= TEST]
        if len(tr) < 100 or len(te) < 10:
            print(f"Station {sid} h={h}: insufficient (train={len(tr)}, test={len(te)})")
            continue
        model = Ridge(alpha=1.0).fit(tr[FW].fillna(0), tr["target"])
        m = met(te["target"], model.predict(te[FW].fillna(0)))
        results[f"station_{sid}_h{h}"] = {"model": f"Station {sid}", "h": h, **(m or {})}
        print(f"Station {sid}    h={h}: N={m['N'] if m else 0} ±2={m['Acc2'] if m else '-'}% MAE={m['MAE'] if m else '-'}")

# ── สรุปตาราง ──
print("\n===== ตารางสรุป h=24/48/72 =====")
print(f"{'Model':28} {'h':>3} {'N':>5} {'±2%':>6} {'±5%':>6} {'MAE':>6} {'RMSE':>6} {'Bias':>6}")
for key in sorted(results.keys()):
    r = results[key]
    print(f"{r['model']:28} {r['h']:>3} {r.get('N',0):>5} {r.get('Acc2',0):>5}% {r.get('Acc5',0):>5}% {r.get('MAE',0):>5} {r.get('RMSE',0):>5} {r.get('Bias',0):>6}")

json.dump(results, open("../data/vertex/global_vs_station_results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nบันทึก: data/vertex/global_vs_station_results.json")
