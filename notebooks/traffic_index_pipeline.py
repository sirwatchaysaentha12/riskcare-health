"""Collect Longdo road-speed observations and join a derived traffic feature to PM2.5.

Longdo's coordinate endpoint returns road speed (m/s), not an official per-zone
Traffic Index. This script derives a transparent 0-100 congestion proxy against
an operator-supplied free-flow speed baseline. Calibrate that baseline per zone.

Install: pip install requests supabase python-dotenv pandas
Environment: LONGDO_API_KEY, SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

Export every saved traffic observation to CSV:
  python notebooks/traffic_index_pipeline.py export-traffic --output data/traffic_observations.csv
"""

from __future__ import annotations

import argparse
import importlib
import math
import os
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LONGDO_SPEED_URL = "https://api.longdo.com/RouteService/json/traffic/speed"
PAGE_SIZE = 1000
DEFAULT_LATITUDE = 13.7563
DEFAULT_LONGITUDE = 100.5018


class PipelineError(Exception):
    """Safe-to-display configuration or workflow error (contains no credentials)."""


def optional_load_dotenv() -> None:
    """Load root .env.local/.env when available; never override OS environment."""
    try:
        dotenv = importlib.import_module("dotenv")
    except ImportError:
        return
    project_root = Path(__file__).resolve().parents[1]
    loaded = False
    for filename in (".env.local", ".env"):
        env_file = project_root / filename
        if env_file.is_file():
            dotenv.load_dotenv(env_file, override=False)
            loaded = True
    if not loaded:
        dotenv.load_dotenv(override=False)


def dependency(name: str, install_hint: str):
    try:
        return importlib.import_module(name)
    except ImportError as exc:
        raise PipelineError(f"Missing Python dependency '{name}'. Install with: {install_hint}") from exc


def required_env(name: str) -> str:
    optional_load_dotenv()
    value = os.getenv(name, "").strip()
    if not value:
        raise PipelineError(f"Required environment variable is missing or empty: {name}")
    return value


def supabase_client():
    supabase = dependency("supabase", "pip install supabase")
    supabase_url = os.getenv("SUPABASE_URL", "").strip() or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    if not supabase_url:
        raise PipelineError("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in environment or project .env.local.")
    return supabase.create_client(supabase_url, required_env("SUPABASE_SERVICE_ROLE_KEY"))


def get_road_speed(lat: float, lon: float, radius: float, timeout: float) -> float | None:
    """Return Longdo speed in m/s, or None when no valid road observation exists."""
    requests = dependency("requests", "pip install requests")
    response = requests.get(
        LONGDO_SPEED_URL,
        params={"lat": lat, "lon": lon, "range": radius, "locale": "en", "key": required_env("LONGDO_API_KEY")},
        timeout=timeout,
    )
    response.raise_for_status()
    payload: dict[str, Any] = response.json()
    meta = payload.get("meta") or {}
    if meta.get("error"):
        # Do not print the request URL or query parameters (which include the key).
        raise PipelineError("Longdo rejected the traffic request; check API access and query parameters.")
    speed = payload.get("speed")
    if isinstance(speed, (int, float)) and speed >= 0:
        return float(speed)
    return None


def parse_points(args: argparse.Namespace) -> list[tuple[float, float]]:
    if args.points:
        try:
            points = []
            for item in args.points.split(";"):
                parts = item.split(",")
                if len(parts) != 2:
                    raise ValueError
                points.append((float(parts[0].strip()), float(parts[1].strip())))
        except (TypeError, ValueError) as exc:
            raise ValueError("--points format must be 'lat,lon;lat,lon'") from exc
    elif args.lat is not None and args.lon is not None:
        points = [(args.lat, args.lon)]
    else:
        raise ValueError("Provide --lat and --lon, or --points 'lat,lon;lat,lon'")
    if not points or any(
        not (math.isfinite(lat) and math.isfinite(lon)
             and -90 <= lat <= 90 and -180 <= lon <= 180)
        for lat, lon in points
    ):
        raise ValueError("Coordinates are outside valid latitude/longitude ranges")
    return points


