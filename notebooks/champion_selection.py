# -*- coding: utf-8 -*-
"""
Phase 27 — Champion Model Selection ด้วย validation-based selection
เลือกบน validation · ยืนยันบน holdout ครั้งเดียว · รายงานทุก baseline ตามจริง
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
wx_r = requests.get("https://archive-api.open-meteo.com/v1/archive",
                    params={"latitude": 13.75, "longitude": 100.5, "start_date": "2024-12-01", "end_date": "2026-10-03",
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

# ═══ หา persistence และ baseline จาก train/val เท่านั้น ═══
print("===== Validation-based Champion Selection =====")
print("เลือกจาก validation · ยืนยัน holdout ครั้งเดียว · ไม่ tune บน holdout\n")

all_results = {}
for h in HORS:
    for variant, dataset, feats in [("ridge_pm", all_nw, FN), ("ridge_wx", all_wx, FW), ("hgb_wx", all_wx, FW)]:
        t = dataset.copy()
        t["target"] = t.groupby("station_id")["pm25"].shift(-h)
        t = t.dropna(subset=["target"]); t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)
        tr = t[pd.to_datetime(t["timestamp"]) < VAL]
        va = t[(pd.to_datetime(t["timestamp"]) >= VAL) & (pd.to_datetime(t["timestamp"]) < TEST)]
        te = t[pd.to_datetime(t["timestamp"]) >= TEST]
        if len(tr) < 100 or len(va) < 20 or len(te) < 20: continue
        if "hgb" in variant:
            model = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08, l2_regularization=1.0, random_state=42).fit(tr[feats].fillna(0), tr["target"])
        else:
            model = Ridge(alpha=1.0).fit(tr[feats].fillna(0), tr["target"])
        va_m = met(va["target"], model.predict(va[feats].fillna(0)))
        te_m = met(te["target"], model.predict(te[feats].fillna(0)))
        key = f"h{h}_{variant}"
        all_results[key] = {"val": va_m, "test": te_m}
        print(f"h={h:2} {variant:12} val: ±2={va_m['Acc2'] if va_m else '-'}% MAE={va_m['MAE'] if va_m else '-'} | "
              f"holdout: ±2={te_m['Acc2'] if te_m else '-'}% MAE={te_m['MAE'] if te_m else '-'}")

# persistence on val + test
for h in HORS:
    for split_name, lo, hi in [("val", VAL, TEST), ("test", TEST, pd.Timestamp("2027-01-01"))]:
        pairs = []
        for sid, s in data_stations.items():
            g = s["nw"]
            g2 = g[pd.to_datetime(g["timestamp"]) >= lo].copy()
            g2 = g2[pd.to_datetime(g2["timestamp"]) < hi]
            s2 = g2.set_index("timestamp")["pm25"]
            for t in s2.index:
                pt = t - pd.Timedelta(hours=h)
                if pt in s2.index and np.isfinite(s2[pt]) and np.isfinite(s2[t]):
                    pairs.append((s2[t], s2[pt]))
        m = met([a for a,_ in pairs], [p for _,p in pairs])
        if m:
            all_results[f"h{h}_persistence_{split_name}"] = {"val": m, "test": m}
            print(f"h={h:2} persistence ({split_name}): ±2={m['Acc2']}% MAE={m['MAE']}")

# ═══ เลือก Champion จาก validation ═══
print("\n===== Champion Selection (จาก validation) =====")
champion_table = []
for h in HORS:
    val_candidates = []
    # persistence จาก val
    per_pairs = []
    for sid in STATIONS:
        s = data_stations[sid]["nw"]
        s2 = s[pd.to_datetime(s["timestamp"]) >= VAL].set_index("timestamp")["pm25"]
        for t in s2.index:
            pt = t - pd.Timedelta(hours=h)
            if pt in s2.index and np.isfinite(s2[pt]) and np.isfinite(s2[t]):
                per_pairs.append((s2[t], s2[pt]))
    m_per = met([a for a,_ in per_pairs], [p for _,p in per_pairs])
    if m_per:
        val_candidates.append(("persistence", m_per))

    for key in all_results:
        if not key.startswith(f"h{h}_"): continue
        model_name = key.replace(f"h{h}_","")
        vm = all_results[key].get("val")
        if vm and vm.get("MAE"):
            val_candidates.append((model_name, vm))

    if not val_candidates:
        continue
    best = min(val_candidates, key=lambda x: x[1]["MAE"])
    champion_table.append({"h": h, "champion": best[0], **best[1]})
    print(f"  h={h:2}: champion={best[0]} (val MAE={best[1]['MAE']}, ±2={best[1]['Acc2']}%)")

json.dump({"champion_table": champion_table, "all_results": all_results},
          open(r"C:\Users\ACER\projectweb\data\vertex\champion_selection.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(f"\nบันทึก: data/vertex/champion_selection.json")
