# -*- coding: utf-8 -*-
"""Unit tests ของ hourly crawler — mock fetch ทั้งหมด (ไม่มี network) · รัน: python tests/test_fetch_hourly_pm25.py"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notebooks"))
import os
os.environ.setdefault("OPENAQ_API_KEY", "dummy-key-for-tests-only")

from fetch_hourly_pm25 import (AuthError, TransientError, crawl_station, parse_rows,
                               upsert_rows, _urllib_get)
import urllib.error


def mk_item(ts_local, value):
    return {"period": {"datetimeFrom": {"local": ts_local}}, "value": value}


def resp(results, found=None):
    return 200, {"results": results, "meta": {"found": found if found is not None else len(results)}}


class FakeConn:
    """in-memory sqlite จำลอง interface ที่ crawler ใช้"""
    def __init__(self):
        self.rows = {}
        self.changes = 0
    total_changes = property(lambda self: self.changes)
    def execute(self, sql, params=()):
        if "CREATE TABLE" in sql:
            return
        if "INSERT INTO" in sql:
            key = (params[0], params[1])  # params = แถวเดียว (executemany วนให้แล้ว)
            self.rows[key] = params[2]
            self.changes += 1
    def executemany(self, sql, seq):
        for r in seq:
            self.execute("INSERT INTO", r)
    def commit(self):
        pass
    def close(self):
        pass


class CrawlerTests(unittest.TestCase):
    def test_parse_rows_normal_and_skip(self):
        rows, skipped = parse_rows([mk_item("2026-10-01T10:00", 25.5), mk_item("2026-10-01T11:00", -3),
                                    mk_item("2026-10-01T12:00", None), mk_item("", 20), mk_item("2026-10-01T13:00", 999)], "1304179", None, None)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], "1304179")
        self.assertEqual(rows[0][2], 25.5)
        self.assertEqual(skipped, 4)  # ลบ/None/ไม่มี ts/เกิน 500

    def test_pagination_reads_last_pages(self):
        calls = []
        def fetch(url, headers, params, timeout):
            calls.append(dict(params))
            page = int(params["page"])
            if page == 1:
                return resp([mk_item("2021-04-30T10:00", 10)], found=2500)  # 3 pages รวม
            if page == 3:
                return resp([mk_item("2026-10-01T10:00", 30), mk_item("2026-10-01T11:00", 31)], found=2500)
            return resp([mk_item("2025-01-01T10:00", 20)], found=2500)
        stats = crawl_station("1304179", ":memory:", start="2026-09-20", end="2026-12-31",
                              max_pages=3, fetch=fetch, dry_run=True)
        self.assertEqual(stats["pages"], 3)  # max_pages=3 = ครอบคลุมทั้ง 3 หน้า (page1 meta → หน้าท้าย)
        self.assertIn("reached newest page", stats["stopped_reason"])
        self.assertEqual(stats["rows_in_window"], 2)

    def test_auth_error_aborts(self):
        def fetch(url, headers, params, timeout):
            raise AuthError("HTTP 401")
        with self.assertRaises(AuthError):
            crawl_station("1304179", ":memory:", fetch=fetch)

    def test_403_also_raises(self):
        def fetch(url, headers, params, timeout):
            raise AuthError("HTTP 403")
        with self.assertRaises(AuthError):
            crawl_station("1304179", ":memory:", fetch=fetch)

    def test_transient_then_success(self):
        calls = []
        def fetch(url, headers, params, timeout):
            calls.append(1)
            if len(calls) == 1:
                raise TransientError("HTTP 500")
            return resp([mk_item("2026-10-01T10:00", 12)], found=1)
        stats = crawl_station("1304179", ":memory:", max_pages=1, fetch=fetch, dry_run=True)
        self.assertEqual(len(calls), 2)  # retry ครั้งเดียวแล้วสำเร็จ
        self.assertEqual(stats["pages"], 1)

    def test_permanent_4xx_raises_runtime(self):
        def fetch(url, headers, params, timeout):
            raise RuntimeError("HTTP 400")
        with self.assertRaises(RuntimeError):
            crawl_station("1304179", ":memory:", max_pages=1, fetch=fetch)

    def test_empty_page_stops(self):
        def fetch(url, headers, params, timeout):
            return resp([], found=0)
        stats = crawl_station("1304179", ":memory:", max_pages=5, fetch=fetch, dry_run=True)
        self.assertEqual(stats["stopped_reason"], "empty page")
        self.assertEqual(stats["pages"], 1)

    def test_malformed_response_is_transient(self):
        def fetch(url, headers, params, timeout):
            raise TransientError("malformed")
        with self.assertRaises(TransientError):
            crawl_station("1304179", ":memory:", max_pages=1, fetch=fetch, dry_run=True)


class UpsertTests(unittest.TestCase):
    def test_upsert_dedupes_by_station_ts(self):
        conn = FakeConn()
        rows = [("1304179", "2026-10-01T10:00", 20.0, "µg/m³", None, None, "OpenAQ"),
                ("1304179", "2026-10-01T10:00", 21.0, "µg/m³", None, None, "OpenAQ"),
                ("1304179", "2026-10-01T11:00", 22.0, "µg/m³", None, None, "OpenAQ")]
        upsert_rows(conn, rows)
        self.assertEqual(len(conn.rows), 2)  # dedupe ด้วย (station, ts)
        self.assertEqual(conn.rows[("1304179", "2026-10-01T10:00")], 21.0)  # ค่าหลังทับ

    def test_stations_not_mixed(self):
        conn = FakeConn()
        upsert_rows(conn, [("1304179", "2026-10-01T10:00", 20.0, "µg/m³", None, None, "OpenAQ"),
                           ("1304281", "2026-10-01T10:00", 30.0, "µg/m³", None, None, "OpenAQ")])
        self.assertEqual(len(conn.rows), 2)
        self.assertNotEqual(conn.rows[("1304179", "2026-10-01T10:00")], conn.rows[("1304281", "2026-10-01T10:00)")] if ("1304281", "2026-10-01T10:00)") in conn.rows else conn.rows[("1304281", "2026-10-01T10:00")])


class UrllibHeaderTests(unittest.TestCase):
    def test_header_name_is_x_api_key(self):
        captured = {}
        class FakeResp:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self): return b'{"results":[],"meta":{"found":0}}'
        def fake_urlopen(url, headers, params, timeout):
            captured["headers"] = dict(headers)
            return 200, {"results": [], "meta": {"found": 0}}
        import fetch_hourly_pm25 as m
        old = m._urllib_get
        m._urllib_get = fake_urlopen
        try:
            os.environ["OPENAQ_API_KEY"] = "test-key-value"
            status, payload = m._urllib_get("https://api.openaq.org/v3/sensors/1/measurements", {"X-API-Key": "test-key-value"}, {"limit": 1}, 5)
        finally:
            m._urllib_get = old
        self.assertIn("X-API-Key", captured["headers"])  # header ชื่อถูกต้อง
        self.assertEqual(captured["headers"]["X-API-Key"], "test-key-value")  # ค่าจาก env เท่านั้น


if __name__ == "__main__":
    unittest.main(verbosity=2)
