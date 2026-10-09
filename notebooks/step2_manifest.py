# -*- coding: utf-8 -*-
"""
Step 2+3 — manifest JSON คู่โมเดล + ตารางจังหวัด→สถานี (จากข้อมูลจริง ห้ามเดา)
- inference ต้องโหลดรายการสถานี/features/เวอร์ชันจากไฟล์นี้เท่านั้น
- province มาจากพิกัดจริงของสถานีใน air_quality_daily (ตรวจแล้วทั้งหมดอยู่ กทม.)
Output: notebooks/ml_v4_manifest.json
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import json
import joblib
import pandas as pd
import requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
env = {}
for line in (ROOT / "admin-app/.env.local").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
URL, KEY = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), env["SUPABASE_SERVICE_ROLE_KEY"]
HDRS = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

rows, offset = [], 0
while True:
    r = requests.get(f"{URL}/rest/v1/air_quality_daily",
                     headers={**HDRS, "Range": f"{offset}-{offset + 999}"},
                     params={"select": "station_id,station_name,latitude,longitude,date", "order": "station_id.asc"}, timeout=30)
    r.raise_for_status()
    batch = r.json()
    if not batch:
        break
    rows.extend(batch)
    offset += 1000

df = pd.DataFrame(rows).drop_duplicates("station_id")
b4 = joblib.load(ROOT / "notebooks/pm25_model_v4_residual.joblib")

def province_of(lat, lon):
    # ตรวจจากพิกัดจริง: ทุกสถานีในช่วง กทม. (13.52-14.05, 100.14-100.95) — นอกช่วงนี้ระบุ "ไม่ทราบ" ห้ามเดา
    if lat is None or lon is None:
        return None
    if 13.52 <= float(lat) <= 14.05 and 100.14 <= float(lon) <= 100.95:
        return "กรุงเทพมหานคร"
    return None

stations = []
province_map = {}
for _, row in df.iterrows():
    prov = province_of(row.get("latitude"), row.get("longitude"))
    stations.append({
        "station_id": str(row["station_id"]),
        "station_name": row.get("station_name"),
        "latitude": row.get("latitude"),
        "longitude": row.get("longitude"),
        "province": prov,
    })
    if prov:
        province_map.setdefault(prov, []).append(str(row["station_id"]))

manifest = {
    "model_version": b4["version"],
    "model_file": "notebooks/pm25_model_v4_residual.joblib",
    "recipe": b4["recipe"],
    "features": b4["features"],
    "trained_until": "2026-09-30",
    "training_rows": 24211,
    "horizons_days": [1, 2, 3],
    "stations": stations,
    "province_to_stations": province_map,
    "note": "โมเดลเทรนบนสถานีเหล่านี้เท่านั้น — สถานี/จังหวัดอื่นห้ามใช้โมเดลนี้ทำนาย (นอก training distribution)",
}
out = ROOT / "notebooks/ml_v4_manifest.json"
json.dump(manifest, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"manifest: {out}")
print(f"สถานีใน manifest: {len(stations)} · จังหวัดที่รองรับ: {list(province_map)} "
      f"({ {p: len(v) for p, v in province_map.items()} })")
