# -*- coding: utf-8 -*-
"""
Pipeline รายวัน: พยากรณ์ PM2.5 รายจังหวัด (+1/+2/+3 วัน) → ตาราง pm25_forecast
ลำดับ: โหลด manifest (สถานี/features จากไฟล์นี้เท่านั้น) → ingest/backfill (ดึง live OpenAQ
เติมช่องว่าง 3 วันล่าสุด) → ตรวจครบก่อนรันโมเดล → inference (v4 recipe) → upsert pm25_forecast
→ บันทึก pipeline_runs · secret ทั้งหมดจาก env เท่านั้น (ไม่พิมพ์)
รันเวลา 04:30 (หลัง ingest cron 03:15) — ผ่าน Task Scheduler เดิม
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import warnings
warnings.filterwarnings("ignore")
import json
import time
from datetime import timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.load(open(ROOT / "notebooks/ml_v4_manifest.json", encoding="utf-8"))
FEATS = MANIFEST["features"]
MODEL_VERSION = MANIFEST["model_version"]
TRAINeD_UNTIL = MANIFEST["trained_until"]
HORIZONS = MANIFEST["horizons_days"]

env = {}
for line in (ROOT / "admin-app/.env.local").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
URL, KEY = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), env["SUPABASE_SERVICE_ROLE_KEY"]
OPENAQ_KEY = env.get("OPENAQ_API_KEY")
if not URL or not KEY:
    raise SystemExit("SUPABASE_SERVER_CONFIGURATION_MISSING")
HDRS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

started_at = pd.Timestamp.now(tz="UTC")
run_date = started_at.date()
missing_stations = []
notes = {}

# ── โหลดโมเดล ──
bundle = joblib.load(ROOT / MANIFEST["model_file"])
assert bundle["version"] == MODEL_VERSION

# ── 1) โหลดข้อมูลตาราง (paginated) ──
rows, offset = [], 0
while True:
    r = requests.get(f"{URL}/rest/v1/air_quality_daily",
                     headers={**HDRS, "Range": f"{offset}-{offset + 999}"},
                     params={"select": "station_id,station_name,latitude,longitude,date,pm25",
                             "order": "station_id.asc,date.asc"}, timeout=30)
    r.raise_for_status()
    batch = r.json()
    if not batch:
        break
    rows.extend(batch)
    offset += 1000
df = pd.DataFrame(rows)
df["date"] = pd.to_datetime(df["date"])
df = df.dropna(subset=["pm25"]).sort_values(["station_id", "date"])

# ── 2) backfill: ดึง live OpenAQ เติม 30 วันล่าสุดของสถานีที่รองรับ (เหมือน publish_forecasts.py) ──
def fetch_live_daily(sensor_id, days=30):
    if not OPENAQ_KEY:
        return {}
    frm = (pd.Timestamp.now(tz="UTC").tz_localize(None) - pd.Timedelta(days=days)).date()
    to = pd.Timestamp.now(tz="UTC").tz_localize(None).date()
    acc = {}
    try:
        r = requests.get(f"https://api.openaq.org/v3/sensors/{sensor_id}/measurements/daily",
                         headers={"X-API-Key": OPENAQ_KEY},
                         params={"datetime_from": f"{frm}T00:00:00+07:00", "datetime_to": f"{to}T23:59:59+07:00",
                                 "limit": 1000}, timeout=30)
        if r.status_code != 200:
            return {}
        for item in r.json().get("results", []):
            value, date = item.get("value"), str((item.get("period") or {}).get("datetimeFrom", {}).get("local") or "")[:10]
            if value is None or not date:
                continue
            acc.setdefault(date, []).append(float(value))
    except Exception:
        return {}
    return {pd.Timestamp(d).date(): sum(v) / len(v) for d, v in acc.items()}

def build_series(g, live):
    table = dict(zip(g["date"].dt.date, g["pm25"]))
    merged = {**table, **live}
    if not merged:
        return None
    idx = pd.to_datetime(sorted(merged))
    return pd.Series([merged[d.date()] for d in idx], index=idx, name="pm25").asfreq("D")

def build_features(s, cross_mean):
    f = pd.DataFrame(index=s.index)
    f["pm25"] = s
    for lag in range(1, 15):
        f[f"lag{lag}"] = s.shift(lag)
    for w in (3, 7, 14, 30):
        f[f"rm{w}"] = s.shift(1).rolling(w, min_periods=max(2, w // 2)).mean()
        f[f"rs{w}"] = s.shift(1).rolling(w, min_periods=max(2, w // 2)).std()
    f["min7"] = s.shift(1).rolling(7, min_periods=3).min()
    f["max7"] = s.shift(1).rolling(7, min_periods=3).max()
    f["min14"] = s.shift(1).rolling(14, min_periods=7).min()
    f["max14"] = s.shift(1).rolling(14, min_periods=7).max()
    f["roc1"] = s.shift(1) - s.shift(2)
    f["roc7"] = s.shift(1) - s.shift(8)
    f["mom3_7"] = s.shift(1).rolling(3, min_periods=2).mean() - s.shift(1).rolling(7, min_periods=3).mean()
    f["sp_lag"] = f.index.map(cross_mean)
    f["dow"] = f.index.dayofweek
    f["month"] = f.index.month
    f["is_hs"] = f.index.month.isin([12, 1, 2, 3]).astype(int)
    return f

# ── 3) ตรวจครบก่อนรันโมเดล + inference ต่อสถานีที่ manifest รองรับ ──
supported = {st["station_id"] for st in MANIFEST["stations"]}
db = df[df["station_id"].isin(supported)]
series_by_station = {}
for sid in sorted(supported):
    g = db[db["station_id"] == sid]
    if g.empty:
        missing_stations.append(sid)
        notes[sid] = "no_data_in_table"
        continue
    s = build_series(g, fetch_live_daily(int(sid)))
    time.sleep(1.0)
    if s is None or s.dropna().empty:
        missing_stations.append(sid)
        notes[sid] = "no_live_data"
        continue
    s = s.dropna()
    if len(s) < 3:
        missing_stations.append(sid)
        notes[sid] = "too_short"
        continue
    series_by_station[sid] = s

upserts = []
provinces_done = {}
if series_by_station:
    all_series = pd.DataFrame(series_by_station)
    cross_mean = all_series.mean(axis=1)
    for sid, s in series_by_station.items():
        d_last = s.index.max()
        # ตรวจความสด: origin ต้องไม่เก่ากว่า 2 วัน (ไม่งั้นข้าม — stale จะถูกจัดการที่ API)
        if (pd.Timestamp.now(tz="UTC").tz_localize(None) - d_last) > pd.Timedelta(days=2):
            missing_stations.append(sid)
            notes[sid] = f"stale_origin_{d_last.date()}"
            continue
        last = float(s.loc[d_last])
        last7 = s.loc[:d_last].tail(7)
        ma7 = float(last7.mean()) if len(last7) == 7 else last
        fe = build_features(s, cross_mean)
        prov = next(st["province"] for st in MANIFEST["stations"] if st["station_id"] == sid)
        issued = str(run_date)
        x = fe.loc[[d_last], FEATS] if d_last in fe.index else None
        features_ok = x is not None and bool(np.isfinite(x.to_numpy()).all())
        for h in HORIZONS:
            if h == 1 and features_ok:
                pred = max(0.0, float(bundle["model"].predict(x)[0]) + last)
            else:
                pred = max(0.0, 0.5 * last + 0.5 * ma7)
            upserts.append({
                "province": prov, "target_date": str((d_last + timedelta(days=h)).date()),
                "issued_date": issued, "horizon": h, "pm25": round(pred, 2),
                "model_version": MODEL_VERSION, "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
            })
            provinces_done.setdefault(prov, set()).add(issued)
    for sid in supported - set(series_by_station):
        if sid not in missing_stations:
            missing_stations.append(sid)

# ── 4) upsert pm25_forecast ──
status = "ok"
if not upserts:
    status = "failed"
elif missing_stations:
    status = "partial"
saved = 0
for i in range(0, len(upserts), 500):
    chunk = upserts[i:i + 500]
    r = requests.post(f"{URL}/rest/v1/pm25_forecast?on_conflict=province,target_date,issued_date,horizon,model_version",
                      headers={**HDRS, "Prefer": "resolution=merge-duplicates,return=minimal"},
                      json=chunk, timeout=60)
    r.raise_for_status()
    saved += len(chunk)

# ── 5) บันทึก pipeline_runs ──
run_row = {
    "run_date": str(run_date), "status": status,
    "started_at": started_at.isoformat(), "finished_at": pd.Timestamp.now(tz="UTC").isoformat(),
    "stations_total": len(supported), "stations_missing": sorted(set(missing_stations)),
    "provinces_covered": len(provinces_done),
    "detail": {"notes": notes, "rows_upserted": saved, "trained_until": TRAINeD_UNTIL,
               "model_version": MODEL_VERSION},
}
r = requests.post(f"{URL}/rest/v1/pipeline_runs", headers=HDRS, json=run_row, timeout=30)
if r.status_code >= 300:
    print("⚠️ บันทึก pipeline_runs ไม่สำเร็จ:", r.status_code, r.text[:120])

print(f"pipeline {status}: upsert {saved} แถว · จังหวัด {len(provinces_done)} · "
      f"สถานีขาด {len(set(missing_stations))}/{len(supported)} · model={MODEL_VERSION} · trained_until={TRAINeD_UNTIL}")
if missing_stations:
    print("สถานีที่ขาด:", sorted(set(missing_stations))[:10], "..." if len(set(missing_stations)) > 10 else "")