def derived_index(speed_mps: float, baseline_kmh: float) -> float:
    """0 means at/above the assumed free-flow speed; 100 means stopped."""
    baseline_mps = baseline_kmh / 3.6
    return round(max(0.0, min(100.0, 100.0 * (1.0 - speed_mps / baseline_mps))), 2)


def collect(args: argparse.Namespace) -> None:
    baseline_value = args.free_flow_speed_kmh
    if baseline_value is None:
        baseline_value = os.getenv("LONGDO_FREE_FLOW_SPEED_KMH", "").strip()
    if baseline_value in (None, ""):
        raise PipelineError("Set LONGDO_FREE_FLOW_SPEED_KMH or pass --free-flow-speed-kmh (positive km/h).")
    try:
        baseline_kmh = float(baseline_value)
    except (TypeError, ValueError) as exc:
        raise PipelineError("LONGDO_FREE_FLOW_SPEED_KMH / --free-flow-speed-kmh must be numeric km/h.") from exc
    if not math.isfinite(baseline_kmh) or baseline_kmh <= 0:
        raise PipelineError("LONGDO_FREE_FLOW_SPEED_KMH / --free-flow-speed-kmh must be greater than zero.")
    if not (0 < args.range <= 0.001):
        raise ValueError("--range must be greater than 0 and no more than 0.001")
    if args.timeout <= 0:
        raise ValueError("--timeout must be greater than zero")
    points = parse_points(args)
    speeds: list[float] = []
    failures = 0
    for lat, lon in points:
        try:
            speed = get_road_speed(lat, lon, args.range, args.timeout)
            if speed is not None:
                speeds.append(speed)
        except Exception as exc:
            failures += 1
            print(f"Point ({lat:.5f},{lon:.5f}) failed: {type(exc).__name__}", file=sys.stderr)
    if not speeds:
        raise PipelineError(f"No valid Longdo road-speed observations; failed point requests: {failures}.")

    median_speed = statistics.median(speeds)
    observed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    row = {
        "zone_id": args.zone_id,
        "observed_at": observed_at,
        "traffic_index": derived_index(median_speed, baseline_kmh),
        "mean_speed_mps": round(statistics.mean(speeds), 4),
        "sample_count": len(speeds),
        "latitude": round(statistics.mean(lat for lat, _ in points), 6),
        "longitude": round(statistics.mean(lon for _, lon in points), 6),
        "source": "Longdo Traffic Speed API",
        "index_method": "derived_speed_congestion_proxy",
    }
    result = supabase_client().table("traffic_index_observations").upsert(
        row, on_conflict="zone_id,observed_at"
    ).execute()
    print(f"Saved 1 observation for zone {args.zone_id}; valid points={len(speeds)}, failures={failures}.")
    if not result.data:
        print("Supabase accepted the request but returned no row representation.")


