# -*- coding: utf-8 -*-
"""
Phase 33 — Fix 7day_mean bug + ±3 focus + ceiling analysis
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import sqlite3, json, numpy as np, pandas as pd, requests
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor

DB = Path(r"C:\Users\ACER\projectweb\data\hourly\pm25_hourly.sqlite")
OUT = Path(r"C:\Users\ACER\projectweb\data\vertex\phase33_results.json")

# ═══ โหลดข้อมูล hourly ═══
conn = sqlite3.connect(str(DB))
pm = pd.read_sql_query("SELECT station_id, ts_local, pm25 FROM hourly_pm25 ORDER BY station_id, ts_local", conn)
conn.close()
pm["ts"] = pd.to_datetime(pm["ts_local"])
pm = pm.dropna(subset=["pm25"]).sort_values(["station_id","ts"]).reset_index(drop=True)

# ═══ Phase 33.2: Data-resolution audit — hourly real vs upsample ═══
print("=" * 60)
print("PHASE 33.2: Data-Resolution Audit")
print("=" * 60)

resolution = []
for sid, g in pm.groupby("station_id"):
    s = g.set_index("ts")["pm25"].asfreq("h").dropna()
    s_df = s.reset_index(); s_df["date"] = s_df["ts"].dt.date
    # unique values per day
    uniq_per_day = s_df.groupby("date")["pm25"].nunique()
    # std within day (0 = upsample)
    std_per_day = s_df.groupby("date")["pm25"].std().fillna(0)
    days_1uniq = int((uniq_per_day == 1).sum())
    days_0std = int((std_per_day == 0).sum())
    days_total = len(uniq_per_day)
    days_real = days_total - days_1uniq
    med_h = float(g.groupby(g["ts"].dt.date).size().median())
    pct_same = 0
    for i in range(1, len(s)):
        if s.index[i].date() == s.index[i-1].date() and s.iloc[i] == s.iloc[i-1]:
            pct_same += 1
    pct_same = round(100 * pct_same / max(len(s)-1, 1), 1)
    resolution.append({"station": sid, "rows": len(g), "days": days_total,
                       "days_1_unique": days_1uniq, "days_real": days_real,
                       "med_hours_per_day": med_h, "pct_same_as_prev": pct_same})
    print(f"  {sid}: rows={len(g):>5} days={days_total:>3} days_1uniq={days_1uniq:>3} "
          f"days_real={days_real:>3} med_h/day={med_h:>3.0f} same_prev={pct_same:>5.1f}%")

# ยืนยัน h=1 artifact source
print(f"\nh=1 100% artifact มาจากสถานีที่ asfreq('h') สร้าง daily value ซ้ำ 24 ชม./วัน")
print(f"วันที่มี 1 unique value = upsampled · วันที่มี >1 = มี hourly variation จริง")

# ═══ คัดสถานี: มีข้อมูล ≥ 30 วัน (สำหรับ train) ═══
QUALIFIED = [r["station"] for r in resolution if r["days_real"] >= 30]
print(f"\nสถานีผ่านเกณฑ์ (≥30 วัน): {QUALIFIED}")

# ═══ รวมข้อมูลเฉพาะสถานีที่ผ่านเกณฑ์ ═══
daily_frames = []
for sid in QUALIFIED:
    g = pm[pm.station_id == sid]
    s = g.set_index("ts")["pm25"].asfreq("h")
    daily = s.resample("D").agg(["mean", "count", "std"]).dropna(subset=["mean"])
    daily = daily[daily["count"] >= 12]
    daily["station_id"] = sid
    dr = daily.reset_index()
    dr.columns = ["timestamp"] + list(dr.columns[1:])
    dr = dr.rename(columns={"mean": "pm25"})
    daily_frames.append(dr)
daily = pd.concat(daily_frames, ignore_index=True)
daily = daily.sort_values(["station_id", "timestamp"]).reset_index(drop=True)
print(f"Daily rows (qualified stations): {len(daily)}")

# ═══ เพิ่ม weather features ═══
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
wx_daily = wx.resample("D").agg({"temperature_2m": "mean", "relative_humidity_2m": "mean",
                                  "wind_speed_10m": "mean", "precipitation": "sum"}).reset_index()
wx_daily.columns = ["timestamp", "wx_temp", "wx_rh", "wx_wind", "wx_rain"]

daily = daily.merge(wx_daily, on="timestamp", how="left")
daily["wx_temp"] = daily["wx_temp"].fillna(daily["wx_temp"].median())
daily["wx_rh"] = daily["wx_rh"].fillna(daily["wx_rh"].median())
daily["wx_wind"] = daily["wx_wind"].fillna(daily["wx_wind"].median())
daily["wx_rain"] = daily["wx_rain"].fillna(0)

# ═══ สร้าง features ═══
def build_daily_features(g):
    g = g.sort_values("timestamp").reset_index(drop=True)
    f = pd.DataFrame(index=g.index)
    f["timestamp"] = g["timestamp"]; f["station_id"] = g["station_id"]; f["pm25"] = g["pm25"]
    for lag in [1, 2, 3, 4, 5, 6, 7]:
        f[f"lag_{lag}d"] = g.groupby("station_id")["pm25"].shift(lag)
    for w in [3, 7, 14]:
        f[f"rm_{w}d"] = g.groupby("station_id")["pm25"].transform(lambda x: x.shift(1).rolling(w, min_periods=3).mean())
        f[f"rs_{w}d"] = g.groupby("station_id")["pm25"].transform(lambda x: x.shift(1).rolling(w, min_periods=3).std())
    f["dow"] = pd.to_datetime(f["timestamp"]).dt.dayofweek
    f["month"] = pd.to_datetime(f["timestamp"]).dt.month
    f["is_hs"] = (f["month"].isin([12,1,2,3])).astype(int)
    for c in ["wx_temp", "wx_rh", "wx_wind", "wx_rain"]:
        if c in g.columns: f[c] = g[c]
    return f

daily_feats = build_daily_features(daily)
FEATS = [c for c in daily_feats.columns if c not in ("timestamp", "station_id", "pm25")]

# ═══ กำหนด split (ครั้งเดียว ประกาศล่วงหน้า) ═══
VAL_D = pd.Timestamp("2026-07-01"); TEST_D = pd.Timestamp("2026-08-15")
HORS = [1, 2, 3, 5, 7]

def met(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    ok = np.isfinite(y) & np.isfinite(p); y, p = y[ok], p[ok]
    if not len(p): return None
    e = np.abs(y - p); se = y - p
    return {"N": int(len(e)),
            "±2": round(100*float((e<=2).mean()),1), "±3": round(100*float((e<=3).mean()),1),
            "±4": round(100*float((e<=4).mean()),1), "±5": round(100*float((e<=5).mean()),1),
            "MAE": round(float(e.mean()),2), "RMSE": round(float(np.sqrt((e**2).mean())),2),
            "Bias": round(float(se.mean()),2)}

# ═══ Train + evaluate ทุกโมเดลต่อ horizon ═══
all_results = {}

for h in HORS:
    t = daily_feats.copy()
    t["target"] = t.groupby("station_id")["pm25"].shift(-h)
    t = t.dropna(subset=["target"])
    t = t.sort_values(["station_id","timestamp"]).reset_index(drop=True)

    tr = t[pd.to_datetime(t["timestamp"]) < VAL_D]
    va = t[(pd.to_datetime(t["timestamp"]) >= VAL_D) & (pd.to_datetime(t["timestamp"]) < TEST_D)]
    te = t[pd.to_datetime(t["timestamp"]) >= TEST_D]

    if len(tr) < 50 or len(va) < 20 or len(te) < 20:
        print(f"  h={h}: insufficient (train={len(tr)}, val={len(va)}, test={len(te)})")
        continue

    X_tr, y_tr = tr[FEATS].fillna(0), tr["target"]
    X_va, y_va = va[FEATS].fillna(0), va["target"]
    X_te, y_te = te[FEATS].fillna(0), te["target"]

    # ── baselines ──
    # persistence = ค่า ณ origin (row["pm25"]); error = |pm25[t+h] − pm25[t]|
    per_pairs = [(row["target"], row["pm25"]) for _, row in te.iterrows()]
    m_per = met([a for a,_ in per_pairs], [b for _,b in per_pairs])

    # ── 7day_mean = rm_7d ณ origin (shift(1) ไม่มี leakage) ──
    # ตัวทำนายนี้ horizon-invariant: ค่าที่ทำนายเหมือนกันทุก h → ±2 แบนราบทุก horizon
    # (root cause ของ "39.9% เท่ากันทุก horizon" ไม่ใช่บั๊กโค้ด แต่เป็นสมบัติของ rolling mean)
    m_ma7 = met(te["target"], te["rm_7d"])

    # ── Ridge ──
    model_r = Ridge(alpha=1.0).fit(X_tr, y_tr)
    m_r = met(y_te, model_r.predict(X_te))

    # ── HGB ──
    model_h = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08,
              l2_regularization=1.0, random_state=42).fit(X_tr.fillna(0), y_tr)
    m_h = met(y_te, model_h.predict(X_te.fillna(0)))

    # ── ensemble (mean Ridge + HGB) ──
    m_ens = met(y_te, (model_r.predict(X_te.fillna(0)) + model_h.predict(X_te.fillna(0))) / 2)

    # ── bias correction ของ persistence (จาก train/val) ──
    tr_per_pairs = [(row["target"], row["pm25"]) for _, row in tr.iterrows()]
    bias_per = float(np.mean([a - b for a, b in tr_per_pairs])) if tr_per_pairs else 0
    m_per_bc = met([a for a,_ in per_pairs], [b + bias_per for _, b in per_pairs])

    all_results[f"h{h}"] = {
        "persistence": m_per, "persistence_bias_corr": m_per_bc,
        "ma7_mean": m_ma7,
        "ridge_pm_only": m_r, "hgb": m_h, "ensemble": m_ens,
        "train_n": len(tr), "val_n": len(va), "test_n": len(te),
    }
    print(f"  h={h:2}d persistence:      ±3={m_per['±3']:>5}% ±2={m_per['±2']:>5}% MAE={m_per['MAE']:>5}")
    print(f"  h={h:2}d persistence+bc:   ±3={m_per_bc['±3']:>5}% ±2={m_per_bc['±2']:>5}% MAE={m_per_bc['MAE']:>5}")
    print(f"  h={h:2}d 7day_mean:        ±3={m_ma7['±3']:>5}% ±2={m_ma7['±2']:>5}% MAE={m_ma7['MAE']:>5}")
    print(f"  h={h:2}d Ridge:           ±3={m_r['±3']:>5}% ±2={m_r['±2']:>5}% MAE={m_r['MAE']:>5}")
    print(f"  h={h:2}d HGB:             ±3={m_h['±3']:>5}% ±2={m_h['±2']:>5}% MAE={m_h['MAE']:>5}")
    print(f"  h={h:2}d Ensemble(R+H)/2: ±3={m_ens['±3']:>5}% ±2={m_ens['±2']:>5}% MAE={m_ens['MAE']:>5}")

# ═══ Ceiling analysis: noise floor ต่อ horizon = |pm25[t+h] − pm25[t]| ของข้อมูลจริง ═══
print("\n===== Ceiling Analysis: ±3 @87-90% ทำได้จริงไหม =====")
print("  (share = สัดส่วน |Δ_h| ≤ K → เพดานของ persistence-type ทำนาย; โมเดลไหนเกินนี้ได้ต้องมีข้อมูลเสริม)")
TEST_D_NAIVE = TEST_D.tz_localize(None)
for h in HORS:
    dd_full, dd_hold = [], []
    for _, g in daily_feats.groupby("station_id"):
        g = g.sort_values("timestamp").reset_index(drop=True)
        v = g["pm25"].values
        pt = pd.to_datetime(g["timestamp"])
        for i in range(len(v) - h):
            delta = abs(v[i + h] - v[i])
            dd_full.append(delta)
            if pt.iloc[i] >= TEST_D_NAIVE:
                dd_hold.append(delta)
    d_full, d_hold = np.array(dd_full), np.array(dd_hold)
    print(f"  h={h:2}d  full: share(≤2)={100*(d_full<=2).mean():4.1f}% share(≤3)={100*(d_full<=3).mean():4.1f}% "
          f"median|Δ|={np.median(d_full):.2f}  |  holdout: share(≤2)={100*(d_hold<=2).mean():4.1f}% share(≤3)={100*(d_hold<=3).mean():4.1f}% (n={len(d_hold)})")

json.dump(all_results, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nบันทึก: {OUT}")
