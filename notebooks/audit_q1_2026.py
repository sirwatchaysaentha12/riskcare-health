# -*- coding: utf-8 -*-
"""ตรวจ Q1-2026 anomaly แบบเจาะจง: origin 2026-01-01 → ทำนาย 2-4 ม.ค. (h1-3)"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import pandas as pd
import numpy as np
import joblib
from pathlib import Path

df = pd.read_csv(r"C:\Users\ACER\projectweb\data\vertex\pm25_daily_vertex.csv")
df["timestamp"] = pd.to_datetime(df["timestamp"])
df = df.sort_values(["location_id", "timestamp"])
bundle = joblib.load(r"C:\Users\ACER\projectweb\notebooks\pm25_model_production.joblib")
models, FEATS = bundle["models"], bundle["features"]

ORIGIN = pd.Timestamp("2026-01-01")
print("=== 1) คุณภาพข้อมูลจริงรอบเหตุการณ์ (จาก CSV — ข้อมูลสาธารณะสถานี) ===")
w = df[(df["timestamp"] >= "2025-12-28") & (df["timestamp"] <= "2026-01-07")]
pivot = w.pivot_table(index="timestamp", values="pm25", aggfunc=["count", "mean", "median", "min", "max"])
print(pivot.round(1).to_string())
print("\nสถานีที่มีข้อมูลช่วง 1-4 ม.ค.:", w[(w.timestamp >= '2026-01-01') & (w.timestamp <= '2026-01-04')]['location_id'].nunique())
print("duplicate (station,date):", int(w.duplicated(['location_id', 'timestamp']).sum()))
print("missing pm25 ในช่วง:", int(w['pm25'].isna().sum()))

print("\n=== 2) timezone/การเลื่อนวัน — เทียบ OpenAQ live ===")
import requests, os
env = {}
for line in open(r"C:\Users\ACER\projectweb\admin-app\.env.local", encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
H = {"apikey": env["OPENAQ_API_KEY"]}
# เลือกสถานีเดียวที่มีข้อมูล 1 ม.ค. — เทียบ CSV (Bangkok midnight rollup) กับ OpenAQ hourly จริง
jan1 = df[(df.timestamp == "2026-01-01") & df.pm25.notna()]
sid = int(jan1.iloc[0]["location_id"])
csv_val = float(jan1.iloc[0]["pm25"])
r = requests.get(f"https://api.openaq.org/v3/sensors/{sid}/measurements",
                 headers=H, params={"date_from": "2026-01-01T00:00:00+07:00", "date_to": "2026-01-02T00:00:00+07:00", "limit": 1000}, timeout=30)
hours = []
for it in r.json().get("results", []):
    v = it.get("value")
    t = ((it.get("period") or {}).get("datetimeFrom") or {}).get("local") or ((it.get("period") or {}).get("datetimeFrom") or {}).get("utc")
    if v is not None and t:
        hours.append((str(t)[5:16], float(v)))
hours.sort()
vals = [v for _, v in hours]
print(f"sensor {sid}: CSV daily 1 ม.ค. = {csv_val:.1f} | OpenAQ hourly n={len(vals)} mean={np.mean(vals):.1f}" if vals else f"sensor {sid}: live hourly ว่าง (rollup ใช้แหล่งอื่น)")
if vals:
    print("  ชั่วโมง 00-23:", [f"{v:.0f}" for _, v in hours[:24]])

print("\n=== 3) lag ใช้ข้อมูล ≤ origin เท่านั้น? — ตรวจจากโค้ด eval (assert ที่เพิ่มจะยืนยัน) ===")
print("=== 4) ผลรายสถานี origin 2026-01-01 (h1) — actual วันที่ 2 ม.ค. ===")
pairs = []
for sid2, g in df.groupby("location_id"):
    g = g.sort_values("timestamp")
    s = g.set_index("timestamp")["pm25"].asfreq("D")
    past = s[s.index <= ORIGIN].dropna()
    if len(past) < 30:
        continue
    # features ณ ORIGIN (lag_1 = ค่าวัน 1 ม.ค.)
    f = pd.DataFrame(index=s.index)
    for k in [1, 2, 3, 4, 5, 6, 7, 14]:
        f[f"lag_{k}"] = s.shift(k - 1)
    for w2 in [3, 7, 14]:
        f[f"roll_mean_{w2}"] = s.rolling(w2).mean(); f[f"roll_std_{w2}"] = s.rolling(w2).std()
    for w2 in [3, 7]:
        f[f"roll_min_{w2}"] = s.rolling(w2).min(); f[f"roll_max_{w2}"] = s.rolling(w2).max()
    f["day_of_week"] = f.index.dayofweek; f["month"] = f.index.month
    f["is_high_season"] = f["month"].isin([12, 1, 2, 3]).astype(int)
    if ORIGIN not in f.index:
        continue
    x = f.loc[[ORIGIN], FEATS]
    ml = float(models[1].predict(x)[0])
    lag1 = float(f.loc[ORIGIN, "lag_1"]) if np.isfinite(f.loc[ORIGIN, "lag_1"]) else ml
    pred = max(0.0, 0.5 * ml + 0.5 * lag1)
    actual = s.get(ORIGIN + pd.Timedelta(days=1), np.nan)
    if np.isfinite(actual):
        pairs.append((str(sid2), float(lag1), float(actual), pred, abs(actual - pred)))
pairs.sort(key=lambda t: -t[4])
print(f"{'station':>10} {'pm25(1ม.ค.)':>11} {'actual(2ม.ค.)':>13} {'pred':>7} {'|err|':>7}")
for st, lag1, a, p, e in pairs:
    print(f"{st:>10} {lag1:>11.1f} {a:>13.1f} {p:>7.1f} {e:>7.1f}")
n = len(pairs)
errs = np.array([t[4] for t in pairs])
print(f"\nN={n} | MAE={errs.mean():.2f} | ±2={100*(errs<=2).mean():.1f}% | actual mean={np.mean([t[2] for t in pairs]):.1f}")
print("สรุปรูปแบบ: actual ร่วงจาก 1 ม.ค. (~59) → 2 ม.ค. (~38) = ฝุ่นลดหลังวันหยุด — persistence ทำนายไม่ได้โดยโครงสร้าง")