def fetch_all(client, table: str, columns: str, filters: dict[str, str] | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        query = client.table(table).select(columns)
        for column, value in (filters or {}).items():
            query = query.eq(column, value)
        page = query.range(offset, offset + PAGE_SIZE - 1).execute().data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def build_features(args: argparse.Namespace) -> None:
    pd = dependency("pandas", "pip install pandas")
    client = supabase_client()
    pollution = fetch_all(
        client, "air_quality_daily", "station_id,station_name,date,pm25,latitude,longitude",
        {"station_id": args.station_id},
    )
    traffic = fetch_all(
        client, "traffic_index_observations", "zone_id,observed_at,traffic_index,mean_speed_mps,sample_count",
        {"zone_id": args.zone_id},
    )
    if not pollution:
        raise PipelineError(f"No pollution rows found for station_id={args.station_id}.")
    if not traffic:
        raise PipelineError(f"No traffic observations found for zone_id={args.zone_id}.")

    pm = pd.DataFrame(pollution)
    pm["date"] = pd.to_datetime(pm["date"], errors="coerce").dt.date
    pm["pm25"] = pd.to_numeric(pm["pm25"], errors="coerce")
    pm = pm.dropna(subset=["date", "pm25"])

    tr = pd.DataFrame(traffic)
    # Traffic is aggregated by Bangkok local calendar date; no forward-fill is
    # applied, so missing traffic stays missing rather than inventing a feature.
    times = pd.to_datetime(tr["observed_at"], utc=True, errors="coerce").dt.tz_convert("Asia/Bangkok")
    tr["date"] = times.dt.date
    tr["traffic_index"] = pd.to_numeric(tr["traffic_index"], errors="coerce")
    daily = (tr.dropna(subset=["date", "traffic_index"])
             .groupby("date", as_index=False)
             .agg(traffic_index=("traffic_index", "mean"),
                  traffic_mean_speed_mps=("mean_speed_mps", "mean"),
                  traffic_sample_count=("sample_count", "sum")))
    merged = pm.merge(daily, on="date", how="left", validate="many_to_one")
    merged["traffic_zone_id"] = args.zone_id
    merged["traffic_index_method"] = "derived_speed_congestion_proxy"
    merged = merged.sort_values("date")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(output, index=False)
    print(f"Wrote {len(merged)} pollution rows to {output}; rows with traffic={merged['traffic_index'].notna().sum()}.")
    print("Rows with missing traffic remain null; inspect coverage before model training.")


def export_traffic(args: argparse.Namespace) -> None:
    """Fetch all pages of saved observations and export them as a DataFrame/CSV."""
    if args.show_head < 0:
        raise ValueError("--show-head must be zero or greater")
    pd = dependency("pandas", "pip install pandas")
    client = supabase_client()
    filters = {"zone_id": args.zone_id} if args.zone_id else None
    rows = fetch_all(client, "traffic_index_observations", "*", filters)
    frame = pd.DataFrame(rows)
    if frame.empty:
        # Keep a useful, schema-shaped CSV even when the table/filter has no rows.
        frame = pd.DataFrame(columns=[
            "id", "zone_id", "observed_at", "traffic_index", "mean_speed_mps",
            "sample_count", "latitude", "longitude", "source", "index_method", "created_at",
        ])
    if "observed_at" in frame.columns:
        frame = frame.sort_values("observed_at", kind="stable").reset_index(drop=True)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output, index=False)
    print(f"Exported {len(frame)} traffic observation(s) to {output}.")
    if args.show_head:
        print(frame.head(args.show_head).to_string(index=False))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    get = commands.add_parser("collect", help="Fetch zone point speeds and save a derived congestion proxy")
    get.add_argument("--zone-id", required=True)
    get.add_argument("--station-id", help="Optional documentation/mapping reference; zone-to-station mapping remains explicit")
    get.add_argument("--lat", type=float, default=DEFAULT_LATITUDE)
    get.add_argument("--lon", type=float, default=DEFAULT_LONGITUDE)
    get.add_argument("--points", help="Semicolon-separated sample points: lat,lon;lat,lon")
    get.add_argument("--range", type=float, default=0.001, help="Longdo search range in degrees (API max is about 0.001)")
    get.add_argument("--free-flow-speed-kmh", type=float, default=None)
    get.add_argument("--timeout", type=float, default=15)
    get.set_defaults(func=collect)

    features = commands.add_parser("build-features", help="Join pollution daily rows with zone traffic by Bangkok date")
    features.add_argument("--zone-id", required=True)
    features.add_argument("--station-id", required=True)
    features.add_argument("--output", default="data/pm25_traffic_features.csv")
    features.set_defaults(func=build_features)

    export = commands.add_parser("export-traffic", help="Export all traffic observations from Supabase to CSV")
    export.add_argument("--zone-id", help="Optional zone filter; omit to export all zones")
    export.add_argument("--output", default="data/traffic_observations.csv")
    export.add_argument("--show-head", type=int, default=0, metavar="N", help="Print the first N rows after export")
    export.set_defaults(func=export_traffic)
    return root


if __name__ == "__main__":
    try:
        optional_load_dotenv()
        options = parser().parse_args()
        options.func(options)
    except PipelineError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
    except ValueError:
        print("ERROR: Invalid input/configuration. Check coordinates, baseline speed, and requested data.", file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        # Avoid printing request URLs or exception strings from HTTP libraries;
        # those may include query parameters. Keep diagnostics sanitized.
        print(f"ERROR: {type(error).__name__}: external API or Supabase operation failed; sensitive details hidden.", file=sys.stderr)
        sys.exit(1)
