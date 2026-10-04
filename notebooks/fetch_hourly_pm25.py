# -*- coding: utf-8 -*-
"""
Hourly PM2.5 crawler — OpenAQ v3 /sensors/{id}/measurements/hourly
(ฟื้นฟูเวอร์ชันแก้ blocker 3 ต.ค. 2569 — ไฟล์เดิมถูก revert โดย commit ขนาน 17:30)

Safety rules (Phase 14-15):
- API key อ่านจาก environment / admin-app/.env.local เท่านั้น ห้าม print
- header X-API-Key (header 'apikey' จะได้ 401 — ผิดตาม OpenAQ spec)
- endpoint /measurements/hourly HONORS datetime_from/datetime_to (+07:00) —
  ยืนยัน 3 ต.ค. 2569 (raw /measurements ไม่กรองวันที่ → deep pagination 408 เลิกใช้)
- pagination bounded ด้วย --max-pages/--max-requests · dt_to clamp ไม่ขอเวลาอนาคต (422)
- retry exponential เฉพาะ 408/429/5xx/network · หยุดทันทีที่ 401/403
- upsert ด้วย (station_id, ts_local) → รันซ้ำไม่สร้างข้อมูลซ้ำ
Usage:
  python fetch_hourly_pm25.py --stations 1304179,1304281 --days 14 --max-pages 3
  python fetch_hourly_pm25.py --stations 1304179 --start 2026-09-20 --end 2026-10-03 --dry-run
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import argparse
import json
import os
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API_URL = "https://api.openaq.org/v3"
MEASUREMENTS_PATH = "/measurements/hourly"
LIMIT = 1000
SLEEP_S = 2.0
TIMEOUT_S = 30
RETRY_DELAYS = [2, 5, 10, 20, 30]


class AuthError(Exception):
    """401/403 — หยุดทันที ไม่ retry"""


class TransientError(Exception):
    """408/429/5xx/network — retry ได้"""


def get_api_key():
    """key จาก environment ก่อน — ถ้าไม่มี อ่านจาก admin-app/.env.local · ห้ามพิมพ์ค่า"""
    k = os.environ.get("OPENAQ_API_KEY", "").strip()
    if k:
        return k
    env_file = Path(__file__).resolve().parent.parent / "admin-app" / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("OPENAQ_API_KEY=") and not line.startswith("#"):
                v = line.split("=", 1)[1].strip().strip('"').strip("'").strip("<>").strip()
                if v:
                    return v
    return ""


def _urllib_get(url, headers, params, timeout):
    qs = urllib.parse.urlencode(params)  # encode ให้ "+" ใน timezone offset ไม่กลายเป็นช่องว่าง
    req = urllib.request.Request(f"{url}?{qs}", headers=headers)
    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise AuthError(f"HTTP {e.code} — key ถูกปฏิเสธ (ห้าม retry)")
            if e.code in (408, 429) or e.code >= 500:
                attempt += 1
                if attempt > len(RETRY_DELAYS):
                    raise TransientError(f"HTTP {e.code} หลัง retry {attempt - 1} ครั้ง")
                time.sleep(RETRY_DELAYS[attempt - 1])
                continue
            raise RuntimeError(f"HTTP {e.code}")
        except urllib.error.URLError as e:
            attempt += 1
            if attempt > len(RETRY_DELAYS):
                raise TransientError(f"network: {e.reason}")
            time.sleep(RETRY_DELAYS[attempt - 1])


# wrapper: crawl_station เรียกชื่อนี้ · fetch injectable สำหรับ unit test (mock ไม่มี network)
def http_get_json(url, headers, params, timeout, fetch=None):
    if fetch is not None:
        attempt = 0
        while True:
            try:
                return fetch(url, headers, params, timeout)
            except TransientError:
                attempt += 1
                if attempt > len(RETRY_DELAYS):
                    raise
                time.sleep(RETRY_DELAYS[attempt - 1])
    return _urllib_get(url, headers, params, timeout)


def ts_local_from(item):
    t = ((item.get("period") or {}).get("datetimeFrom") or {})
    local = t.get("local") or t.get("utc") or ""
    return local[:16] if local else ""


def parse_rows(results, station_id, lat, lon):
    rows, skipped = [], 0
    for item in results:
        v = item.get("value")
        ts = ts_local_from(item)
        if v is None or not ts:
            skipped += 1
            continue
        v = float(v)
        if v < 0 or v > 500:
            skipped += 1
            continue
        rows.append((str(station_id), ts, round(v, 2), "µg/m³", lat, lon, "OpenAQ"))
    return rows, skipped


def upsert_rows(conn, rows):
    before = conn.total_changes
    now = datetime.now(timezone.utc).isoformat()
    conn.executemany(
        "INSERT INTO hourly_pm25 (station_id, ts_local, pm25, unit, latitude, longitude, source, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(station_id, ts_local) DO UPDATE SET pm25=excluded.pm25, updated_at=excluded.updated_at",
        [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], now) for r in rows],
    )
    conn.commit()
    return conn.total_changes - before


def get_db(db_path):
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("""CREATE TABLE IF NOT EXISTS hourly_pm25 (
        station_id TEXT NOT NULL, ts_local TEXT NOT NULL, pm25 REAL NOT NULL,
        unit TEXT, latitude REAL, longitude REAL, source TEXT,
        updated_at TEXT, PRIMARY KEY (station_id, ts_local))""")
    return conn


def crawl_station(sensor_id, db_path, start=None, end=None, max_pages=3, max_requests=200, sleep_s=SLEEP_S, fetch=None, dry_run=False):
    key = get_api_key()
    if not key:
        raise SystemExit("OPENAQ_API_KEY_MISSING — ตั้งค่าใน environment หรือ admin-app/.env.local ก่อน (ค่าไม่แสดงที่นี่)")
    headers = {"X-API-Key": key}
    stats = {"pages": 0, "requests": 0, "retries": 0, "rows_fetched": 0, "rows_in_window": 0, "skipped": 0, "new_or_updated": 0, "stopped_reason": ""}

    conn = get_db(db_path)
    page = 1
    dt_from = f"{start}T00:00:00+07:00" if start else None
    dt_to = f"{end}T23:59:59+07:00" if end else None
    # clamp ไม่ให้ขอเวลาอนาคต (OpenAQ ตอบ 422 ถ้า datetime_to อยู่หน้าปัจจุบัน)
    now_bkk = datetime.now(timezone.utc) + timedelta(hours=7)
    if dt_to and datetime.fromisoformat(dt_to) > now_bkk:
        dt_to = now_bkk.isoformat(timespec="seconds")
    try:
        while page <= max_pages and stats["requests"] < max_requests:
            params = {"limit": LIMIT, "page": page}
            if dt_from: params["datetime_from"] = dt_from
            if dt_to: params["datetime_to"] = dt_to
            status, payload = http_get_json(f"{API_URL}/sensors/{sensor_id}{MEASUREMENTS_PATH}", headers, params, TIMEOUT_S, fetch=fetch)
            stats["requests"] += 1
            stats["pages"] += 1
            results = payload.get("results", [])
            found_raw = str((payload.get("meta") or {}).get("found") or "0")
            if not results:
                stats["stopped_reason"] = "empty page"
                break
            rows, skipped = parse_rows(results, sensor_id, None, None)
            in_window = [r for r in rows if (not start or r[1] >= start) and (not end or r[1][:10] <= end)]
            stats["rows_fetched"] += len(rows)
            stats["rows_in_window"] += len(in_window)
            stats["skipped"] += skipped
            if in_window and not dry_run:
                stats["new_or_updated"] += upsert_rows(conn, in_window)
            last_ts = max((r[1] for r in rows), default="")
            # ครบหน้าต่างแล้ว (ผ่านวัน end) — หรือ found ≤ limit = 1 หน้าจบ
            if end and last_ts[:10] >= end:
                stats["stopped_reason"] = "covered window end"
                break
            digits = "".join(ch for ch in found_raw if ch.isdigit())
            total_found = int(digits) if digits else 0
            total_pages = (total_found + LIMIT - 1) // LIMIT
            if total_pages <= page:
                stats["stopped_reason"] = "reached newest page"
                break
            page += 1
            time.sleep(sleep_s)
    finally:
        conn.close()
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stations", required=True, help="sensor ids คั่นด้วย comma")
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--start", default=None, help="YYYY-MM-DD (ทางเลือกแทน --days)")
    ap.add_argument("--end", default=None)
    ap.add_argument("--max-pages", type=int, default=3)
    ap.add_argument("--max-requests", type=int, default=200)
    ap.add_argument("--db", default=str(Path(__file__).resolve().parent.parent / "data" / "hourly" / "pm25_hourly.sqlite"))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    today = datetime.now(timezone.utc) + timedelta(hours=7)
    start = a.start or (today - timedelta(days=a.days)).strftime("%Y-%m-%d")
    end = a.end or today.strftime("%Y-%m-%d")
    print(f"crawl window = {start} → {end} · max_pages={a.max_pages} · dry_run={a.dry_run}")

    total = {"requests": 0, "rows_in_window": 0, "new_or_updated": 0}
    for sid in [s.strip() for s in a.stations.split(",") if s.strip()]:
        st = crawl_station(sid, a.db, start=start, end=end, max_pages=a.max_pages, max_requests=a.max_requests, dry_run=a.dry_run)
        for k in ["requests", "rows_in_window", "new_or_updated"]:
            total[k] += st[k]
        print(f"sensor {sid}: pages={st['pages']} rows_fetched={st['rows_fetched']} in_window={st['rows_in_window']} "
              f"new_or_updated={st['new_or_updated']} skipped={st['skipped']} stop={st['stopped_reason'] or '-'}")
    print(f"รวม: requests={total['requests']} rows_in_window={total['rows_in_window']} new_or_updated={total['new_or_updated']}")


if __name__ == "__main__":
    main()
