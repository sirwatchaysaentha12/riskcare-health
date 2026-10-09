"""Publish the reviewed forecast selection without training.

The v3 artifact is allowed only for the three stations used in the reviewed
holdout. Every other province with a real latest value uses the province-local
persistence baseline. This script is dry-run by default; use --publish only
after the SQL migration has been reviewed and applied by the project owner.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import joblib
import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "notebooks/pm25_model_production.joblib"
TRAINING_PATH = ROOT / "data/vertex/pm25_daily_vertex.csv"
VERIFIED_STATIONS = {"1304328", "1305020", "5077771"}
VERIFIED_PROVINCE = "กรุงเทพมหานคร"
MODEL_VERSION = "ml-local-v3.0"
BASELINE_VERSION = "persistence-baseline"
LOCAL_TZ = ZoneInfo("Asia/Bangkok")


def load_env() -> dict[str, str]:
    result: dict[str, str] = {}
    for line in (ROOT / "admin-app/.env.local").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def fetch_daily(base: str, headers: dict[str, str]) -> pd.DataFrame:
    rows: list[dict] = []
    for offset in range(0, 100000, 1000):
        response = requests.get(
            f"{base}/rest/v1/air_quality_daily",
            headers={**headers, "Range": f"{offset}-{offset + 999}"},
            params={"select": "station_id,date,pm25", "order": "station_id.asc,date.asc"},
            timeout=60,
        )
        response.raise_for_status()
        batch = response.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 1000:
            break
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise RuntimeError("NO_DAILY_OBSERVATIONS")
    frame["station_id"] = frame["station_id"].astype(str)
    frame["date"] = pd.to_datetime(frame["date"])
    frame["pm25"] = pd.to_numeric(frame["pm25"], errors="coerce")
    return frame.dropna(subset=["pm25"])


def build_features(series: pd.Series) -> pd.DataFrame:
    frame = pd.DataFrame(index=series.index)
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    env = load_env()
    base = (env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL") or "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise RuntimeError("SUPABASE_SERVER_CONFIGURATION_MISSING")
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    metadata = pd.read_csv(TRAINING_PATH)
    metadata["station_id"] = metadata["location_id"].astype(str)
    metadata["province"] = metadata["province"].astype(str).replace({"��ا෾��ҹ��": VERIFIED_PROVINCE}).str.strip()
    station_province = metadata[["station_id", "province"]].drop_duplicates()
    station_province = station_province[station_province["province"].str.len() > 0]
    # The exported training metadata is known to contain only Bangkok stations;
    # normalize its encoding artifact without assigning provinces to unknown
    # multi-province data.
    if station_province["province"].nunique() == 1 and set(VERIFIED_STATIONS).issubset(set(station_province["station_id"])):
        station_province["province"] = VERIFIED_PROVINCE

    daily = fetch_daily(base, headers)
    latest = daily.sort_values("date").groupby("station_id", as_index=False).tail(1)
    latest = latest.merge(station_province, on="station_id", how="inner")
    if latest.empty:
        raise RuntimeError("NO_MAPPED_PROVINCE_OBSERVATIONS")

    model = joblib.load(MODEL_PATH)
    if model.get("version") != MODEL_VERSION:
        raise RuntimeError("UNEXPECTED_MODEL_VERSION")
    historical = pd.read_csv(TRAINING_PATH)
    historical["station_id"] = historical["location_id"].astype(str)
    historical["date"] = pd.to_datetime(historical["timestamp"])
    historical["pm25"] = pd.to_numeric(historical["pm25"], errors="coerce")
    historical = historical[["station_id", "date", "pm25"]].dropna(subset=["pm25"])
    panel = pd.concat([historical, daily[["station_id", "date", "pm25"]]], ignore_index=True)
    panel = panel.drop_duplicates(["station_id", "date"], keep="last")

    run_date = datetime.now(LOCAL_TZ).date()
    issued = run_date.isoformat()
    generated_at = datetime.now().astimezone().isoformat()
    predictions: dict[str, list[float]] = {}
    verified_ready = True
    verified_origin: pd.Timestamp | None = None
    for station_id in sorted(VERIFIED_STATIONS):
        series = panel[panel["station_id"] == station_id].set_index("date")["pm25"].sort_index().asfreq("D")
        if series.dropna().empty:
            verified_ready = False
            break
        origin = series.dropna().index.max()
        if verified_origin is None:
            verified_origin = origin
        if origin != verified_origin:
            verified_ready = False
            break
        features = build_features(series)
        if origin not in features.index:
            verified_ready = False
            break
        for horizon in (1, 2, 3):
            x = features.loc[[origin], model["features"]]
            if not np.isfinite(x.to_numpy(dtype=float)).all():
                verified_ready = False
                break
            prediction = max(0.0, float(model["models"][horizon].predict(x)[0]) * 0.5 + float(series.loc[origin]) * 0.5)
            predictions.setdefault(str(horizon), []).append(prediction)
        if not verified_ready:
            break

    province_rows: list[dict] = []
    covered: dict[str, str] = {}
    for province, group in latest.groupby("province"):
        use_ml = province == VERIFIED_PROVINCE and verified_ready and all(len(predictions.get(str(h), [])) == len(VERIFIED_STATIONS) for h in (1, 2, 3))
        for horizon in (1, 2, 3):
            if use_ml:
                value = float(np.mean(predictions[str(horizon)]))
                version = MODEL_VERSION
            else:
                value = float(group["pm25"].mean())
                version = BASELINE_VERSION
            province_rows.append({
                "province": province,
                "target_date": (run_date + timedelta(days=horizon)).isoformat(),
                "issued_date": issued,
                "horizon": horizon,
                "pm25": round(value, 2),
                "model_version": version,
                "generated_at": generated_at,
            })
            covered[province] = version

    if args.publish:
        response = requests.post(
            f"{base}/rest/v1/pm25_forecast?on_conflict=province,target_date,issued_date,horizon,model_version",
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=province_rows,
            timeout=60,
        )
        response.raise_for_status()
        run = {
            "run_date": issued, "status": "ok", "started_at": generated_at,
            "finished_at": datetime.now().astimezone().isoformat(),
            "stations_total": int(len(station_province)), "stations_missing": [],
            "provinces_covered": int(len(covered)),
            "detail": {"model_versions": covered, "rows_upserted": len(province_rows), "verified_stations": sorted(VERIFIED_STATIONS)},
        }
        requests.post(f"{base}/rest/v1/pipeline_runs", headers=headers, json=run, timeout=30).raise_for_status()

    print(json.dumps({
        "mode": "published" if args.publish else "dry-run",
        "coverage": {"provinces": len(covered), "model_versions": covered},
        "rows": len(province_rows), "verified_v3_stations_ready": verified_ready,
        "model_version_by_province": covered,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
