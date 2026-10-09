"""Evaluate the existing ml-local-v3.0 artifact without training.

The evaluation is deliberately locked to the three stations scored by the
frozen v2.7 holdout report and to targets after 2026-09-30.  Missing target
observations are excluded and reported as unavailable; no interpolation is
performed.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import requests
from sklearn.metrics import mean_absolute_error, mean_squared_error

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "admin-app/.env.local"
REPORT_PATH = ROOT / "data/vertex/v3_holdout_20261001_07.json"
V27_REPORT = ROOT / "data/vertex/v27_holdout_20261001_07.json"
TRAINING_PATH = ROOT / "data/vertex/pm25_daily_vertex.csv"
MODEL_PATH = ROOT / "notebooks/pm25_model_production.joblib"
HOLDOUT_FROM = pd.Timestamp("2026-10-01")
HOLDOUT_TO = pd.Timestamp("2026-10-07")
HISTORY_FROM = pd.Timestamp("2026-09-15")


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def fetch_actual(station_ids: list[str]) -> pd.DataFrame:
    env = load_env()
    base = env.get("NEXT_PUBLIC_SUPABASE_URL", env.get("SUPABASE_URL", "")).rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise RuntimeError("SUPABASE_SERVER_CONFIGURATION_MISSING")
    rows: list[dict] = []
    response = requests.get(
        f"{base}/rest/v1/air_quality_daily",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        params=[
            ("select", "station_id,date,pm25"),
            ("station_id", f"in.({','.join(station_ids)})"),
            ("date", f"gte.{HISTORY_FROM.date().isoformat()}"),
            ("date", f"lte.{HOLDOUT_TO.date().isoformat()}"),
            ("order", "station_id.asc,date.asc"),
            ("limit", "1000"),
        ],
        timeout=45,
    )
    response.raise_for_status()
    rows.extend(response.json())
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise RuntimeError("NO_HOLDOUT_OBSERVATIONS")
    frame["station_id"] = frame["station_id"].astype(str)
    frame["date"] = pd.to_datetime(frame["date"])
    frame["pm25"] = pd.to_numeric(frame["pm25"], errors="coerce")
    return frame.dropna(subset=["pm25"])


def build_features(series: pd.Series) -> pd.DataFrame:
    frame = pd.DataFrame(index=series.index)
    # This matches notebooks/train_production.py exactly: lag_1 is the value
    # at the origin date, not origin minus one day.
    for lag in [1, 2, 3, 4, 5, 6, 7, 14]:
        frame[f"lag_{lag}"] = series.shift(lag - 1)
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


def metrics(actual: list[float], predicted: list[float]) -> dict:
    if not actual:
        return {"status": "วัดไม่ได้", "n": 0, "mae": None, "rmse": None}
    return {
        "status": "วัดได้",
        "n": len(actual),
        "mae": round(float(mean_absolute_error(actual, predicted)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(actual, predicted))), 4),
    }


def main() -> None:
    v27 = json.loads(V27_REPORT.read_text(encoding="utf-8"))
    station_ids = sorted({str(item["station_id"]) for item in v27["samples"]})
    actual = fetch_actual(station_ids)
    training = pd.read_csv(TRAINING_PATH)
    training["station_id"] = training["location_id"].astype(str)
    training["date"] = pd.to_datetime(training["timestamp"])
    training["pm25"] = pd.to_numeric(training["pm25"], errors="coerce")
    training = training[["station_id", "date", "pm25"]].dropna(subset=["pm25"])
    training = training[training["date"] < HISTORY_FROM]
    panel = pd.concat([training, actual], ignore_index=True)
    panel = panel.drop_duplicates(["station_id", "date"], keep="last")

    bundle = joblib.load(MODEL_PATH)
    if bundle.get("version") != "ml-local-v3.0":
        raise RuntimeError("UNEXPECTED_MODEL_VERSION")
    predictions: dict[int, tuple[list[float], list[float], list[float]]] = {}
    for horizon in [1, 2, 3]:
        model_actual: list[float] = []
        model_pred: list[float] = []
        baseline_pred: list[float] = []
        for station_id in station_ids:
            series = panel[panel["station_id"] == station_id].set_index("date")["pm25"].sort_index().asfreq("D")
            features = build_features(series)
            for target_date in pd.date_range(HOLDOUT_FROM, HOLDOUT_TO):
                origin = target_date - pd.Timedelta(days=horizon)
                if target_date not in series.index or origin not in features.index:
                    continue
                actual_value = series.loc[target_date]
                x = features.loc[[origin], bundle["features"]]
                if not np.isfinite(x.to_numpy(dtype=float)).all():
                    continue
                ml_value = float(bundle["models"][horizon].predict(x)[0])
                lag_value = float(features.loc[origin, "lag_1"])
                if not np.isfinite(actual_value) or not np.isfinite(lag_value):
                    continue
                pred = max(0.0, 0.5 * ml_value + 0.5 * lag_value)
                model_actual.append(float(actual_value))
                model_pred.append(pred)
                baseline_pred.append(lag_value)
        predictions[horizon] = (model_actual, model_pred, baseline_pred)

    result = {
        "evaluation": "ml-local-v3.0 blend50 vs persistence on the v2.7 post-trained holdout",
        "holdout_from": HOLDOUT_FROM.date().isoformat(),
        "holdout_to": HOLDOUT_TO.date().isoformat(),
        "trained_until": "2026-09-30",
        "model_version": "ml-local-v3.0",
        "stations": station_ids,
        "results": {},
    }
    for horizon, (y, pred, base) in predictions.items():
        model_result = metrics(y, pred)
        base_result = metrics(y, base)
        result["results"][f"h{horizon}"] = {
            "model": model_result,
            "persistence_baseline": base_result,
            "better": bool(model_result["status"] == "วัดได้" and base_result["status"] == "วัดได้"
                             and model_result["mae"] < base_result["mae"]
                             and model_result["rmse"] < base_result["rmse"]),
        }
    REPORT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"Saved report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
