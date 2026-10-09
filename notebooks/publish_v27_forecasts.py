"""Daily batch inference for the frozen 24-station PM2.5 model.

Run after daily ingest. Reads credentials only from runner environment variables.
It never trains, interpolates missing observations, or predicts unsupported stations.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import requests

from evaluate_v27_holdout_oct01_07 import (
    METADATA_PATH,
    get_actual_rows,
    get_observed_weather,
    load_frozen_model,
    make_features,
)


ROOT = Path(__file__).resolve().parent
LOCAL_TZ = ZoneInfo("Asia/Bangkok")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--publish",
        action="store_true",
        help="write forecasts to Supabase (disabled by default)",
    )
    parser.add_argument(
        "--allow-underperforming-model",
        action="store_true",
        help="explicitly acknowledge the recorded holdout result is worse than persistence",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="calculate and validate without writing (default behavior)",
    )
    args = parser.parse_args()
    if args.publish and not args.allow_underperforming_model:
        parser.error(
            "publishing is blocked because the recorded holdout is worse than persistence; "
            "pass --allow-underperforming-model only after explicitly accepting that risk"
        )
    if args.publish and args.dry_run:
        parser.error("choose either --publish or --dry-run")
    dry_run = not args.publish

    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    model_bundle = load_frozen_model(metadata)
    station_mapping = {
        item["station_id"]: item
        for item in metadata["station_code_mapping"]
    }
    target_date = datetime.now(LOCAL_TZ).date()
    yesterday = target_date - timedelta(days=1)
    history_start = target_date - timedelta(days=45)
    rows = get_actual_rows(history_start, yesterday)
    actual = pd.DataFrame(rows)
    if actual.empty:
        raise RuntimeError("NO_DAILY_OBSERVATIONS_FROM_DATABASE")
    actual["station_id"] = actual["station_id"].astype(str)
    actual["date"] = pd.to_datetime(actual["date"])
    actual["pm25"] = pd.to_numeric(actual["pm25"], errors="coerce")
    actual = actual.dropna(subset=["pm25"])

    last_by_station = actual.sort_values("date").groupby("station_id").tail(1).set_index("station_id")
    eligible_ids = [
        station_id for station_id in station_mapping
        if station_id in last_by_station.index
        and last_by_station.loc[station_id, "date"].date() == yesterday
    ]
    missing_yesterday_ids = sorted(set(station_mapping) - set(eligible_ids))
    if not eligible_ids:
        print(json.dumps({
            "state": "no_forecasts",
            "reason": "NO_SUPPORTED_STATION_HAS_YESTERDAY_OBSERVATION",
            "target_date": target_date.isoformat(),
            "missing_yesterday_station_count": len(missing_yesterday_ids),
        }, ensure_ascii=False))
        return

    training_locations_path = ROOT.parent / "data/vertex/pm25_daily_vertex.csv"
    location_rows = pd.read_csv(training_locations_path)
    location_rows["station_id"] = location_rows["location_id"].astype(str)
    locations = location_rows.drop_duplicates("station_id").set_index("station_id")

    target_rows = pd.DataFrame({"station_id": eligible_ids, "date": pd.Timestamp(target_date)})
    weather_frames = [
        get_observed_weather(locations.loc[station_id], yesterday, yesterday)
        for station_id in eligible_ids
    ]
    weather = pd.concat(weather_frames, ignore_index=True) if weather_frames else pd.DataFrame()
    features = make_features(actual[["station_id", "date", "pm25"]], metadata, weather, target_rows)
    target_features = features[
        features["station_id"].isin(eligible_ids)
        & (features["date"].dt.date == target_date)
    ].copy()
    feature_names = metadata["features"]
    target_features["features_complete"] = np.isfinite(
        target_features[feature_names].to_numpy(dtype=float)
    ).all(axis=1)
    valid = target_features[target_features["features_complete"]]
    skipped_incomplete_features = len(eligible_ids) - len(valid)

    forecasts = []
    if not valid.empty:
        values = np.asarray(model_bundle["model"].predict(valid[feature_names]), dtype=float)
        generated_at = datetime.now(timezone.utc).isoformat()
        for (_, row), value in zip(valid.iterrows(), values):
            if not np.isfinite(value) or value < 0 or value > 500:
                continue
            mapping = station_mapping[row["station_id"]]
            forecasts.append({
                "station_id": row["station_id"],
                "province": mapping["province"],
                "date": target_date.isoformat(),
                "pm25": round(float(value), 2),
                "pm25_min": None,
                "pm25_max": None,
                "horizon": 1,
                "model_version": metadata["model_version"],
                "updated_at": generated_at,
            })

    base_url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if forecasts and (not base_url or not service_key):
        raise RuntimeError("SUPABASE_SERVER_CONFIGURATION_MISSING")
    if forecasts and not dry_run:
        response = requests.post(
            f"{base_url}/rest/v1/pm25_forecast_daily",
            params={"on_conflict": "station_id,date,model_version"},
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=forecasts,
            timeout=60,
        )
        response.raise_for_status()

    print(json.dumps({
        "state": "no_forecasts" if not forecasts else ("dry_run" if dry_run else "published"),
        "dry_run": dry_run,
        "target_date": target_date.isoformat(),
        "trained_until": metadata["trained_until"],
        "model_version": metadata["model_version"],
        "forecast_station_count": len(forecasts),
        "missing_yesterday_station_count": len(missing_yesterday_ids),
        "incomplete_feature_station_count": skipped_incomplete_features,
        "unsupported_station_count": 33 - len(station_mapping),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
