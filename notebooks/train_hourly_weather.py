# -*- coding: utf-8 -*-
"""
Phase 19 — Ridge ± weather features · Protocol A (observed weather ≤ origin เท่านั้น)
Protocol A: weather ที่ origin และ lag ก่อนหน้า = ข้อมูลที่รู้แล้ว ณ เวลา forecast
ห้ามใช้ weather ณ target time (leakage)
เทียบบน holdout เดิม (≥ Aug 15 2026) · split/test set เดิมจาก Phase 18
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
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

HORIZONS = [1, 6, 24, 48, 72]
VAL_START = pd.Timestamp("2026-07-01")
TEST_START = pd.Timestamp("2026-08-15")

# ── โหลด hourly PM2.5 (3 สถานีข้อมูลยาว) ──
conn = sqlite3.connect(r"C:\Users\ACER\projectweb\data\hourly\pm25_hourly.sqlite")
df = pd.read_sql_query("SELECT station_id, ts_local, pm25 FROM hourly_pm25 ORDER BY station_id, ts_local", conn)
conn.close()
df["ts"] = pd.to_datetime(df["ts_local"])
long_ids = df.groupby("station_id").size()
long_ids = long_ids[long_ids >= 1000].index.tolist()
df = df[df.station_id.isin(long_ids)].reset_index(drop=True)
print(f"PM2.5: {len(df)} แถว · {len(long_ids)} สถานียาว")

# ── โหลด weather ──
wx_r = requests.get("https://archive-api.open-meteo.com/v1/archive", params={
    "latitude": 13.75, "longitude": 100.5,
    "start_date": "2024-12-01", "end_date": "2026-10-03",
    "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,surface_pressure,cloud_cover",
    "timezone": "Asia/Bangkok"}, timeout=60)
wx = pd.DataFrame(wx_r.json()["hourly"])
wx["timestamp"] = pd.to_datetime(wx["time"])
wx = wx.drop(columns=["time"])
WX_COLS = [c for c in wx.columns if c != "timestamp"]
print(f"Weather: {len(wx)} แถว · {len(WX_COLS)} features · ครอบคลุม {wx.timestamp.min()} → {wx.timestamp.max()}")

# ── merge weather เข้า PM2.5 ด้วย timestamp ──
data = df.merge(wx, left_on="ts", right_on="timestamp", how="left")
data["has_weather"] = data[WX_COLS[0]].notna().astype(int)
print(f"weather match: {int(data['has_weather'].sum())}/{len(data)} ({100*data['has_weather'].mean():.0f}%)")

# ── features (PM2.5 เดิม + weather ใหม่) ──
def build_features(g, with_weather=False):
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
    f["hour"] = f.index.hour
    f["dayofweek"] = f.index.dayofweek
    f["month"] = f.index.month
    f["is_high_season"] = f.index.month.isin([12, 1, 2, 3]).astype(int)
    f["sin_hour"] = np.sin(2 * np.pi * f.index.hour / 24)
    f["cos_hour"] = np.cos(2 * np.pi * f.index.hour / 24)
    if with_weather:
        gwx = g.set_index("ts")[WX_COLS].asfreq("h")
        # weather ณ origin และ lag 6/24h (ข้อมูล ≤ origin)
        for c in WX_COLS:
            f[f"wx_{c}"] = gwx[c]
            f[f"wx_{c}_lag6h"] = gwx[c].shift(6)
            f[f"wx_{c}_lag24h"] = gwx[c].shift(24)
        for w in [6, 24]:
            f[f"wx_temp_mean_{w}h"] = gwx["temperature_2m"].rolling(w, min_periods=3).mean()
            f[f"wx_rh_mean_{w}h"] = gwx["relative_humidity_2m"].rolling(w, min_periods=3).mean()
            f[f"wx_wind_mean_{w}h"] = gwx["wind_speed_10m"].rolling(w, min_periods=3).mean()
    f["pm25"] = s.values
    f.index.name = "timestamp"
    return f.reset_index()

frames_no_wx, frames_wx = [], []
for sid, g in data.groupby("station_id"):
    fn = build_features(g, with_weather=False); fn['station_id'] = sid
    fw = build_features(g, with_weather=True); fw['station_id'] = sid
    frames_no_wx.append(fn)
    frames_wx.append(fw)
data_nw = pd.concat(frames_no_wx, ignore_index=True)
data_wx = pd.concat(frames_wx, ignore_index=True)
data_nw["timestamp"] = pd.to_datetime(data_nw["timestamp"])
data_wx["timestamp"] = pd.to_datetime(data_wx["timestamp"])

FEATS_NW = [c for c in data_nw.columns if c not in ("timestamp", "station_id", "pm25")]
FEATS_WX = FEATS_NW + [c for c in data_wx.columns if c.startswith("wx_") and c not in FEATS_NW]

print(f"Features: no_wx={len(FEATS_NW)} | with_wx={len(FEATS_WX)} (เพิ่ม {len(FEATS_WX)-len(FEATS_NW)})")

def metrics(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    m = np.isfinite(y) & np.isfinite(p)
    y, p = y[m], p[m]
    if not len(p):
        return None
    e = y - p
    return {"N": int(len(e)),
            "Acc2": round(100 * float((np.abs(e) <= 2).mean()), 1),
            "Acc5": round(100 * float((np.abs(e) <= 5).mean()), 1),
            "MAE": round(float(np.abs(e).mean()), 2),
            "RMSE": round(float(np.sqrt((e ** 2).mean())), 2),
            "MedAE": round(float(np.median(np.abs(e))), 2),
            "R2": round(float(r2_score(y, p)), 3),
            "Bias": round(float(e.mean()), 2)}

# ══════════════ เทรน + ประเมิน ══════════════
results = {}
for h in HORIZONS:
    for wx_label, dataset, feats in [("no_wx", data_nw, FEATS_NW), ("with_wx", data_wx, FEATS_WX)]:
        t = dataset.copy()
        t["target"] = t.groupby("station_id")["pm25"].shift(-h)
        t = t.dropna(subset=["target"])
        t = t.sort_values(["station_id", "timestamp"]).reset_index(drop=True)
        t["ts"] = t["timestamp"]

        tr = t[t["ts"] < VAL_START]
        va = t[(t["ts"] >= VAL_START) & (t["ts"] < TEST_START)]
        te = t[t["ts"] >= TEST_START]

        X_tr = tr[feats].fillna(0)
        y_tr = tr["target"]
        X_va, y_va = va[feats].fillna(0), va["target"]
        X_te, y_te = te[feats].fillna(0), te["target"]

        model = Ridge(alpha=1.0).fit(X_tr, y_tr)
        va_mae = mean_absolute_error(y_va, model.predict(X_va))
        te_m = metrics(y_te, model.predict(X_te))

        key = f"h{h}_{wx_label}"
        results[key] = {"model": "ridge", "val_MAE": round(va_mae, 2), "holdout": te_m}

json.dump(results, open(r"C:\Users\ACER\projectweb\data\hourly\weather_experiment_results.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

print("\n===== Ridge ± weather — holdout (≥ Aug 15 2026) =====")
print(f"{'h':>3} {'no_wx ±2':>9} {'wx ±2':>7} {'Δ±2':>6} | {'no_wx MAE':>10} {'wx MAE':>7} {'ΔMAE':>6} | {'wx ±5':>7}")
for h in HORIZONS:
    a = results[f"h{h}_no_wx"]["holdout"]
    b = results[f"h{h}_with_wx"]["holdout"]
    d2 = b["Acc2"] - a["Acc2"]
    dmae = b["MAE"] - a["MAE"]
    print(f"{h:>3} {a['Acc2']:>8}% {b['Acc2']:>6}% {d2:>+5.1f} | {a['MAE']:>9} {b['MAE']:>6} {dmae:>+5.2f} | {b['Acc5']:>6}%")
