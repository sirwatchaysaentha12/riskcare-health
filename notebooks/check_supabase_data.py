# -*- coding: utf-8 -*-
"""ตรวจสถานะข้อมูล Supabase สำหรับเทรน PM2.5 — ครบทั้ง 6 ข้อตามเช็กลิสต์ v1.0 · 30 ก.ย. 2026"""
import json
import time
from collections import defaultdict
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent


def load_env() -> dict:
    e = {}
    for line in (ROOT.parent / 'admin-app' / '.env.local').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            e[k.strip()] = v.strip()
    return e


ENV = load_env()
URL = ENV.get('NEXT_PUBLIC_SUPABASE_URL') or ENV.get('SUPABASE_URL')
KEY = ENV.get('SUPABASE_SERVICE_ROLE_KEY')
HEAD = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
TABLE = 'air_quality_daily'

print(f'=== ข้อ 1: ตารางเป้าหมาย = {TABLE} ===')
probe = requests.get(f'{URL}/rest/v1/{TABLE}?select=id&limit=1', headers=HEAD, timeout=30)
print(f'   เช็คว่าตารางมีอยู่: HTTP {probe.status_code} {"✓" if probe.ok else "✗"}')

rows, off = [], 0
t0 = time.time()
while True:
    r = requests.get(f'{URL}/rest/v1/{TABLE}?select=station_id,station_name,date,pm25&order=date.asc',
                     headers=HEAD | {'Range': f'{off}-{off + 999}'}, timeout=60)
    r.raise_for_status()
    chunk = r.json()
    if not chunk:
        break
    rows += chunk
    off += 1000
    if len(chunk) < 1000:
        break
print(f'   ดึงครบ {len(rows)} แถว ใน {time.time() - t0:.1f} วินาที')

print('\n=== ข้อ 2: จำนวนแถวทั้งหมด ===')
total = len(rows)
print(f'   total_rows = {total:,} (เป้า 20,000 → ขาดอีก {max(0, 20000 - total):,} แถว = {total / 20000 * 100:.1f}%)')

print('\n=== ข้อ 3: ช่วงวันที่ครอบคลุม ===')
dates = [r['date'] for r in rows]
print(f'   เก่าสุด = {min(dates)} | ใหม่สุด = {max(dates)}')
span_days = (date.fromisoformat(max(dates)) - date.fromisoformat(min(dates))).days + 1
print(f'   ช่วงรวม {span_days} วัน')

print('\n=== ข้อ 4: duplicate + gap ===')
seen = defaultdict(int)
for r in rows:
    seen[(r['station_id'], r['date'])] += 1
dups = {k: v for k, v in seen.items() if v > 1}
print(f'   duplicate (station_id, date) ซ้ำ: {len(dups)} คู่')
for (sid, d), n in sorted(dups.items())[:5]:
    print(f'     เช่น: สถานี {sid} วันที่ {d} ซ้ำ {n} แถว')

by_station = defaultdict(set)
by_name = {}
for r in rows:
    by_station[r['station_id']].add(date.fromisoformat(r['date']))
    by_name[r['station_id']] = r['station_name']

total_missing = 0
gap_lines = []
for sid in sorted(by_station):
    ds = by_station[sid]
    lo, hi = min(ds), max(ds)
    span = (hi - lo).days + 1
    missing = span - len(ds)
    total_missing += missing
    gap_lines.append((sid, by_name[sid], len(ds), span, missing))
print(f'   gap รวม (วันหายจากช่วงของแต่ละสถานี): {total_missing:,} วัน')

print('\n=== ข้อ 5: NULL / ค่าผิดปกติของ pm25 ===')
nulls = sum(1 for r in rows if r['pm25'] is None)
neg = sum(1 for r in rows if r['pm25'] is not None and r['pm25'] < 0)
over500 = sum(1 for r in rows if r['pm25'] is not None and r['pm25'] > 500)
over200 = sum(1 for r in rows if r['pm25'] is not None and r['pm25'] > 200)
vals = [r['pm25'] for r in rows if r['pm25'] is not None]
print(f'   pm25 = NULL: {nulls} แถว')
print(f'   pm25 < 0: {neg} แถว')
print(f'   pm25 > 500: {over500} แถว (สูงผิดธรรมชาติตามเกณฑ์)')
print(f'   pm25 > 200 (สูงแต่อาจจริงช่วงฤดูเผา): {over200} แถว')
print(f'   ช่วงค่าจริง: min={min(vals)} max={max(vals)} µg/m³')

print('\n=== ข้อ 6: การกระจายตัวต่อสถานี ===')
print(f'   สถานีทั้งหมด: {len(by_station)} แห่ง')
print(f'   {"station_id":<12} {"ชื่อ":<42} {"แถว":>6} {"ช่วง":>25} {"ครอบคลุม":>9}')
for sid, name, n, span, missing in sorted(gap_lines, key=lambda x: -x[2]):
    ds = by_station[sid]
    pct = n / span * 100
    print(f'   {sid:<12} {name[:40]:<42} {n:>6,} {min(ds)}→{max(ds)} {pct:>7.0f}%')

print('\n=== สรุปพร้อมแนะนำ ===')
issues = []
if dups:
    issues.append(f'duplicate {len(dups)} คู่')
if nulls or neg or over500:
    issues.append(f'ค่าผิดปกติ (null {nulls} / ติดลบ {neg} / >500 {over500})')
print('ปัญหาที่พบ:', ', '.join(issues) if issues else 'ไม่มี — ข้อมูลสะอาด')
print(f'gap: {total_missing:,} วัน (จากทั้งหมด {total:,} แถว — ครอบคลุม {total / (total + total_missing) * 100:.0f}%)')
