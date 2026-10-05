# -*- coding: utf-8 -*-
"""
Phase 21 — แก้ Bootstrap CI, rolling-origin คลุมฤดูฝุ่น, leave-one-station-out
แก้จาก phase20_robustness.py: filter NaN ครบทุกคอลัมน์ก่อน paired comparison
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import sqlite3, json, numpy as np, pandas as pd, requests
from pathlib import Path
from sklearn.linear_model import Ridge

# ── โหลดข้อมูล (เหมือน Phase 20) ──
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

data = pm.merge(wx.reset_index(), left_on="ts", right_on="timestamp", how="left", suffixes=("","_wx"))
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
        gwx = g.set_index("ts")[WX].asfreq("h")
        for c in WX: f[f"wx_{c}"] = gwx[c]; f[f"wx_{c}_l6"] = gwx[c].shift(6)
        for w in [6,24]: f[f"wx_t_{w}"] = gwx["temperature_2m"].rolling(w, min_periods=3).mean(); f[f"wx_w_{w}"] = gwx["wind_speed_10m"].rolling(w, min_periods=3).mean()
    f["pm25"] = s.values
    f.index.name = "timestamp"
    return f.reset_index()

dn, dw = [], []
for sid, g in data.groupby("station_id"):
    fn = build(g, False); fn["station_id"] = sid; dn.append(fn)
    fw = build(g, True); fw["station_id"] = sid; dw.append(fw)
dn = pd.concat(dn, ignore_index=True); dw = pd.concat(dw, ignore_index=True)
dn["timestamp"] = pd.to_datetime(dn["timestamp"]); dw["timestamp"] = pd.to_datetime(dw["timestamp"])
FN = [c for c in dn.columns if c not in ("timestamp","station_id","pm25")]
FW = [c for c in dw.columns if c not in ("timestamp","station_id","pm25")]

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p)
    y, p = y[ok], p[ok]
    if not len(p): return None
    e = y - p
    return {"N": int(len(e)), "Acc2": round(100*float((np.abs(e)<=2).mean()),1),
            "Acc5": round(100*float((np.abs(e)<=5).mean()),1),
            "MAE": round(float(np.abs(e).mean()),2),
            "RMSE": round(float(np.sqrt((e**2).mean())),2),
            "Bias": round(float(e.mean()),2)}

# ═══ 21.2: rolling-origin คลุมฤดูฝุ่นสูง + paired comparison ═══
ORIGINS = [
    ("2025-06-01", "ก่อนฝุ่น 68"),
    ("2025-12-01", "ฝุ่นสูง 68-69"),
    ("2026-03-01", "หลังฝุ่น 69"),
    ("2026-06-01", "ปกติ 69"),
    ("2026-01-01", "ฝุ่นสูง 69-70"),
    ("2026-08-15", "ล่าสุด"),
]
HORS = [1, 6, 24, 48, 72]
output = {"origins": [], "paired": {}}

print("===== Rolling-origin (6 origins · คลุมฤดูฝุ่น) =====")
print(f"{'origin':12} {'label':14} {'model':12} {'h':>3} {'N':>5} {'±2':>6} {'±5':>6} {'MAE':>6} {'Bias':>6}")

for origin, label in ORIGINS:
    o_ts = pd.Timestamp(origin)
    for variant, dataset, feats in [("pm_only", dn, FN), ("wx", dw, FW)]:
        t = dataset.copy()
        t["target"] = t.groupby("station_id")["pm25"].shift(-max(HORS))
        t = t.dropna(subset=["target"])
        t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
        tr = t[pd.to_datetime(t["timestamp"]) < o_ts]
        te = t[pd.to_datetime(t["timestamp"]) >= o_ts].copy()
        if len(tr) < 200 or len(te) < 20:
            continue
        model = Ridge(alpha=1.0).fit(tr[feats].fillna(0), tr["target"])
        te["pred"] = model.predict(te[feats].fillna(0))

        for h in HORS:
            # target ที่ origin + h ชั่วโมง — ใช้ shift(-h) จาก origin เดียวกัน
            te["tgt_h"] = te.groupby("station_id")["pm25"].shift(-h)
            sub = te.dropna(subset=["tgt_h", "pred", "lag_1h", "lag_24h", "pm25"])
            sub = sub[np.isfinite(sub["tgt_h"]) & np.isfinite(sub["pred"]) & np.isfinite(sub["pm25"])]
            # model prediction สำหรับ h นี้ (origin ที่ d = จุด forecast)
            # ในกรณี rolling-origin: origin = o_ts, target = o_ts + h
            # แต่ feature ที่ origin = o_ts เท่านั้น → ทำนายวัน o_ts+1..o_ts+3 ที่ h=24,48,72
            # สำหรับ h=1,6 → target ใกล้ origin
            # ใช้วิธีง่าย: ทำนายทุกแถวใน te ด้วยโมเดลที่เทรนจาก < origin
            # แล้วจับคู่กับ actual ณ origin+h ชั่วโมงหลังจาก timestamp ของแถว
            pass

        # simplified: ประเมิน h=1,6,24,48,72 ด้วย lag shift แทนการ shift(-h)
        for h in HORS:
            tgt_col = f"tgt_{h}"
            te[tgt_col] = te.groupby("station_id")["pm25"].shift(-h)
            sub = te.dropna(subset=[tgt_col, "pred"])
            sub = sub[np.isfinite(sub[tgt_col]) & np.isfinite(sub["pred"])]
            if len(sub) < 5: continue
            m = met(sub[tgt_col], sub["pred"])
            if m:
                output["origins"].append({"origin": origin, "label": label, "model": variant,
                                          "h": h, "N": m["N"], "Acc2": m["Acc2"], "Acc5": m["Acc5"],
                                          "MAE": m["MAE"], "RMSE": m["RMSE"], "Bias": m["Bias"]})
                print(f"{origin:12} {label:14} {variant:12} {h:>3} {m['N']:>5} {m['Acc2']:>5}% {m['Acc5']:>5}% {m['MAE']:>6} {m['Bias']:>6}")

# ═══ 21.2: paired comparison แก้ NaN ถูกต้อง ═══
print("\n===== Paired comparison (holdout ≥ Aug 15) =====")
ORIGIN_HOLDOUT = pd.Timestamp("2026-08-15")
for h in [1, 6, 24, 48, 72]:
    preds = {}
    for variant, dataset, feats in [("pm_only", dn, FN), ("wx", dw, FW)]:
        t = dataset.copy()
        t["target"] = t.groupby("station_id")["pm25"].shift(-h)
        t = t.dropna(subset=["target"])
        t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
        tr = t[pd.to_datetime(t["timestamp"]) < ORIGIN_HOLDOUT]
        te = t[pd.to_datetime(t["timestamp"]) >= ORIGIN_HOLDOUT]
        if len(tr) < 100 or len(te) < 20: continue
        model = Ridge(alpha=1.0).fit(tr[feats].fillna(0), tr["target"])
        te_c = te.copy()
        te_c["pred"] = model.predict(te_c[feats].fillna(0))
        preds[variant] = te_c[["station_id","timestamp","pm25","pred","lag_1h","lag_24h"]].copy()

    if "pm_only" not in preds or "wx" not in preds: continue
    # join สองโมเดลบน (station_id, timestamp) เดียวกัน
    merged = preds["pm_only"].merge(preds["wx"], on=["station_id","timestamp"], suffixes=("_pm","_wx"))
    merged["actual"] = merged["pm25_pm"]
    # persistence = lag_1h
    valid = merged.dropna(subset=["actual","pred_pm","pred_wx","lag_1h_pm","lag_24h_pm"])
    valid = valid[np.isfinite(valid["actual"]) & np.isfinite(valid["pred_pm"]) &
                  np.isfinite(valid["pred_wx"]) & np.isfinite(valid["lag_1h_pm"]) &
                  np.isfinite(valid["lag_24h_pm"])]
    if not len(valid):
        print(f"  h={h}: insufficient paired rows")
        continue

    for model_col, model_label in [("pred_pm","Ridge PM-only"), ("pred_wx","Ridge+wx")]:
        e = np.abs(valid["actual"] - valid[model_col])
        e_per = np.abs(valid["actual"] - valid["lag_1h_pm"])
        e24 = np.abs(valid["actual"] - valid["lag_24h_pm"])
        print(f"  h={h:2} {model_label:14} N={len(valid):>5} "
              f"±2={100*(e<=2).mean():>5.1f}% ±5={100*(e<=5).mean():>5.1f}% MAE={e.mean():>5.2f} "
              f"| persistence_1h ±2={100*(e_per<=2).mean():>5.1f}% MAE={e_per.mean():>5.2f} "
              f"| persistence_24h ±2={100*(e24<=2).mean():>5.1f}% MAE={e24.mean():>5.2f}")

    # block bootstrap (station-month blocks · seed=42 · 200 resamples)
    rng = np.random.RandomState(42)
    e_pm_only = np.abs(valid["actual"] - valid["pred_pm"])
    e_wx = np.abs(valid["actual"] - valid["pred_wx"])
    e_per = np.abs(valid["actual"] - valid["lag_1h_pm"])
    periods = pd.to_datetime(valid["timestamp"]).dt.to_period("M").values
    unique_periods = np.unique(periods)
    boot_pm, boot_wx = [], []
    for _ in range(200):
        sel = rng.choice(unique_periods, size=len(unique_periods), replace=True)
        mask = np.isin(periods, sel)
        if mask.sum() < 10: continue
        boot_pm.append(np.abs(e_pm_only[mask]).mean())
        boot_wx.append(np.abs(e_wx[mask]).mean())
    if len(boot_pm) > 10:
        pm_arr, wx_arr = np.array(boot_pm), np.array(boot_wx)
        print(f"    bootstrap MAE 95%CI: pm_only=[{np.percentile(pm_arr,2.5):.2f},{np.percentile(pm_arr,97.5):.2f}] "
              f"wx=[{np.percentile(wx_arr,2.5):.2f},{np.percentile(wx_arr,97.5):.2f}]")

# ═══ 21.5: leave-one-station-out (h=24) ═══
print("\n===== Leave-one-station-out (h=24 · holdout ≥ Aug 15) =====")
ALL_STATIONS = ['1304179','1304281','1304403']
for held_out in ALL_STATIONS:
    train_sts = [s for s in ALL_STATIONS if s != held_out]
    for variant, dataset, feats in [("pm_only", dn, FN), ("wx", dw, FW)]:
        t = dataset.copy()
        t["target"] = t.groupby("station_id")["pm25"].shift(-24)
        t = t.dropna(subset=["target"])
        t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
        tr = t[t["station_id"].isin(train_sts) & (pd.to_datetime(t["timestamp"]) < ORIGIN_HOLDOUT)]
        te = t[(t["station_id"] == held_out) & (pd.to_datetime(t["timestamp"]) >= ORIGIN_HOLDOUT)]
        if len(tr) < 100 or len(te) < 20:
            print(f"  {held_out} {variant:10}: insufficient (train={len(tr)}, test={len(te)})")
            continue
        model = Ridge(alpha=1.0).fit(tr[feats].fillna(0), tr["target"])
        m = met(te["target"], model.predict(te[feats].fillna(0)))
        if m:
            print(f"  {held_out} {variant:10}: N={m['N']:>4} ±2={m['Acc2']:>5}% ±5={m['Acc5']:>5}% MAE={m['MAE']:>5}")

json.dump(output, open(r"C:\Users\ACER\projectweb\data\vertex\phase21_rolling_origin.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(f"\nบันทึก: data/vertex/phase21_rolling_origin.json")
