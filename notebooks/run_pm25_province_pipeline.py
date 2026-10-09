"""Daily PM2.5 province pipeline.

Order: live Air4Thai station metadata -> nearest OpenAQ PM2.5 sensor (<=3 km)
-> 60-day backfill/current ingest -> reject invalid observations -> verify
features -> v3 only for the reviewed Bangkok stations -> province-local
persistence baseline for every other province with a fresh real value.

Dry-run is the default.  ``--publish`` is the only mode that writes Supabase.
No interpolation, cross-province borrowing, or training is performed.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import joblib
import numpy as np
import pandas as pd
import requests
import urllib3

ROOT = Path(__file__).resolve().parents[1]
TZ = ZoneInfo("Asia/Bangkok")
# The upstream certificate chain is incomplete in the Windows Python trust
# store. The existing project ingestion uses this public HTTP endpoint; keep
# the fallback explicit rather than disabling TLS verification globally.
AIR4THAI_URL = "http://air4thai.pcd.go.th/services/getNewAQI_JSON.php"
OPENAQ_URL = "https://api.openaq.org/v3"
MODEL_PATH = ROOT / "notebooks/pm25_model_production.joblib"
MODEL_METADATA_PATH = ROOT / "notebooks/pm25_model_production.metadata.json"
TRAINING_PATH = ROOT / "data/vertex/pm25_daily_vertex.csv"
VERIFIED_STATIONS = {"1304328", "1305020", "5077771"}
MODEL_VERSION = "ml-local-v3.0"
BASELINE_VERSION = "persistence-baseline"
MAX_DISTANCE_KM = 3.0
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    # Project-level values are fallback; admin-app/.env.local is authoritative
    # because that is where the existing server configuration lives.
    for path in (ROOT / ".env.local", ROOT / "admin-app/.env.local"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def sanitize_open_aq_key(raw: str) -> str:
    """Remove copy/paste wrappers without ever logging the secret."""
    value = raw.strip().lstrip("<").rstrip(">").strip()
    if not value or any(ord(char) < 32 or char in "<>" for char in value):
        raise RuntimeError("OPENAQ_KEY_MALFORMED")
    if len(value) >= 2 and value[0] in "`'\"" and value[-1] == value[0]:
        raise RuntimeError("OPENAQ_KEY_MALFORMED")
    return value


def retry_json(url: str, *, headers: dict[str, str], params: dict | None = None) -> dict:
    last: Exception | None = None
    for attempt in range(1, 4):
        try:
            # Air4Thai currently redirects to a host whose intermediate
            # certificate is missing on Windows/Python. Keep this exception
            # scoped to that upstream only; OpenAQ and Supabase remain TLS
            # verified.
            verify = "air4thai.pcd.go.th" not in url
            response = requests.get(url, headers=headers, params=params, timeout=60, verify=verify)
            if response.status_code in (401, 403):
                raise RuntimeError("OPENAQ_AUTH_FAILED")
            response.raise_for_status()
            return response.json()
        except RuntimeError as exc:
            if str(exc) == "OPENAQ_AUTH_FAILED":
                raise
            last = exc
            if attempt < 3:
                time.sleep(attempt * 2)
        except Exception as exc:  # network/provider failures are recorded by caller
            last = exc
            if attempt < 3:
                time.sleep(attempt * 2)
    raise RuntimeError(f"UPSTREAM_FAILED:{url.split('/v3')[-1]}") from last


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088
    p1, p2 = np.radians([lat1, lat2])
    dp = np.radians(lat2 - lat1)
    dl = np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return float(2 * radius * np.arcsin(np.sqrt(a)))


def parse_province(area: str) -> str | None:
    parts = [part.strip() for part in re.split(r"[,|]", area or "") if part.strip()]
    if not parts:
        return None
    value = re.sub(r"^(จังหวัด|จ\.|province\s*)", "", parts[-1], flags=re.I).strip()
    return value or None


def fetch_air4thai() -> list[dict]:
    payload = retry_json(AIR4THAI_URL, headers={"Accept": "application/json"})
    stations = payload.get("stations") or []
    result = []
    for row in stations:
        lat, lon = float(row.get("lat") or 0), float(row.get("long") or 0)
        area = str(row.get("areaTH") or "")
        code = str(row.get("stationID") or "").strip()
        province = parse_province(area)
        if code and province and -90 < lat < 90 and -180 < lon < 180:
            result.append({"code": code, "area": area, "province": province,
                           "latitude": lat, "longitude": lon,
                           "name": row.get("nameTH") or row.get("nameEN") or code})
    return result


def match_openaq(station: dict, api_key: str) -> dict | None:
    payload = retry_json(
        f"{OPENAQ_URL}/locations",
        headers={"X-API-Key": api_key, "Accept": "application/json"},
        params={"coordinates": f"{station['latitude']},{station['longitude']}",
                "radius": 3000, "parameters_id": 2, "limit": 100},
    )
    candidates = []
    for location in payload.get("results") or []:
        coords = location.get("coordinates") or {}
        lat, lon = float(coords.get("latitude") or 0), float(coords.get("longitude") or 0)
        distance = haversine_km(station["latitude"], station["longitude"], lat, lon)
        for sensor in location.get("sensors") or []:
            parameter = sensor.get("parameter") or {}
            if parameter.get("id") == 2 or sensor.get("parameter_id") == 2:
                candidates.append({"location_id": location.get("id"),
                                  "sensor_id": sensor.get("id"),
                                  "distance_km": distance, "latitude": lat, "longitude": lon})
    if not candidates:
        return None
    return min(candidates, key=lambda item: item["distance_km"])


def build_mapping(api_key: str) -> list[dict]:
    rows = []
    for station in fetch_air4thai():
        match = match_openaq(station, api_key)
        rows.append({**station, **(match or {}), "active": bool(match),
                     "matched_at": datetime.now(timezone.utc).isoformat()})
    return rows


def fetch_measurements(sensor_id: int, from_date: str, to_date: str, api_key: str) -> list[dict]:
    rows, page = [], 1
    while True:
        payload = retry_json(
            f"{OPENAQ_URL}/sensors/{sensor_id}/measurements",
            headers={"X-API-Key": api_key, "Accept": "application/json"},
            params={"datetime_from": f"{from_date}T00:00:00Z",
                    "datetime_to": f"{to_date}T23:59:59Z", "limit": 1000, "page": page},
        )
        batch = payload.get("results") or []
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
        page += 1


def measurement_date(row: dict) -> str | None:
    period = row.get("period") or {}
    raw = (period.get("datetimeFrom") or {}).get("local") or (period.get("datetimeFrom") or {}).get("utc")
    if not raw:
        raw = (row.get("datetime") or {}).get("utc")
    if not raw:
        return None
    return pd.Timestamp(raw).tz_convert(TZ).date().isoformat() if pd.Timestamp(raw).tzinfo else pd.Timestamp(raw, tz="UTC").tz_convert(TZ).date().isoformat()


def aggregate_measurements(mapping: list[dict], api_key: str, from_date: str, to_date: str) -> list[dict]:
    output = []
    for station in mapping:
        if not station.get("active") or not station.get("sensor_id"):
            continue
        values: dict[str, list[float]] = {}
        for item in fetch_measurements(int(station["sensor_id"]), from_date, to_date, api_key):
            date = measurement_date(item)
            value = float(item.get("value")) if item.get("value") is not None else float("nan")
            if date and np.isfinite(value):
                values.setdefault(date, []).append(value)
        for date, samples in values.items():
            value = float(np.mean(samples))
            output.append({"station_id": str(station["sensor_id"]), "station_name": station["name"],
                          "latitude": station["latitude"], "longitude": station["longitude"],
                          "date": date, "pm25": value})
    return output


def valid_observations(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    accepted, rejected = [], []
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        value = float(row["pm25"])
        if value < 0 or value > 500:
            rejected.append({"station_id": row["station_id"], "observed_date": row["date"], "pm25": value, "reason": "out_of_range"})
            continue
        accepted.append(row)
        grouped.setdefault(row["station_id"], []).append(row)
    for station_rows in grouped.values():
        station_rows.sort(key=lambda row: row["date"])
        for left, right in zip(station_rows, station_rows[1:]):
            if left["pm25"] == right["pm25"]:
                # Only reject the third consecutive equal value; two equal readings are valid.
                prior = station_rows[max(0, station_rows.index(left) - 1)]
                if prior["pm25"] == left["pm25"]:
                    rejected.append({"station_id": right["station_id"], "observed_date": right["date"], "pm25": right["pm25"], "reason": "unchanged_over_3_days"})
                    accepted.remove(right)
    return accepted, rejected


def build_features(series: pd.Series) -> pd.DataFrame:
    frame = pd.DataFrame(index=series.index)
    for lag in [1, 2, 3, 4, 5, 6, 7, 14]: frame[f"lag_{lag}"] = series.shift(lag - 1)
    for window in [3, 7, 14]:
        frame[f"roll_mean_{window}"] = series.rolling(window).mean()
        frame[f"roll_std_{window}"] = series.rolling(window).std()
    for window in [3, 7]:
        frame[f"roll_min_{window}"] = series.rolling(window).min()
        frame[f"roll_max_{window}"] = series.rolling(window).max()
    frame["day_of_week"] = frame.index.dayofweek
    frame["month"] = frame.index.month
    frame["is_high_season"] = frame["month"].isin([12, 1, 2, 3]).astype(int)
    return frame


def provinces_from_frontend() -> list[str]:
    text = (ROOT / "frontend/src/data/thaiProvinces.js").read_text(encoding="utf-8")
    return list(dict.fromkeys(re.findall(r"'([^']+)'", text)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--days", type=int, default=60)
    args = parser.parse_args()
    env = load_env()
    base = (env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL") or "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    openaq_key = sanitize_open_aq_key(env.get("OPENAQ_API_KEY", "")) if env.get("OPENAQ_API_KEY", "").strip() else ""
    if not base or not key or not openaq_key:
        raise RuntimeError("PIPELINE_ENV_MISSING:SUPABASE_URL_OR_SERVICE_ROLE_OR_OPENAQ")
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    override_response = requests.get(f"{base}/rest/v1/pm25_model_overrides", headers=headers,
        params={"select": "province,preferred_model_version", "preferred_model_version": "eq.persistence-baseline"}, timeout=30)
    forced_baseline = {row["province"] for row in (override_response.json() if override_response.ok else [])}
    mapping = build_mapping(openaq_key)
    end = (datetime.now(TZ).date() - timedelta(days=1))
    start = end - timedelta(days=args.days - 1)
    observations = aggregate_measurements(mapping, openaq_key, start.isoformat(), end.isoformat())
    accepted, rejected = valid_observations(observations)
    today = datetime.now(TZ).date()
    latest = pd.DataFrame(accepted).sort_values("date").groupby("station_id", as_index=False).tail(1) if accepted else pd.DataFrame()
    # A baseline is allowed only when the province has a real observation no
    # older than three days. Older values remain historical evidence, never a
    # silently reused forecast input.
    if not latest.empty:
        latest["date"] = pd.to_datetime(latest["date"]).dt.date
        latest = latest[latest["date"] >= today - timedelta(days=3)]
    province_by_sensor = {str(row["sensor_id"]): row["province"] for row in mapping if row.get("active")}
    if not latest.empty:
        latest["province"] = latest["station_id"].map(province_by_sensor)
        latest = latest.dropna(subset=["province"])
    model = joblib.load(MODEL_PATH)
    metadata = json.loads(MODEL_METADATA_PATH.read_text(encoding="utf-8"))
    model_ok = (model.get("version") == metadata["model_version"] == MODEL_VERSION
                and metadata["stations"] == sorted(VERIFIED_STATIONS)
                and model.get("features") == metadata["features"]
                and metadata["horizons_days"] == [1, 2, 3])
    forecast_rows, versions = [], {}
    if not latest.empty:
        for province, group in latest.groupby("province"):
            if province == "กรุงเทพมหานคร" and province not in forced_baseline and model_ok and VERIFIED_STATIONS.issubset(set(group.station_id)):
                prediction_lists = {1: [], 2: [], 3: []}
                for station_id in sorted(VERIFIED_STATIONS):
                    series = pd.DataFrame(accepted).query("station_id == @station_id").set_index("date")["pm25"]
                    series.index = pd.to_datetime(series.index)
                    series = series.asfreq("D")
                    origin = series.dropna().index.max()
                    features = build_features(series)
                    x = features.loc[[origin], model["features"]]
                    if not np.isfinite(x.to_numpy(dtype=float)).all():
                        prediction_lists = {1: [], 2: [], 3: []}; break
                    for horizon in (1, 2, 3):
                        value = float(model["models"][horizon].predict(x)[0]) * .5 + float(series.loc[origin]) * .5
                        prediction_lists[horizon].append(max(0.0, value))
                use_ml = all(len(prediction_lists[h]) == len(VERIFIED_STATIONS) for h in (1, 2, 3))
            else:
                use_ml = False
            version = MODEL_VERSION if use_ml else BASELINE_VERSION
            versions[province] = version
            for horizon in (1, 2, 3):
                value = float(np.mean(prediction_lists[horizon])) if use_ml else float(group.pm25.mean())
                forecast_rows.append({"province": province, "target_date": (today + timedelta(days=horizon)).isoformat(),
                    "issued_date": today.isoformat(), "horizon": horizon, "pm25": round(value, 2),
                    "model_version": version, "generated_at": datetime.now(timezone.utc).isoformat(),
                    "status": "ok", "source_issued_date": today.isoformat(), "is_fallback": False})
    all_provinces = provinces_from_frontend()
    province_status = {province: {"status": "unsupported", "reason": "ไม่มีค่าจริงล่าสุดภายใน 3 วัน"} for province in all_provinces}
    for province, version in versions.items():
        province_status[province] = {"status": "ok", "reason": "ml-local-v3.0 ผ่าน guard" if version == MODEL_VERSION else "ใช้ค่าจริงล่าสุดของจังหวัดเป็น baseline", "model_version": version}
    status_counts = {"ok": sum(row["status"] == "ok" for row in province_status.values()),
                     "stale": 0, "unsupported": sum(row["status"] == "unsupported" for row in province_status.values()), "error": 0}
    if args.publish:
        def post(table: str, payload: list[dict], conflict: str | None = None) -> None:
            if not payload: return
            params = f"?on_conflict={conflict}" if conflict else ""
            response = requests.post(f"{base}/rest/v1/{table}{params}", headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"}, json=payload, timeout=120)
            response.raise_for_status()
        post("province_stations", [{"province": r["province"], "air4thai_station_code": r["code"], "air4thai_area": r["area"],
            "latitude": r["latitude"], "longitude": r["longitude"], "openaq_location_id": r.get("location_id"),
            "openaq_sensor_id": r.get("sensor_id"), "distance_km": r.get("distance_km"), "matched_at": r["matched_at"], "active": r["active"]} for r in mapping], "province,air4thai_station_code")
        post("air_quality_daily", accepted, "station_id,date")
        post("pm25_quality_rejections", rejected, "station_id,observed_date,reason")
        post("pm25_forecast", forecast_rows, "province,target_date,issued_date,horizon,model_version")
        run = {"run_date": today.isoformat(), "status": "ok" if forecast_rows else "partial", "started_at": datetime.now(timezone.utc).isoformat(),
               "finished_at": datetime.now(timezone.utc).isoformat(), "stations_total": len(mapping),
               "stations_missing": [r["code"] for r in mapping if not r.get("active")], "provinces_covered": len(versions),
               "phase": "ingest_backfill_validate_inference_publish", "missing_stations": [r["code"] for r in mapping if not r.get("active")],
               "detail": {"status_counts": status_counts, "province_status": province_status, "model_versions": versions, "rejected": len(rejected)}}
        post("pipeline_runs", [run])
    print(json.dumps({"mode": "published" if args.publish else "dry-run", "air4thai_stations": len(mapping),
        "matched_stations": sum(1 for row in mapping if row.get("active")), "observations_accepted": len(accepted),
        "observations_rejected": len(rejected), "province_status_counts": status_counts,
        "model_version_by_province": versions, "province_status": province_status, "rows": len(forecast_rows)}, ensure_ascii=False, indent=2))


def record_failed_run(error: Exception) -> None:
    """Best-effort failure log; never masks the original pipeline error."""
    try:
        cfg = load_env(); base = (cfg.get("NEXT_PUBLIC_SUPABASE_URL") or cfg.get("SUPABASE_URL") or "").rstrip("/"); key = cfg.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not base or not key: return
        headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        now = datetime.now(timezone.utc).isoformat()
        requests.post(f"{base}/rest/v1/pipeline_runs", headers=headers, json=[{"run_date": datetime.now(TZ).date().isoformat(), "status": "failed", "started_at": now, "finished_at": now, "phase": "pipeline", "detail": {"error": str(error).split(":", 1)[0]}}], timeout=30)
    except Exception:
        pass


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        record_failed_run(error)
        print(json.dumps({"mode": "failed", "error": str(error).split(":", 1)[0]}, ensure_ascii=False))
        raise SystemExit(1)
