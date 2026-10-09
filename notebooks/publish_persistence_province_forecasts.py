"""Publish a transparent province baseline; never trains or runs an ML model.

For every province represented by a real station value in the current database,
the province value is the mean of that province's latest station observations.
The same value is stored for +1/+2/+3 with model_version=persistence-baseline.
Publishing is opt-in via --publish.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
MODEL_VERSION = "persistence-baseline"
LOCAL_TZ = ZoneInfo("Asia/Bangkok")


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (ROOT / "admin-app/.env.local").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def fetch_daily_rows(base: str, headers: dict[str, str]) -> pd.DataFrame:
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish", action="store_true", help="write rows and pipeline_runs")
    args = parser.parse_args()
    env = load_env()
    base = (env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL") or "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise RuntimeError("SUPABASE_SERVER_CONFIGURATION_MISSING")
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    # Province attribution comes only from the existing training data's station
    # metadata. Unknown stations are excluded rather than assigned by guess.
    station_meta = pd.read_csv(ROOT / "data/vertex/pm25_daily_vertex.csv")
    station_meta["station_id"] = station_meta["location_id"].astype(str)
    station_meta["province"] = station_meta["province"].astype(str).str.strip()
    # The checked-in training CSV contains one known mojibake value for the
    # Bangkok label. Normalize that label only; unknown province text is not
    # guessed and remains excluded below.
    station_meta["province"] = station_meta["province"].replace({"��ا෾��ҹ��": "กรุงเทพมหานคร"})
    station_meta = station_meta[["station_id", "province"]].drop_duplicates()
    station_meta = station_meta[station_meta["province"].str.len() > 0]

    daily = fetch_daily_rows(base, headers)
    latest = daily.sort_values("date").groupby("station_id", as_index=False).tail(1)
    latest = latest.merge(station_meta, on="station_id", how="inner")
    if latest.empty:
        raise RuntimeError("NO_STATION_PROVINCE_MAPPING_WITH_CURRENT_DATA")

    run_date = datetime.now(LOCAL_TZ).date()
    issued = run_date.isoformat()
    province_values = latest.groupby("province", as_index=False).agg(
        pm25=("pm25", "mean"), source_station_count=("station_id", "nunique"),
        source_latest_date=("date", "max"),
    )
    generated_at = datetime.now().astimezone().isoformat()
    rows: list[dict] = []
    for item in province_values.itertuples(index=False):
        value = round(float(item.pm25), 2)
        for horizon in (1, 2, 3):
            rows.append({
                "province": item.province,
                "target_date": (run_date + timedelta(days=horizon)).isoformat(),
                "issued_date": issued,
                "horizon": horizon,
                "pm25": value,
                "model_version": MODEL_VERSION,
                "generated_at": generated_at,
            })

    if args.publish:
        response = requests.post(
            f"{base}/rest/v1/pm25_forecast?on_conflict=province,target_date,issued_date,horizon,model_version",
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=rows,
            timeout=60,
        )
        response.raise_for_status()
        run_row = {
            "run_date": issued, "status": "ok", "started_at": generated_at,
            "finished_at": datetime.now().astimezone().isoformat(),
            "stations_total": int(len(station_meta)), "stations_missing": [],
            "provinces_covered": int(len(province_values)),
            "detail": {"model_version": MODEL_VERSION, "rows_upserted": len(rows),
                       "source_latest_dates": {str(x.province): str(x.source_latest_date.date()) for x in province_values.itertuples(index=False)}},
        }
        run_response = requests.post(f"{base}/rest/v1/pipeline_runs", headers=headers, json=run_row, timeout=30)
        run_response.raise_for_status()

    print(json.dumps({
        "mode": "published" if args.publish else "dry-run",
        "model_version": MODEL_VERSION,
        "provinces_covered": int(len(province_values)),
        "provinces": [str(x) for x in province_values["province"].tolist()],
        "rows": len(rows),
        "source_latest_dates": {str(x.province): str(x.source_latest_date.date()) for x in province_values.itertuples(index=False)},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
