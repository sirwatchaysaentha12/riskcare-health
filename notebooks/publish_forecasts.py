# -*- coding: utf-8 -*-
"""
Publish ML forecasts: pm25_model_production.joblib → Supabase pm25_forecast_daily
รันวันละครั้งหลัง ingest (หรือรันมือเมื่อต้องการ) — dashboard API จะใช้ผลนี้ทันที
(modelVersion = ml-local-v3.0) · ลบแถวในตาราง = rollback กลับ baseline อัตโนมัติ
Features ต้องตรงกับ train_production.py ทุกตัว (lag_1 = ค่าของวัน origin เอง)
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import pandas as pd
import numpy as np
import joblib
import requests
from pathlib import Path
from datetime import timedelta

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

# ── โหลดข้อมูลจริงทั้งหมด (paginated) ──
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

# ── ข้อมูลสดจาก OpenAQ (endpoint เดียวกับ openAqClient.ts — /v3/sensors/{id}/measurements/daily) ──
OPENAQ_KEY = env.get("OPENAQ_API_KEY")
OPENAQ_URL = "https://api.openaq.org/v3"

def fetch_live_daily(sensor_id: int, days: int = 60):
    """คืน dict date(str) -> pm25 เฉลี่ยรายวัน จาก OpenAQ live (ค่าเฉลี่ยเหมือน openAqClient.ts)"""
    if not OPENAQ_KEY:
        return {}
    frm = (pd.Timestamp.utcnow().tz_localize(None) - pd.Timedelta(days=days)).date()
    to = pd.Timestamp.utcnow().tz_localize(None).date()
    acc = {}
    try:
        r = requests.get(
            f"{OPENAQ_URL}/sensors/{sensor_id}/measurements/daily",
            headers={"X-API-Key": OPENAQ_KEY},
            params={"datetime_from": f"{frm}T00:00:00+07:00", "datetime_to": f"{to}T23:59:59+07:00", "limit": 1000},
            timeout=30,
        )
        if r.status_code != 200:
            return {}
        for item in r.json().get("results", []):
            value = item.get("value")
            date = str((item.get("period") or {}).get("datetimeFrom", {}).get("local") or (item.get("period") or {}).get("datetimeFrom", {}).get("utc") or "")[:10]
            if value is None or not date:
                continue
            acc.setdefault(date, []).append(float(value))
    except Exception:
        return {}
    return {pd.Timestamp(d).date(): sum(v) / len(v) for d, v in acc.items()}

def build_series(g, live):
    """series รายวัน: ใช้ live เป็นหลัก (สดกว่า) — table เติมช่วงเก่าที่ live ไม่มี"""
    table = dict(zip(g["date"].dt.date, g["pm25"]))
    merged = {**table, **live}
    if not merged:
        return None
    idx = pd.to_datetime(sorted(merged))
    return pd.Series([merged[d.date()] for d in idx], index=idx, name="pm25").asfreq("D")

# ── features (ต้องตรง train_production.py ทุกตัว: lag_1 = ค่าของวัน origin เอง) ──
def build_features_from_series(s: pd.Series) -> pd.DataFrame:
    f = pd.DataFrame(index=s.index)
    for k in [1, 2, 3, 4, 5, 6, 7, 14]:
        f[f"lag_{k}"] = s.shift(k - 1)
    for w in [3, 7, 14]:
        f[f"roll_mean_{w}"] = s.rolling(w).mean()
        f[f"roll_std_{w}"] = s.rolling(w).std()
    for w in [3, 7]:
        f[f"roll_min_{w}"] = s.rolling(w).min()
        f[f"roll_max_{w}"] = s.rolling(w).max()
    f["day_of_week"] = f.index.dayofweek
    f["month"] = f.index.month
    f["is_high_season"] = f["month"].isin([12, 1, 2, 3]).astype(int)
    return f

bundle = joblib.load(Path(r"C:\Users\ACER\projectweb\notebooks\pm25_model_production.joblib"))
models, blend = bundle["models"], bundle["blend"]
FEATS = bundle["features"]
MODEL_VERSION = bundle["version"]

upserts = []
import time
live_ok = live_fail = 0
for sid, g in df.groupby("station_id"):
    g = g.dropna(subset=["pm25"]).sort_values("date")
    if len(g) < 3:
        continue
    s = build_series(g, fetch_live_daily(int(sid)))
    if s is None:
        live_fail += 1
        continue
    live_ok += 1
    time.sleep(1.2)  # กัน rate limit ของ OpenAQ
    s = s.dropna()
    if len(s) < 3:
        continue
    d_last = s.index.max()
    fe = build_features_from_series(s)
    if d_last not in fe.index:
        continue
    x = fe.loc[[d_last], FEATS]
    lag1 = float(fe.loc[d_last, "lag_1"]) if np.isfinite(fe.loc[d_last, "lag_1"]) else None
    for h in [1, 2, 3]:
        ml_pred = float(models[h].predict(x)[0])
        # blend50 เหมือนตอนเทรน: lag เป็น NaN → fallback ค่า ML
        base = lag1 if lag1 is not None else ml_pred
        pred = max(0.0, 0.5 * ml_pred + 0.5 * base)
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
    r = requests.post(f"{URL}/rest/v1/pm25_forecast_daily?on_conflict=station_id,date",
                      headers={**HDRS, "Prefer": "resolution=merge-duplicates,return=minimal"},
                      json=chunk, timeout=60)
    r.raise_for_status()
    saved += len(chunk)
stations = len({u["station_id"] for u in upserts})
print(f"publish แล้ว: {saved} แถว forecast · {stations} สถานี · live_ok={live_ok} live_fail={live_fail} · model_version={MODEL_VERSION}")
print("ตัวอย่าง:", upserts[0])
