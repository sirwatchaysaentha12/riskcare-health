"""Rolling one-day-ahead holdout evaluation for the frozen v2.7 model.

Uses actual air_quality_daily observations after trained_until and observed
Open-Meteo archive weather features. This script never fits/trains a model.
Required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations

import __main__
import hashlib
import json
import os
from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import requests
import sklearn
from sklearn.metrics import mean_absolute_error, mean_squared_error


ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
METADATA_PATH = ROOT / "pm25_model_v2.7_filtered.metadata.json"
MODEL_PATH = ROOT / "pm25_model_v2.7_filtered.joblib"
TRAINING_DATA_PATH = PROJECT_ROOT / "data/vertex/pm25_daily_vertex.csv"
REPORT_PATH = PROJECT_ROOT / "data/vertex/v27_holdout_20261001_07.json"
HOLDOUT_FROM = date(2026, 10, 1)
HOLDOUT_TO = date(2026, 10, 7)
HISTORY_FROM = date(2026, 9, 15)


class LocalEnsemble:
    """Compatibility shim for the class serialized from the training __main__."""

    def __init__(self, models):
        self.models = models

    def predict(self, frame):
        return np.mean([model.predict(frame) for model in self.models], axis=0)


# The existing artifact pickles this wrapper as __main__.LocalEnsemble.
__main__.LocalEnsemble = LocalEnsemble


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def get_actual_rows(
    start_date: date = HISTORY_FROM,
    end_date: date = HOLDOUT_TO,
    station_ids: list[str] | None = None,
) -> list[dict]:
    base_url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    api_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not base_url or not api_key:
        raise RuntimeError("SUPABASE_SERVER_CONFIGURATION_MISSING")

    session = requests.Session()
    # Query station-by-station: PostgREST deployments may reject offset ranges
    # beyond the server row cap. This also avoids deriving station codes from
    # whichever stations happen to be present in the database today.
    query_groups = [station_ids] if station_ids else [
        [str(value)] for value in pd.read_csv(TRAINING_DATA_PATH)["location_id"].dropna().astype(str).unique()
    ]
    all_rows: list[dict] = []
    for station_group in query_groups:
        params = {
            "select": "station_id,date,pm25",
            "order": "station_id.asc,date.asc",
            "limit": "1000",
            "station_id": f"in.({','.join(station_group)})",
        }
        params_list = list(params.items())
        params_list.append(("date", f"gte.{start_date.isoformat()}"))
        params_list.append(("date", f"lte.{end_date.isoformat()}"))
        response = session.get(
            f"{base_url}/rest/v1/air_quality_daily",
            params=params_list,
            headers={
                "apikey": api_key,
                "Authorization": f"Bearer {api_key}",
            },
            timeout=45,
        )
        response.raise_for_status()
        page = response.json()
        all_rows.extend(page)
        if len(page) >= 1000:
            raise RuntimeError("STATION_QUERY_EXCEEDS_POSTGREST_ROW_CAP")

    return all_rows


def get_observed_weather(
    station: pd.Series,
    start_date: date = HOLDOUT_FROM - timedelta(days=1),
    end_date: date = HOLDOUT_TO - timedelta(days=1),
) -> pd.DataFrame:
    params = {
        "latitude": float(station.latitude),
        "longitude": float(station.longitude),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": "temperature_2m_mean,relative_humidity_2m_mean,wind_speed_10m_max,precipitation_sum,wind_direction_10m_dominant",
        "hourly": "boundary_layer_height",
        "timezone": "Asia/Bangkok",
    }
    response = requests.get("https://archive-api.open-meteo.com/v1/archive", params=params, timeout=45)
    response.raise_for_status()
    payload = response.json()
    daily = pd.DataFrame(payload["daily"]).rename(columns={
        "time": "weather_date",
        "temperature_2m_mean": "temperature",
        "relative_humidity_2m_mean": "humidity",
        "wind_speed_10m_max": "wind_speed",
        "precipitation_sum": "rainfall",
    })
    radians = np.deg2rad(daily["wind_direction_10m_dominant"])
    daily["wind_dir_sin"] = np.sin(radians)
    daily["wind_dir_cos"] = np.cos(radians)
    hourly = pd.DataFrame(payload["hourly"])
    hourly["weather_date"] = pd.to_datetime(hourly["time"]).dt.date.astype(str)
    boundary_layer = hourly.groupby("weather_date")["boundary_layer_height"].mean()
    daily["boundary_layer_height"] = daily["weather_date"].map(boundary_layer)
    daily["date"] = pd.to_datetime(daily["weather_date"]) + pd.Timedelta(days=1)
    daily["station_id"] = str(station.location_id)
    return daily[[
        "station_id", "date", "temperature", "humidity", "wind_speed", "rainfall",
        "wind_dir_sin", "wind_dir_cos", "boundary_layer_height",
    ]]


def make_features(
    panel: pd.DataFrame,
    metadata: dict,
    weather: pd.DataFrame,
    target_rows: pd.DataFrame | None = None,
) -> pd.DataFrame:
    station_codes = {
        entry["station_id"]: entry["station_code"]
        for entry in metadata["station_code_mapping"]
    }
    panel = panel.copy()
    panel["station_id"] = panel["station_id"].astype(str)
    panel["date"] = pd.to_datetime(panel["date"])
    panel = panel.dropna(subset=["pm25"]).sort_values(["station_id", "date"])
    feature_panel = panel
    if target_rows is not None and not target_rows.empty:
        targets = target_rows[["station_id", "date"]].copy()
        targets["station_id"] = targets["station_id"].astype(str)
        targets["date"] = pd.to_datetime(targets["date"])
        targets["pm25"] = np.nan
        feature_panel = pd.concat([panel, targets], ignore_index=True)
        feature_panel = feature_panel.drop_duplicates(["station_id", "date"], keep="last")

    frames = []
    for station_id, group in feature_panel.groupby("station_id", sort=False):
        group = group.sort_values("date").copy()
        gaps = group["date"].diff().dt.days
        for lag in range(1, 15):
            group[f"lag_{lag}"] = group["pm25"].shift(lag).where(gaps.rolling(lag).max() == 1)
        for window in (3, 7, 14):
            contiguous = gaps.rolling(window).max() == 1
            shifted = group["pm25"].shift(1)
            group[f"rolling_mean_{window}"] = shifted.rolling(window).mean().where(contiguous)
            group[f"rolling_std_{window}"] = shifted.rolling(window).std().where(contiguous)
            group[f"rolling_min_{window}"] = shifted.rolling(window).min().where(contiguous)
            group[f"rolling_max_{window}"] = shifted.rolling(window).max().where(contiguous)

        group["day_of_week"] = group["date"].dt.dayofweek
        group["month"] = group["date"].dt.month
        group["is_weekend"] = (group["day_of_week"] >= 5).astype(int)
        day_of_year = group["date"].dt.dayofyear
        group["doy_sin"] = np.sin(2 * np.pi * day_of_year / 365.25)
        group["doy_cos"] = np.cos(2 * np.pi * day_of_year / 365.25)
        group["is_burning_season"] = group["month"].isin([12, 1, 2, 3, 4]).astype(int)
        group["trend_lag1_lag7"] = group["lag_1"] - group["lag_7"]
        group["trend_lag1_lag14"] = group["lag_1"] - group["lag_14"]
        group["station_code"] = station_codes.get(station_id)
        frames.append(group)

    features = pd.concat(frames, ignore_index=True)
    wide = panel.pivot_table(index="date", columns="station_id", values="pm25")
    end_date = max(wide.index.max(), feature_panel["date"].max())
    wide = wide.reindex(pd.date_range(wide.index.min(), end_date, freq="D"))
    other_counts = wide.notna().sum(axis=1).to_numpy()[:, None] - 1
    with np.errstate(divide="ignore", invalid="ignore"):
        other_means = (wide.sum(axis=1).to_numpy()[:, None] - wide.to_numpy()) / other_counts
    other_means = pd.DataFrame(other_means, index=wide.index, columns=wide.columns).shift(1)
    features["neighbors_pm25_lag1"] = [
        other_means.at[row.date, row.station_id]
        if row.date in other_means.index and row.station_id in other_means.columns
        else np.nan
        for row in features[["date", "station_id"]].itertuples(index=False)
    ]
    features["station_code"] = pd.to_numeric(features["station_code"], errors="coerce")
    features = features.merge(weather, on=["station_id", "date"], how="left")
    return features


def load_frozen_model(metadata: dict):
    if sha256(MODEL_PATH) != metadata["model_sha256"]:
        raise RuntimeError("MODEL_ARTIFACT_HASH_MISMATCH")
    if sha256(TRAINING_DATA_PATH) != metadata["training_data_sha256"]:
        raise RuntimeError("TRAINING_DATA_HASH_MISMATCH")
    if sklearn.__version__ != metadata["serialized_scikit_learn_version"]:
        raise RuntimeError("SCIKIT_LEARN_VERSION_MISMATCH")
    bundle = joblib.load(MODEL_PATH)
    if bundle["notebook_version"] != metadata["model_version"]:
        raise RuntimeError("MODEL_VERSION_MISMATCH")
    if bundle["trained_until"] != metadata["trained_until"]:
        raise RuntimeError("TRAINED_UNTIL_MISMATCH")
    if bundle["features"] != metadata["features"]:
        raise RuntimeError("MODEL_FEATURE_SCHEMA_MISMATCH")
    if bundle["model_name"] != metadata["model_name"]:
        raise RuntimeError("MODEL_NAME_MISMATCH")
    return bundle


def main() -> None:
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    bundle = load_frozen_model(metadata)

    mapping = metadata["station_code_mapping"]
    station_ids = [entry["station_id"] for entry in mapping]
    training = pd.read_csv(TRAINING_DATA_PATH)
    training["station_id"] = training["location_id"].astype(str)
    training["date"] = pd.to_datetime(training["timestamp"])
    training = training.rename(columns={"pm25": "pm25"})
    station_stats = training.dropna(subset=["pm25"]).groupby("station_id").agg(
        rows=("pm25", "size"), latest_date=("date", "max")
    )
    expected_ids = sorted(
        station_stats[
            (station_stats["rows"] >= 600)
            & (station_stats["latest_date"] >= pd.Timestamp("2026-09-01"))
        ].index.astype(str)
    )
    mapped_ids = [entry["station_id"] for entry in mapping]
    if expected_ids != mapped_ids:
        raise RuntimeError("PINNED_TRAINING_STATION_MAPPING_MISMATCH")
    mapped_row_count = int(station_stats.loc[expected_ids, "rows"].sum())
    consecutive_lag1_rows = 0
    for station_id in expected_ids:
        dates = training.loc[training["station_id"] == station_id, "date"].sort_values()
        consecutive_lag1_rows += int((dates.diff().dt.days == 1).sum())
    if mapped_row_count != 21128 or consecutive_lag1_rows != 20868:
        raise RuntimeError("PINNED_TRAINING_COUNTS_MISMATCH")

    actual_rows = get_actual_rows()
    actual = pd.DataFrame(actual_rows)
    if actual.empty:
        raise RuntimeError("NO_POST_TRAINING_DATABASE_OBSERVATIONS")
    actual["station_id"] = actual["station_id"].astype(str)
    actual["date"] = pd.to_datetime(actual["date"])
    actual["pm25"] = pd.to_numeric(actual["pm25"], errors="coerce")
    target_observations = actual[
        actual["station_id"].isin(station_ids)
        & (actual["date"].dt.date >= HOLDOUT_FROM)
        & (actual["date"].dt.date <= HOLDOUT_TO)
    ]
    coverage_by_station = []
    for station_id in station_ids:
        rows = actual[actual["station_id"] == station_id].sort_values("date")
        present_dates = set(rows["date"].dt.strftime("%Y-%m-%d"))
        missing_dates = [
            (HOLDOUT_FROM + timedelta(days=offset)).isoformat()
            for offset in range((HOLDOUT_TO - HOLDOUT_FROM).days + 1)
            if (HOLDOUT_FROM + timedelta(days=offset)).isoformat() not in present_dates
        ]
        latest = rows.iloc[-1] if not rows.empty else None
        coverage_by_station.append({
            "station_id": station_id,
            "province": next(item["province"] for item in mapping if item["station_id"] == station_id),
            "latest_database_date": latest["date"].strftime("%Y-%m-%d") if latest is not None else None,
            "latest_pm25": round(float(latest["pm25"]), 4) if latest is not None and pd.notna(latest["pm25"]) else None,
            "missing_dates_2026_10_01_to_07": missing_dates,
            "has_lag_1_for_forecast_as_of_2026_10_08": bool(latest is not None and latest["date"].date() == HOLDOUT_TO),
        })

    # Use the current DB as ground truth from the requested history start onward;
    # retain only the pinned training export for earlier lag context.
    training = training[training["date"].dt.date < HISTORY_FROM]
    panel = pd.concat([training[["station_id", "date", "pm25"]], actual], ignore_index=True)
    panel = panel.drop_duplicates(["station_id", "date"], keep="last")

    db_meta = pd.read_csv(TRAINING_DATA_PATH).assign(station_id=lambda x: x.location_id.astype(str))
    locations = db_meta.drop_duplicates("station_id").set_index("station_id")
    weather_frames = []
    weather_dates: set[str] = set()
    for station_id in sorted(target_observations["station_id"].unique()):
        station = locations.loc[station_id]
        current_weather = get_observed_weather(station)
        weather_frames.append(current_weather)
        weather_dates.update((current_weather["date"] - pd.Timedelta(days=1)).dt.strftime("%Y-%m-%d"))
    weather = pd.concat(weather_frames, ignore_index=True)

    features = make_features(panel, metadata, weather)
    merged = target_observations.merge(
        features,
        on=["station_id", "date"],
        how="left",
        suffixes=("_actual", ""),
    )
    if "pm25_actual" not in merged:
        raise RuntimeError("HOLDOUT_TARGET_JOIN_FAILED")
    feature_names = metadata["features"]
    merged["feature_complete"] = np.isfinite(merged[feature_names].to_numpy(dtype=float)).all(axis=1)
    scored = merged[merged["feature_complete"]].copy()
    if scored.empty:
        raise RuntimeError("NO_COMPLETE_HOLDOUT_FEATURE_ROWS")

    x = scored[feature_names]
    prediction = np.asarray(bundle["model"].predict(x), dtype=float)
    actual_values = scored["pm25_actual"].to_numpy(dtype=float)
    baseline_values = scored["lag_1"].to_numpy(dtype=float)
    model_metrics = {
        "n": int(len(scored)),
        "mae": round(float(mean_absolute_error(actual_values, prediction)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(actual_values, prediction))), 4),
    }
    baseline_metrics = {
        "n": int(len(scored)),
        "mae": round(float(mean_absolute_error(actual_values, baseline_values)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(actual_values, baseline_values))), 4),
    }
    report = {
        "evaluation": "rolling one-day-ahead; actual target observations from Supabase only",
        "holdout_from": HOLDOUT_FROM.isoformat(),
        "holdout_to": HOLDOUT_TO.isoformat(),
        "trained_until": metadata["trained_until"],
        "model_version": metadata["model_version"],
        "model_name": metadata["model_name"],
        "model_sha256": metadata["model_sha256"],
        "training_data_sha256": metadata["training_data_sha256"],
        "runtime_versions": {"scikit_learn": sklearn.__version__},
        "training_mapping_validation": {
            "eligible_station_count": len(expected_ids),
            "observed_rows_after_station_filter": mapped_row_count,
            "rows_with_calendar_lag_1": consecutive_lag1_rows,
            "matches_training_result_artifact": True,
        },
        "database_coverage_as_of": HOLDOUT_TO.isoformat(),
        "coverage_by_station": coverage_by_station,
        "target_station_count": int(scored["station_id"].nunique()),
        "observed_target_rows": int(len(target_observations)),
        "scored_rows": int(len(scored)),
        "excluded_rows_missing_features": int(len(merged) - len(scored)),
        "weather_feature_dates": sorted(weather_dates),
        "model": model_metrics,
        "persistence_baseline": baseline_metrics,
        "model_minus_baseline": {
            "mae": round(model_metrics["mae"] - baseline_metrics["mae"], 4),
            "rmse": round(model_metrics["rmse"] - baseline_metrics["rmse"], 4),
            "better": model_metrics["mae"] < baseline_metrics["mae"] and model_metrics["rmse"] < baseline_metrics["rmse"],
        },
        "samples": [
            {
                "station_id": str(row.station_id),
                "date": row.date.strftime("%Y-%m-%d"),
                "actual_pm25": round(float(row.pm25_actual), 4),
                "persistence_pm25": round(float(row.lag_1), 4),
                "model_pm25": round(float(prediction[index]), 4),
            }
            for index, row in enumerate(scored.itertuples(index=False))
        ],
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in (
        "model_version", "target_station_count", "observed_target_rows", "scored_rows",
        "excluded_rows_missing_features", "model", "persistence_baseline", "model_minus_baseline",
    )}, ensure_ascii=False, indent=2))
    print(f"Saved report: {REPORT_PATH.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
