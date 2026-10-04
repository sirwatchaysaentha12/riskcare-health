# -*- coding: utf-8 -*-
"""
Hourly PM2.5 crawler — OpenAQ v3 /sensors/{id}/measurements (raw hourly)
Safety rules (Phase 14):
- API key อ่านจาก environment เท่านั้น (OPENAQ_API_KEY) ห้าม print
- header X-API-Key (header 'apikey' จะได้ 401 — ผิดตาม OpenAQ spec)
- pagination bounded ด้วย --max-pages (endpoint ไม่กรองวันที่ จึงอ่านเฉพาะหน้าท้าย = ข้อมูลใหม่สุด)
- retry exponential เฉพาะ 429/5xx/network · หยุดทันทีที่ 401/403 · timeout ทุกคำขอ
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
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API_URL = "https://api.openaq.org/v3"
LIMIT = 1000
SLEEP_S = 2.0
TIMEOUT_S = 30
RETRY_DELAYS = [2, 5, 10, 20, 30]


class AuthError(Exception):
    """401/403 — หยุดทันที ไม่ retry"""


def http_get_json(url, headers, params, timeout=TIMEOUT_S, fetch=None):
    """GET + retry/backoff. คืน (status, dict) — fetch injectable สำหรับ unit test"""
    fetch_fn = fetch or _urllib_get
    attempt = 0
    while True:
        try:
            return fetch_fn(url, headers, params, timeout)
        except AuthError:
            raise
        except TransientError:
            attempt += 1
            if attempt > len(RETRY_DELAYS):
                raise
            time.sleep(RETRY_DELAYS[attempt - 1])


class TransientError(Exception):
    """429/5xx/network — retry ได้"""


def _urllib_get(url, headers, params, timeout):
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(f"{url}?{qs}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise AuthError(f"HTTP {e.code} — key ถูกปฏิเสธ (ห้าม retry)")
        if e.code in (408, 429) or e.code >= 500:
            raise TransientError(f"HTTP {e.code}")
        raise RuntimeError(f"HTTP {e.code}")
    except urllib.error.URLError as e:
        raise TransientError(f"network: {e.reason}")


def ts_local_from(item):
    """timestamp เขต Asia/Bangkok จาก period.datetimeFrom.local (fallback utc)"""
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
        if v < 0 or v > 500:  # QC ขั้นต้น: ค่านอกขอบ → ทิ้ง (นับ skipped)
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


def get_api_key():
    """key จาก environment ก่อน — ถ้าไม่มี อ่านจาก admin-app/.env.local (ตาม convention ของโปรเจกต์) · ห้ามพิมพ์ค่า"""
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


def crawl_station(sensor_id, db_path, start=None, end=None, max_pages=3, max_requests=200, sleep_s=SLEEP_S, fetch=None, dry_run=False):
    """คืน stats ของการ crawl สถานีเดียว (ตาราง/แถว/retry/error)"""
    key = get_api_key()
    if not key:
        raise SystemExit("OPENAQ_API_KEY_MISSING — ตั้งค่าใน environment หรือ admin-app/.env.local ก่อน (ค่าไม่แสดงที่นี่)")
    headers = {"X-API-Key": key}
    stats = {"pages": 0, "requests": 0, "retries": 0, "rows_fetched": 0, "rows_in_window": 0, "skipped": 0, "new_or_updated": 0, "stopped_reason": ""}

    conn = sqlite3.connect(db_path)
    conn.execute("""CREATE TABLE IF NOT EXISTS hourly_pm25 (
        station_id TEXT NOT NULL, ts_local TEXT NOT NULL, pm25 REAL NOT NULL,
        unit TEXT, latitude REAL, longitude REAL, source TEXT,
        updated_at TEXT, PRIMARY KEY (station_id, ts_local))""")

    page, total_found, found_capped = 1, None, False
    last_ts_seen = ""
    try:
        while page <= max_pages and stats["requests"] < max_requests:
            params = {"limit": LIMIT, "page": page}
            status, payload = http_get_json(f"{API_URL}/sensors/{sensor_id}/measurements", headers, params, fetch=fetch)
            stats["requests"] += 1
            stats["pages"] += 1
            results = payload.get("results", [])
            if total_found is None:
                # meta.found อาจเป็น string ">1000" (OpenAQ cap) — parse เฉพาะตัวเลข
                found_raw = str((payload.get("meta") or {}).get("found") or "0")
                digits = "".join(ch for ch in found_raw if ch.isdigit())
                total_found = int(digits) if digits else 0
                found_capped = ">" in found_raw
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
            if rows:
                last_ts_seen = max(last_ts_seen, max(r[1] for r in rows))
            total_pages = None if found_capped else (total_found + LIMIT - 1) // LIMIT
            if not found_capped and total_pages and page >= total_pages:
                stats["stopped_reason"] = "reached newest page"
                break
            if end and last_ts_seen[:10] > end:
                stats["stopped_reason"] = "passed window end"
                break
            page += 1
            time.sleep(sleep_s)
    finally:
        conn.close()
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stations", required=True, help="sensor ids คั่นด้วย comma")
    ap.add_argument("--days", type=int, default=14, help="หน้าต่างวันย้อนหลัง (ประมาณ; กรองฝั่งเรา)")
    ap.add_argument("--start", default=None, help="YYYY-MM-DD (ทางเลือกแทน --days)")
    ap.add_argument("--end", default=None)
    ap.add_argument("--max-pages", type=int, default=3)
    ap.add_argument("--max-requests", type=int, default=200)
    ap.add_argument("--db", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "hourly", "pm25_hourly.sqlite"))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    os.makedirs(os.path.dirname(os.path.abspath(a.db)), exist_ok=True)
    today = datetime.now(timezone.utc) + timedelta(hours=7)
    start = a.start or (today - timedelta(days=a.days)).strftime("%Y-%m-%d")
    end = a.end or today.strftime("%Y-%m-%d")
    print(f"crawl window ≈ {start} → {end} · max_pages={a.max_pages} · dry_run={a.dry_run}")

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
