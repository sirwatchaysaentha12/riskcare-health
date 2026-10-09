# -*- coding: utf-8 -*-
"""
Publish ML forecasts: pm25_model_v4_residual.joblib → Supabase pm25_forecast_daily
รันวันละครั้งหลัง ingest — dashboard API ใช้ผลนี้ทันที
(modelVersion = ml-local-v4.0) · ลบแถวในตาราง = rollback กลับ baseline อัตโนมัติ

ลำดับ fallback:
  1. Supabase air_quality_daily (primary — ข้อมูลที่ ingest มาแล้ว)
  2. OpenAQ live  ← เฉพาะเมื่อ key ใช้ได้ (ตรวจก่อน, ไม่แสดง traceback ถ้าล้ม)
  ถ้า OpenAQ auth ล้ม → status=degraded, pipeline ไปต่อด้วยข้อมูลจาก Supabase เท่านั้น

สูตรต่อ horizon:
  - h=1: residual HGB + persistence — CV ±5 68.9% / MAE 4.37
  - h=2-3: 0.5×ค่าล่าสุด + 0.5×MA7
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import pandas as pd
import numpy as np
import joblib
import requests
from pathlib import Path
from datetime import timedelta, timezone, datetime
import time

# ── env จาก admin-app/.env.local (ไม่พิมพ์ค่า) ──
env = {}
for line in Path(r"C:\Users\ACER\projectweb\admin-app\.env.local").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
URL = env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL")
KEY = env.get("SUPABASE_SERVICE_ROLE_KEY")
if not URL or not KEY:
    raise SystemExit("SUPABASE_SERVER_CONFIGURATION_MISSING")
HDRS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

PIPELINE_START = datetime.now(timezone.utc).isoformat()
pipeline_status = "ok"    # จะเปลี่ยนเป็น "degraded" ถ้า OpenAQ ล้ม
openaq_degraded = False

# ── ตรวจ OpenAQ key ก่อน (ไม่พิมพ์ค่า) ──
OPENAQ_KEY = env.get("OPENAQ_API_KEY")
OPENAQ_URL = "https://api.openaq.org/v3"
openaq_available = bool(OPENAQ_KEY and len(OPENAQ_KEY.strip()) >= 8)
if not openaq_available:
    print("[pipeline] OPENAQ_API_KEY ไม่มีหรือสั้นเกินไป — ข้ามขั้น OpenAQ ทั้งหมด")

# ── โหลดข้อมูลจริงทั้งหมด (paginated) จาก Supabase ──
rows, offset = [], 0
while True:
    r = requests.get(f"{URL}/rest/v1/air_quality_daily",
                     headers={**HDRS, "Range": f"{offset}-{offset + 999}"},
                     params={"select": "station_id,station_name,latitude,longitude,date,pm25",
                             "order": "station_id.asc,date.asc"},
                     timeout=30)
    r.raise_for_status()
    batch = r.json()
    if not batch:
        break
    rows.extend(batch)
    offset += 1000
print(f"โหลดข้อมูลจริง: {len(rows)} แถว")

df = pd.DataFrame(rows)
df["date"] = pd.to_datetime(df["date"])
df = df.sort_values(["station_id", "date"])


def fetch_live_daily(sensor_id: int, days: int = 60):
    """คืน dict date(date) -> pm25 เฉลี่ยรายวัน จาก OpenAQ live
    ถ้า key ไม่มี / auth ล้ม (401/403) → คืน {} เงียบๆ ไม่ throw ไม่แสดง traceback"""
    global openaq_degraded, pipeline_status
    if not openaq_available or openaq_degraded:
        return {}
    frm = (pd.Timestamp.now(tz="UTC").tz_localize(None) - pd.Timedelta(days=days)).date()
    to = pd.Timestamp.now(tz="UTC").tz_localize(None).date()
    acc = {}
    try:
        resp = requests.get(
            f"{OPENAQ_URL}/sensors/{sensor_id}/measurements/daily",
            headers={"X-API-Key": OPENAQ_KEY},
            params={"datetime_from": f"{frm}T00:00:00+07:00",
                    "datetime_to": f"{to}T23:59:59+07:00", "limit": 1000},
            timeout=30,
        )
        if resp.status_code in (401, 403):
            # OPENAQ_AUTH_FAILED → ข้ามขั้น OpenAQ, status=degraded, pipeline ไปต่อ
            print(f"[pipeline] OPENAQ_AUTH_FAILED (HTTP {resp.status_code}) — ข้ามขั้น OpenAQ, status=degraded")
            openaq_degraded = True
            pipeline_status = "degraded"
            return {}
        if resp.status_code != 200:
            return {}
        for item in resp.json().get("results", []):
            value = item.get("value")
            date = str(
                (item.get("period") or {}).get("datetimeFrom", {}).get("local")
                or (item.get("period") or {}).get("datetimeFrom", {}).get("utc") or ""
            )[:10]
            if value is None or not date:
                continue
            acc.setdefault(date, []).append(float(value))
    except Exception:
        return {}  # network error → ใช้ข้อมูล Supabase ต่อ
    return {pd.Timestamp(d).date(): sum(v) / len(v) for d, v in acc.items()}


def build_series(g, live):
    """series รายวัน: ใช้ live เป็นหลัก (สดกว่า) — table เติมช่วงเก่าที่ live ไม่มี"""
    table = dict(zip(g["date"].dt.date, g["pm25"]))
    merged = {**table, **live}
    if not merged:
        return None
    idx = pd.to_datetime(sorted(merged))
    return pd.Series([merged[d.date()] for d in idx], index=idx, name="pm25").asfreq("D")


# ── โหลดโมเดล (ห้าม deploy v2.7) ──
bundle = joblib.load(Path(r"C:\Users\ACER\projectweb\notebooks\pm25_model_v4_residual.joblib"))
model = bundle["model"]
FEATS = bundle["features"]
MODEL_VERSION = bundle["version"]
print(f"โหลดโมเดล: {MODEL_VERSION}")


def build_features(s: pd.Series) -> pd.DataFrame:
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
    return f


upserts = []
live_ok = live_fail = ml_ok = 0
series_by_station = {}
stations_missing = []

for sid, g in df.groupby("station_id"):
    g = g.dropna(subset=["pm25"]).sort_values("date")
    if len(g) < 3:
        stations_missing.append(str(sid))
        continue
    live_data = fetch_live_daily(int(sid))
    if openaq_available and not openaq_degraded:
        time.sleep(0.8)   # rate limit
    s = build_series(g, live_data)
    if s is None:
        live_fail += 1
        stations_missing.append(str(sid))
        continue
    live_ok += 1
    s = s.dropna()
    if len(s) < 3:
        continue
    series_by_station[str(sid)] = s

all_series = pd.DataFrame(series_by_station)
cross_mean = all_series.mean(axis=1)

for sid, s in series_by_station.items():
    d_last = s.index.max()
    last = float(s.loc[d_last])
    last7 = s.loc[:d_last].tail(7)
    ma7 = float(last7.mean()) if len(last7) == 7 else last
    fe = build_features(s)
    fe["sp_lag"] = fe.index.map(cross_mean)
    fe["dow"] = fe.index.dayofweek
    fe["month"] = fe.index.month
    fe["is_hs"] = fe.index.month.isin([12, 1, 2, 3]).astype(int)
    if d_last not in fe.index:
        continue
    x = fe.loc[[d_last], FEATS]
    features_ok = bool(np.isfinite(x.to_numpy()).all())
    for h in [1, 2, 3]:
        if h == 1 and features_ok:
            pred = max(0.0, float(model.predict(x)[0]) + last)
            ml_ok += 1
        else:
            pred = max(0.0, 0.5 * last + 0.5 * ma7)
        upserts.append({
            "station_id": str(sid),
            "date": str((d_last + timedelta(days=h)).date()),
            "pm25": round(pred, 2),
            "pm25_min": None,
            "pm25_max": None,
            "horizon": h,
            "model_version": MODEL_VERSION,
            "updated_at": pd.Timestamp.now(tz="UTC").isoformat(),
        })

# ── upsert เข้า pm25_forecast_daily (ทีละ 500) ──
saved = 0
for i in range(0, len(upserts), 500):
    chunk = upserts[i:i + 500]
    r = requests.post(f"{URL}/rest/v1/pm25_forecast_daily?on_conflict=station_id,date,model_version",
                      headers={**HDRS, "Prefer": "resolution=merge-duplicates,return=minimal"},
                      json=chunk, timeout=60)
    r.raise_for_status()
    saved += len(chunk)
stations_count = len({u["station_id"] for u in upserts})

print(f"publish แล้ว: {saved} แถว forecast · {stations_count} สถานี · "
      f"live_ok={live_ok} live_fail={live_fail} · ml_h1={ml_ok} (ที่เหลือ w05) · "
      f"model_version={MODEL_VERSION} · pipeline_status={pipeline_status}")
if upserts:
    print("ตัวอย่าง:", upserts[0])

# ── บันทึก pipeline_runs (ไม่ throw ถ้าตารางยังไม่มี) ──
try:
    run_date = datetime.now(timezone(timedelta(hours=7))).date().isoformat()
    final_status = "ok" if pipeline_status == "ok" else "partial"
    run_payload = {
        "run_date": run_date,
        "status": final_status,
        "started_at": PIPELINE_START,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "stations_total": len(series_by_station),
        "stations_missing": stations_missing[:50],
        "provinces_covered": None,
        "phase": "publish_forecasts",
        "detail": {
            "providerUsed": "openaq" if (openaq_available and not openaq_degraded) else "supabase_only",
            "pipelineStatus": pipeline_status,
            "openaqDegraded": openaq_degraded,
            "live_ok": live_ok,
            "live_fail": live_fail,
            "ml_h1": ml_ok,
            "model_version": MODEL_VERSION,
            "saved": saved,
        }
    }
    r = requests.post(
        f"{URL}/rest/v1/pipeline_runs",
        headers={**HDRS, "Prefer": "return=minimal"},
        json=run_payload,
        timeout=15,
    )
    if r.status_code in (200, 201, 204):
        print(f"[pipeline] บันทึก pipeline_runs: {final_status}")
    else:
        print(f"[pipeline] pipeline_runs: HTTP {r.status_code} (ไม่ร้ายแรง — รัน SQL migration ก่อน?)")
except Exception as e:
    print(f"[pipeline] pipeline_runs insert ข้ามไป: {type(e).__name__} (ไม่ร้ายแรง)")
