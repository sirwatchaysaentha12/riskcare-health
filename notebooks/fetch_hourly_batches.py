# -*- coding: utf-8 -*-
"""
Batch runner สำหรับ hourly crawler — แบ่งช่วงเวลาเป็น batch เล็ก ไม่ overlap
- reuse crawl_station จาก fetch_hourly_pm25 (auth/pagination/retry เดิมทั้งหมด)
- manifest JSON (atomic write) ไม่มี secret · resume ข้าม batch ที่สำเร็จแล้ว
- หยุดทั้งงานเมื่อ 401/403 · backoff จำกัดเมื่อ 429/408
Usage:
  python fetch_hourly_batches.py --stations 1304179,1304281,1304403 \
      --start 2026-09-01 --end 2026-10-03 --batch-days 30 --max-batches 6
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import argparse
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_hourly_pm25 import AuthError, TransientError, crawl_station  # noqa: E402

MANIFEST = Path(__file__).resolve().parent.parent / "data" / "hourly" / "batch_manifest.json"


def load_manifest():
    if MANIFEST.exists():
        try:
            return json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"batches": {}}


def save_manifest_atomic(m):
    tmp = MANIFEST.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(MANIFEST)  # atomic write


def batch_key(station, b_start, b_end):
    return f"{station}:{b_start}:{b_end}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stations", required=True)
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--batch-days", type=int, default=30)
    ap.add_argument("--max-batches", type=int, default=12)
    ap.add_argument("--max-requests", type=int, default=400)
    ap.add_argument("--sleep-seconds", type=float, default=2.0)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--resume", action="store_true", help="ข้าม batch ที่สำเร็จแล้วตาม manifest")
    ap.add_argument("--force", action="store_true", help="รับชมซ้ำแม้ manifest บอกสำเร็จ")
    ap.add_argument("--db", default=str(Path(__file__).resolve().parent.parent / "data" / "hourly" / "pm25_hourly.sqlite"))
    ap.add_argument("--max-pages", type=int, default=3)
    a = ap.parse_args()

    stations = [s.strip() for s in a.stations.split(",") if s.strip()]
    start, end = a.start, a.end
    manifest = load_manifest()
    total_requests = total_rows = 0
    ok = failed = skipped = 0

    # สร้างรายการ batch: ต่อสถานี ตัดช่วง [start, end] เป็นชิ้น batch-days วัน (ไม่ overlap)
    batches = []
    d0 = datetime.fromisoformat(start)
    d1 = datetime.fromisoformat(end)
    for station in stations:
        cur = d0
        while cur <= d1 and len(batches) < a.max_batches * len(stations):
            b_end = min(cur + timedelta(days=a.batch_days - 1), d1)
            batches.append((station, cur.date().isoformat(), b_end.date().isoformat()))
            cur = b_end + timedelta(days=1)

    print(f"batch ทั้งหมด: {len(batches)} (สถานี {len(stations)} × ช่วง {start}→{end} · batch-days={a.batch_days})")

    try:
        for station, b_start, b_end in batches:
            key = batch_key(station, b_start, b_end)
            prev = manifest["batches"].get(key, {})
            if a.resume and not a.force and prev.get("status") == "ok":
                skipped += 1
                continue

            t0 = time.time()
            entry = {"station": station, "batch_start": b_start, "batch_end": b_end,
                     "status": "failed", "rows_in_window": 0, "new_or_updated": 0,
                     "requests": 0, "retries": 0, "error": "", "ran_at": datetime.now(timezone.utc).isoformat()}
            try:
                st = crawl_station(station, a.db, start=b_start, end=b_end,
                                   max_pages=a.max_pages, max_requests=a.max_requests,
                                   sleep_s=a.sleep_seconds, dry_run=a.dry_run)
                entry.update({"status": "ok" if st["stopped_reason"] else "partial",
                              "pages": st["pages"], "rows_in_window": st["rows_in_window"],
                              "new_or_updated": st["new_or_updated"], "requests": st["requests"],
                              "retries": st.get("retries", 0), "stopped_reason": st["stopped_reason"] or "-",
                              "elapsed_s": round(time.time() - t0, 1)})
                total_requests += st["requests"]
                total_rows += st["rows_in_window"]
                ok += 1
            except AuthError as e:
                entry["error"] = "AUTH_REJECTED"
                manifest["batches"][key] = entry
                save_manifest_atomic(manifest)
                print(f"หยุดทั้งงาน: {e} (station {station} batch {b_start}→{b_end})")
                break
            except (TransientError, RuntimeError) as e:
                entry["error"] = str(e)[:120]
                failed += 1
            manifest["batches"][key] = entry
            save_manifest_atomic(manifest)
            print(f"{key}: {entry['status']} rows={entry['rows_in_window']} req={entry['requests']} "
                  f"new={entry['new_or_updated']} {('err=' + entry['error']) if entry['error'] else ''}")
            time.sleep(a.sleep_seconds)
    except KeyboardInterrupt:
        print("\nหยุดด้วยผู้ใช้ (graceful) — manifest บันทึกทุก batch ที่ทำเสร็จแล้ว")
        save_manifest_atomic(manifest)

    print(f"\nสรุป: ok={ok} failed={failed} skipped(resume)={skipped} · requests={total_requests} rows={total_rows}")
    print(f"manifest: {MANIFEST}")


if __name__ == "__main__":
    main()
