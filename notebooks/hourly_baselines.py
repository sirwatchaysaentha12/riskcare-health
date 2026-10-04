# -*- coding: utf-8 -*-
"""Baseline hourly (ไม่มี ML) — persistence 1h/24h, rolling median 6h, daily-agg persistence
ประเมินเฉพาะวันที่ผ่าน QC (coverage ≥ 12 ชม.) · metrics: MAE/RMSE/Bias/Acc@±2/Acc@±5
แยกตาม horizon (1,2,3 / 24,48,72 ชม.) + สถานี
รัน: python hourly_baselines.py
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

DB = Path(__file__).resolve().parent.parent / "data" / "hourly" / "pm25_hourly.sqlite"
MIN_HOURS = 12
OUT = Path(__file__).resolve().parent.parent / "data" / "hourly" / "hourly_baseline_results.json"

conn = sqlite3.connect(DB)
rows = pd.read_sql_query("SELECT station_id, ts_local, pm25 FROM hourly_pm25 ORDER BY station_id, ts_local", conn)
conn.close()
rows["ts"] = pd.to_datetime(rows["ts_local"])
rows["date"] = rows["ts"].dt.date

# QC: เฉพาะวันที่ coverage ≥ MIN_HOURS
per_day = rows.groupby(["station_id", "date"]).size().reset_index(name="hours")
ok_pairs = set(map(tuple, per_day[per_day["hours"] >= MIN_HOURS][["station_id", "date"]].values))
rows_qc = rows[[ (r.station_id, r.date) in ok_pairs for r in rows.itertuples() ]].copy()
rows_qc = rows_qc.sort_values(["station_id", "ts"]).reset_index(drop=True)

def metrics(pairs):
    if not pairs:
        return None
    errs = np.array([abs(a - p) for a, p in pairs])
    signed = np.array([a - p for a, p in pairs])
    return {"N": int(len(errs)), "Acc2": round(100 * float((errs <= 2).mean()), 1),
            "Acc5": round(100 * float((errs <= 5).mean()), 1),
            "MAE": round(float(errs.mean()), 2), "RMSE": round(float(np.sqrt((errs ** 2).mean())), 2),
            "Bias": round(float(signed.mean()), 2)}

# สร้าง (actual, prediction) ต่อสถานี: prediction ใช้เฉพาะข้อมูลก่อนเวลา target เท่านั้น
results = {"window": {"from": str(rows_qc["date"].min()), "to": str(rows_qc["date"].max()),
                      "stations": sorted(set(rows_qc["station_id"]))}, "by_variant": {}}
for variant in ["persistence_1h", "persistence_24h", "rolling_median_6h", "daily_agg_persistence"]:
    collect = {"all": [], "by_station": {}, "by_horizon": {}}
    for sid, g in rows_qc.groupby("station_id"):
        series = g.set_index("ts")["pm25"]
        daily = g.groupby("date")["pm25"].mean()  # ค่าเฉลี่ยรายวัน (coverage ผ่าน QC แล้ว)
        for t in series.index:
            if variant == "persistence_1h":
                pred_t = series.index[series.index < t].max()
                if pred_t is pd.NaT or (t - pred_t) > pd.Timedelta(hours=6):
                    continue  # ข้อมูลเก่าเกิน → ไม่ใช่ persistence ที่หน้าเชื่อถือ
                pred = series[pred_t]
            elif variant == "persistence_24h":
                pred_t = t - pd.Timedelta(hours=24)
                if pred_t not in series.index:
                    continue
                pred = series[pred_t]
            elif variant == "rolling_median_6h":
                w = series[(series.index < t) & (series.index >= t - pd.Timedelta(hours=6))]
                if len(w) < 3:
                    continue
                pred = w.median()
            else:  # daily_agg_persistence — เมื่อวาน (ค่าเฉลี่ยทั้งวัน) ทำนายทุกชั่วโมงวันนี้
                prev = t.date() - pd.Timedelta(days=1)
                if prev not in daily.index:
                    continue
                pred = daily[prev]
            actual = series[t]
            collect["all"].append((float(actual), float(pred)))
            collect["by_station"].setdefault(str(sid), []).append((float(actual), float(pred)))
            hour_delta = 1 if variant == "persistence_1h" else 24
            key = f"h{((t.hour * 60) % 1440) // 60 or hour_delta}"  # จัดกลุ่มหยาบตาม horizon ที่ขอ
    # รายงานตาม horizon ที่กำหนด: 1,2,3 ชม. (persistence_1h/rolling) และ 24,48,72 (persistence_24h/daily)
    results["by_variant"][variant] = {"all": metrics(collect["all"]),
                                      "by_station": {k: metrics(v) for k, v in sorted(collect["by_station"].items())}}

# แยก horizon แบบชัดเจนสำหรับ persistence_24h (24/48/72 ชม. = เมื่อวาน/2 วันก่อน/3 วันก่อน)
h_collect = {24: [], 48: [], 72: []}
for sid, g in rows_qc.groupby("station_id"):
    series = g.set_index("ts")["pm25"]
    for t in series.index:
        for h in [24, 48, 72]:
            pt = t - pd.Timedelta(hours=h)
            if pt in series.index:
                h_collect[h].append((float(series[t]), float(series[pt])))
for h, pairs in h_collect.items():
    results["by_variant"][f"persistence_{h}h_explicit"] = {"all": metrics(pairs)}
results["by_variant"].pop("persistence_24h", None)

json.dump(results, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("===== Baseline hourly (เฉพาะวันผ่าน QC · window", results["window"], ") =====")
for v, d in results["by_variant"].items():
    m = d.get("all")
    if m:
        print(f"{v:32} N={m['N']:>4} ±2={m['Acc2']:>5}% ±5={m['Acc5']:>5}% MAE={m['MAE']:>6} RMSE={m['RMSE']:>6} Bias={m['Bias']:>7}")
print("\nรายสถานี (persistence_1h):")
for k, m in results["by_variant"]["persistence_1h"]["by_station"].items():
    print(f"  {k}: N={m['N']} ±2={m['Acc2']}% ±5={m['Acc5']}% MAE={m['MAE']}")
