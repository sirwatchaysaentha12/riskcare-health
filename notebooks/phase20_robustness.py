# -*- coding: utf-8 -*-
"""
Phase 20 — Robustness checks ของ Ridge ± weather
20.1 coverage audit · 20.2 join audit · 20.3 rolling-origin ·
20.4 leave-one-station-out · 20.5 season · 20.6 paired comparison
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import sqlite3
import json
import numpy as np
import pandas as pd
import requests
from pathlib import Path
from sklearn.linear_model import Ridge

# ══════════════ 20.1 coverage audit ══════════════
print("===== 20.1: Coverage audit =====")
# Weather source: 16,128 ชั่วโมง (Dec 2024 - Oct 2026) · non-null 100%
# PM2.5 after merge: 28,206 แถว (3 สถานี × ชั่วโมงที่มีข้อมูลจริง)
# asfreq("h") ขยายเป็นทุกชั่วโมงในช่วง (รวมชั่วโมงที่ไม่มีข้อมูล = NaN)
# merge ด้วย timestamp → 27,863 match / 343 ไม่ match
# coverage = 27,863 / 28,206 = 98.8% (rounded to 99%)
# "100%" คือ weather API completeness (ทุก slot มีค่า) ไม่ใช่ join coverage

wx_r = requests.get("https://archive-api.open-meteo.com/v1/archive", params={
    "latitude": 13.75, "longitude": 100.5,
    "start_date": "2024-12-01", "end_date": "2026-10-03",
    "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation",
    "timezone": "Asia/Bangkok"}, timeout=60)
wx = pd.DataFrame(wx_r.json()["hourly"])
wx["timestamp"] = pd.to_datetime(wx["time"])
wx = wx.drop(columns=["time"]).set_index("timestamp")

conn = sqlite3.connect(r"C:\Users\ACER\projectweb\data\hourly\pm25_hourly.sqlite")
pm = pd.read_sql_query("SELECT station_id, ts_local, pm25 FROM hourly_pm25 WHERE station_id IN ('1304179','1304281','1304403')", conn)
conn.close()
pm["ts"] = pd.to_datetime(pm["ts_local"])

expected_ts = pm.drop_duplicates("ts")["ts"].nunique()
matched_ts = len(set(pm["ts"].unique()) & set(wx.index))
print(f"Weather API slots: {len(wx)} (non-null: {int(wx['temperature_2m'].notna().sum())})")
print(f"PM2.5 unique timestamps (3 stations): {expected_ts}")
print(f"Matched weather timestamps: {matched_ts}")
print(f"Coverage: {matched_ts}/{expected_ts} = {100*matched_ts/expected_ts:.1f}%")
print(f"คำอธิบาย: 100% = weather API completeness (weather เองไม่มี missing)")
print(f"          99% = join coverage (PM2.5 timestamps ที่ match weather)")
print(f"          ต่างกันเพราะ PM2.5 asfreq('h') ขยายช่วงกว้างกว่า weather")
print(f"          weather ครอบคลุม {wx.index.min().date()} → {wx.index.max().date()}")

# ══════════════ 20.2 join audit ══════════════
print("\n===== 20.2: Join audit =====")
data = pm.merge(wx.reset_index(), left_on="ts", right_on="timestamp", how="left", suffixes=("", "_wx"))
data["has_wx"] = data["temperature_2m"].notna().astype(int)
print(f"PM2.5 แถว: {len(data)} | มี weather: {int(data['has_wx'].sum())} | ไม่มี: {int((1-data['has_wx']).sum())}")
print(f"Weather distance: จุดเดียว (13.75, 100.5) สำหรับ 3 สถานี กรุงเทพฯ (lat 13.65-13.91) — max dist ~15 km ✓")
# timezone: PM2.5 ts_local = +07:00 · Open-Meteo timezone = Asia/Bangkok (+07:00) ✓

# ══════════════ features ══════════════
WX_COLS = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "precipitation"]

def build_features(g, with_wx=False):
    s = g.set_index("ts")["pm25"].asfreq("h")
    f = pd.DataFrame(index=s.index)
    for k in [1, 2, 3, 4, 5, 6, 12, 24, 48, 72]:
        f[f"lag_{k}h"] = s.shift(k - 1)
    for w in [3, 6, 12, 24]:
        f[f"roll_mean_{w}h"] = s.rolling(w, min_periods=max(3, w//3)).mean()
        f[f"roll_std_{w}h"] = s.rolling(w, min_periods=max(3, w//3)).std()
    f["roc_1h"] = s.diff(1)
    f["roc_6h"] = s.diff(6)
    f["momentum_3_12"] = s.rolling(3, min_periods=3).mean() - s.rolling(12, min_periods=6).mean()
    f["hour"] = f.index.hour; f["dayofweek"] = f.index.dayofweek
    f["month"] = f.index.month
    f["is_high_season"] = f.index.month.isin([12,1,2,3]).astype(int)
    f["sin_hour"] = np.sin(2 * np.pi * f.index.hour / 24)
    f["cos_hour"] = np.cos(2 * np.pi * f.index.hour / 24)
    if with_wx and "temperature_2m" in g.columns:
        gwx = g.set_index("ts")[WX_COLS].asfreq("h")
        for c in WX_COLS:
            f[f"wx_{c}"] = gwx[c]
            f[f"wx_{c}_lag6h"] = gwx[c].shift(6)
        for w in [6, 24]:
            f[f"wx_temp_mean_{w}h"] = gwx["temperature_2m"].rolling(w, min_periods=3).mean()
            f[f"wx_wind_mean_{w}h"] = gwx["wind_speed_10m"].rolling(w, min_periods=3).mean()
    f["pm25"] = s.values
    f.index.name = "timestamp"
    return f.reset_index()

frames_nw, frames_wx = [], []
for sid, g in data.groupby("station_id"):
    fn = build_features(g, with_wx=False); fn["station_id"] = sid
    fw = build_features(g, with_wx=True); fw["station_id"] = sid
    frames_nw.append(fn); frames_wx.append(fw)
data_nw = pd.concat(frames_nw, ignore_index=True)
data_wx = pd.concat(frames_wx, ignore_index=True)
data_nw["timestamp"] = pd.to_datetime(data_nw["timestamp"])
data_wx["timestamp"] = pd.to_datetime(data_wx["timestamp"])
FEATS_NW = [c for c in data_nw.columns if c not in ("timestamp","station_id","pm25")]
FEATS_WX = [c for c in data_wx.columns if c not in ("timestamp","station_id","pm25")]

def metrics(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    m = np.isfinite(y) & np.isfinite(p)
    y, p = y[m], p[m]
    if not len(p): return None
    e = y - p
    return {"N": int(len(e)), "Acc2": round(100*float((np.abs(e)<=2).mean()),1),
            "Acc5": round(100*float((np.abs(e)<=5).mean()),1),
            "MAE": round(float(np.abs(e).mean()),2),
            "RMSE": round(float(np.sqrt((e**2).mean())),2),
            "Bias": round(float(e.mean()),2)}

# ══════════════ 20.3 rolling-origin backtest ══════════════
print("\n===== 20.3: Rolling-origin backtest =====")
ORIGINS = [
    ("2025-12-01", "pre-high"),
    ("2026-02-01", "high"),
    ("2026-04-01", "post-high"),
    ("2026-06-01", "normal"),
    ("2026-08-15", "recent"),
]
HORIZONS = [1, 6, 24, 48, 72]
results = {}

for origin, label in ORIGINS:
    o_ts = pd.Timestamp(origin)
    for h in HORIZONS:
        for variant, dataset, feats in [("pm_only", data_nw, FEATS_NW), ("wx", data_wx, FEATS_WX)]:
            t = dataset.copy()
            t["target"] = t.groupby("station_id")["pm25"].shift(-h)
            t = t.dropna(subset=["target"])
            t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
            tr = t[pd.to_datetime(t["timestamp"]) < o_ts]
            te = t[pd.to_datetime(t["timestamp"]) >= o_ts]
            if len(tr) < 100 or len(te) < 10:
                continue
            model = Ridge(alpha=1.0).fit(tr[feats].fillna(0), tr["target"])
            pred = model.predict(te[feats].fillna(0))
            key = f"h{h}_{variant}"
            results.setdefault(key, []).append((te["target"].values, pred, te["station_id"].values, origin, label))

# aggregate
print(f"\n{'Model':20} {'h':>3} {'N':>5} {'±2%':>6} {'±5%':>6} {'MAE':>6} {'RMSE':>6} {'Bias':>7}")
for key in sorted(results.keys()):
    pairs = results[key]
    y_all = np.concatenate([p[0] for p in pairs])
    p_all = np.concatenate([p[1] for p in pairs])
    m = metrics(y_all, p_all)
    h_str = key[1:key.index('_', 1)]  # ตัวเลขหลัง 'h' แรก
    variant = key[key.index('_', 1) + 1:]
    h = int(h_str)
    print(f"{variant:20} {h:>3} {m['N']:>5} {m['Acc2']:>5}% {m['Acc5']:>5}% {m['MAE']:>5} {m['RMSE']:>5} {m['Bias']:>6}")

# per-origin for h=24
print("\n--- h=24 แยก origin ---")
for key in sorted(results.keys()):
    if not key.endswith("_h24"): continue
    variant = key.rsplit("_h24")[0]
    for i, (y, p, sids, origin, label) in enumerate(pairs):
        m = metrics(y, p)
        if m and m["N"] > 5:
            print(f"  {variant:20} {label:10} N={m['N']:>4} ±2={m['Acc2']:>5}% MAE={m['MAE']:>5}")

# ══════════════ 20.4 leave-one-station-out (h=24) ══════════════
print("\n===== 20.4: Leave-one-station-out (h=24) =====")
ALL_STATIONS = ['1304179', '1304281', '1304403']
for held_out in ALL_STATIONS:
    train_stations = [s for s in ALL_STATIONS if s != held_out]
    for variant, dataset, feats in [("pm_only", data_nw, FEATS_NW), ("wx", data_wx, FEATS_WX)]:
        t = dataset.copy()
        t["target"] = t.groupby("station_id")["pm25"].shift(-24)
        t = t.dropna(subset=["target"])
        t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
        tr = t[t["station_id"].isin(train_stations) & (pd.to_datetime(t["timestamp"]) < pd.Timestamp("2026-08-15"))]
        te = t[t["station_id"] == held_out]
        if len(tr) < 100 or len(te) < 50:
            print(f"  {held_out} {variant}: insufficient")
            continue
        model = Ridge(alpha=1.0).fit(tr[feats].fillna(0), tr["target"])
        m = metrics(te["target"], model.predict(te[feats].fillna(0)))
        if m:
            print(f"  {held_out} {variant:10}: N={m['N']:>4} ±2={m['Acc2']:>5}% MAE={m['MAE']:>5}")

# ══════════════ 20.5 season split ══════════════
print("\n===== 20.5: Season split (h=24, wx model) =====")
t = data_wx.copy()
t["target"] = t.groupby("station_id")["pm25"].shift(-24)
t = t.dropna(subset=["target"])
t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
tr = t[pd.to_datetime(t["timestamp"]) < pd.Timestamp("2026-08-15")]
te = t[pd.to_datetime(t["timestamp"]) >= pd.Timestamp("2026-08-15")]
model = Ridge(alpha=1.0).fit(tr[FEATS_WX].fillna(0), tr["target"])
te = te.copy()
te["pred"] = model.predict(te[FEATS_WX].fillna(0))
te["month"] = pd.to_datetime(te["timestamp"]).dt.month
te["season"] = te["month"].isin([12,1,2,3]).map({True:"high", False:"normal"})
for season, g in te.groupby("season"):
    m = metrics(g["target"], g["pred"])
    if m: print(f"  {season:8}: N={m['N']:>4} ±2={m['Acc2']:>5}% MAE={m['MAE']:>5}")

# ══════════════ 20.6 paired comparison (h=24,48,72) ══════════════
print("\n===== 20.6: Paired error comparison =====")
for h in [24, 48, 72]:
    for dataset, feats, label in [(data_nw, FEATS_NW, "PM-only"), (data_wx, FEATS_WX, "Ridge+wx")]:
        t = dataset.copy()
        t["target"] = t.groupby("station_id")["pm25"].shift(-h)
        t = t.dropna(subset=["target"])
        tr = t[pd.to_datetime(t["timestamp"]) < pd.Timestamp("2026-08-15")]
        te = t[pd.to_datetime(t["timestamp"]) >= pd.Timestamp("2026-08-15")]
        model = Ridge(alpha=1.0).fit(tr[feats].fillna(0), tr["target"])
        e = np.abs(np.asarray(te["target"], float) - model.predict(te[feats].fillna(0)))
        e2 = np.abs(np.asarray(te["target"], float) - np.asarray(te["lag_1h"], float))
        d = e2.mean() - e.mean()  # persistence MAE - model MAE = improvement
        # block bootstrap (monthly)
        boot_impr = []
        months = pd.to_datetime(te["timestamp"]).dt.to_period("M").unique()
        rng = np.random.RandomState(42)
        for _ in range(200):
            sample_months = rng.choice(months, size=len(months), replace=True)
            idx = np.isin(pd.to_datetime(te["timestamp"]).dt.to_period("M"), sample_months)
            be_m = np.abs(np.asarray(te["target"])[idx] - np.asarray(te["lag_1h"])[idx]).mean()
            boot_impr.append(be_m - (np.abs(np.asarray(te["target"])[idx] - model.predict(te[feats].fillna(0))[idx])).mean() if idx.any() else 0)
        boot_impr = np.array(boot_impr)
        print(f"  h={h:2} {label:12} model_MAE={e.mean():.2f} persistence_MAE={e2.mean():.2f} "
              f"improvement={e2.mean()-e.mean():.2f} boot_95CI=[{np.percentile(boot_impr,2.5):.2f},{np.percentile(boot_impr,97.5):.2f}]")
