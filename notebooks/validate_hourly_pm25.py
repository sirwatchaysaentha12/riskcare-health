# -*- coding: utf-8 -*-
"""QC validator สำหรับ hourly PM2.5 — รายงาน aggregate เท่านั้น (ไม่แสดง raw)
รัน: python validate_hourly_pm25.py [--db path] [--min-hours-per-day 12]
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import argparse
import json
import sqlite3
from collections import Counter
from datetime import timedelta
from pathlib import Path

import pandas as pd

ap = argparse.ArgumentParser()
ap.add_argument("--db", default=str(Path(__file__).resolve().parent.parent / "data" / "hourly" / "pm25_hourly.sqlite"))
ap.add_argument("--min-hours-per-day", type=int, default=12)
ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data" / "hourly" / "qc_summary.json"))
a = ap.parse_args()

conn = sqlite3.connect(a.db)
rows = pd.read_sql_query("SELECT station_id, ts_local, pm25, unit FROM hourly_pm25 ORDER BY station_id, ts_local", conn)
conn.close()
if rows.empty:
    print("NO DATA — ยังไม่มีการ crawl หรือตารางว่าง")
    sys.exit(1)

rows["ts"] = pd.to_datetime(rows["ts_local"])
rows["date"] = rows["ts"].dt.date
report = {"generated_at": pd.Timestamp.now(tz="UTC").isoformat(), "db": str(a.db)}

report["stations"] = int(rows["station_id"].nunique())
report["total_rows"] = int(len(rows))
report["date_min"] = str(rows["date"].min())
report["date_max"] = str(rows["date"].max())
report["duplicate_station_ts"] = int(rows.duplicated(["station_id", "ts_local"]).sum())
report["negative_values"] = int((rows["pm25"] < 0).sum())
report["over_500"] = int((rows["pm25"] > 500).sum())
report["non_finite"] = int((~rows["pm25"].apply(lambda v: pd.notna(v) and abs(v) < 1e9)).sum())

# hours per day ต่อสถานี + coverage
per_day = rows.groupby(["station_id", "date"]).size().reset_index(name="hours")
report["hours_per_day_by_station"] = {
    str(sid): {"min": int(g["hours"].min()), "median": float(g["hours"].median()), "max": int(g["hours"].max()), "days": int(len(g))}
    for sid, g in per_day.groupby("station_id")
}

# gap distribution (ช่องว่างระหว่างชั่วโมงต่อเนื่องในสถานีเดียวกัน)
gaps = Counter()
for sid, g in rows.groupby("station_id"):
    ts = pd.to_datetime(sorted(g["ts_local"].unique()))
    d = ts.to_series().diff().dropna() / pd.Timedelta(hours=1)
    for gap in d:
        if gap <= 1:
            continue
        gap -= 1
        if gap <= 3:
            gaps["0-3"] += 1
        elif gap <= 6:
            gaps["4-6"] += 1
        elif gap <= 12:
            gaps["7-12"] += 1
        else:
            gaps[">12"] += 1
report["gap_distribution_hours"] = dict(gaps)

# วันที่ coverage ต่ำกว่าเกณฑ์
low_cov = per_day[per_day["hours"] < a.min_hours_per_day]
report["days_below_min_coverage"] = int(len(low_cov))
report["days_total"] = int(len(per_day))
report["coverage_ok_days"] = report["days_total"] - report["days_below_min_coverage"]

# สถานีที่ผ่าน QC: มีวันผ่าน coverage อย่างน้อย 5 วัน
ok_stations = per_day[per_day["hours"] >= a.min_hours_per_day].groupby("station_id").size()
report["stations_passing_qc"] = [str(s) for s, c in ok_stations.items() if c >= 5]
report["stations_failing_qc"] = [str(s) for s in sorted(set(rows["station_id"]) - set(report["stations_passing_qc"]))]

# สรุปค่า pm25 ต่อสถานี (aggregate เท่านั้น)
report["pm25_stats_by_station"] = {
    str(sid): {"min": round(float(g["pm25"].min()), 1), "median": round(float(g["pm25"].median()), 1), "max": round(float(g["pm25"].max()), 1)}
    for sid, g in rows.groupby("station_id")
}

Path(a.out).parent.mkdir(parents=True, exist_ok=True)
Path(a.out).write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps({k: v for k, v in report.items() if k not in ("hours_per_day_by_station", "pm25_stats_by_station")}, ensure_ascii=False, indent=1))
print(f"\nสถานีผ่าน QC: {report['stations_passing_qc']}")
print(f"สถานีไม่ผ่าน: {report['stations_failing_qc']}")
