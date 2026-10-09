"""Evaluate the last 14 available forecast targets against local observations.

This compares each ML row with the province-local persistence value for the
same target. It never fills missing observations. Dry-run is the default;
``--publish`` writes accuracy rows and a baseline override after four
consecutive ML regressions.
"""
from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
BASELINE = "persistence-baseline"


def env() -> dict[str, str]:
    out = {}
    for path in (ROOT / ".env.local", ROOT / "admin-app/.env.local"):
        if not path.exists(): continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1); out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--publish", action="store_true"); args = parser.parse_args()
    cfg = env(); base = (cfg.get("NEXT_PUBLIC_SUPABASE_URL") or cfg.get("SUPABASE_URL") or "").rstrip("/"); key = cfg.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key: raise RuntimeError("SUPABASE_SERVER_CONFIGURATION_MISSING")
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    def get(table: str, select: str, params: dict) -> list[dict]:
        response = requests.get(f"{base}/rest/v1/{table}", headers=headers, params={"select": select, **params}, timeout=60); response.raise_for_status(); return response.json()
    mapping = get("province_stations", "province,openaq_sensor_id,active", {"active": "eq.true", "limit": 5000})
    forecasts = get("pm25_forecast", "province,target_date,horizon,pm25,model_version,issued_date", {"target_date": "gte." + (date.today() - timedelta(days=14)).isoformat(), "model_version": "eq.ml-local-v3.0", "limit": 5000})
    observations = get("air_quality_daily", "station_id,date,pm25", {"date": "gte." + (date.today() - timedelta(days=16)).isoformat(), "limit": 20000})
    station_province = {str(row["openaq_sensor_id"]): row["province"] for row in mapping if row.get("openaq_sensor_id")}
    frame = pd.DataFrame(observations)
    if frame.empty: print(json.dumps({"mode": "dry-run", "status": "no_observations", "rows": 0})); return
    frame["province"] = frame["station_id"].astype(str).map(station_province); frame["date"] = pd.to_datetime(frame["date"]).dt.date; frame["pm25"] = pd.to_numeric(frame["pm25"], errors="coerce"); frame = frame.dropna(subset=["province", "pm25"])
    actual = frame.groupby(["province", "date"], as_index=False).pm25.mean(); actual_map = {(r.province, r.date): float(r.pm25) for r in actual.itertuples()}
    rows, streaks = [], {}
    for row in forecasts:
        target = date.fromisoformat(row["target_date"]); actual_value = actual_map.get((row["province"], target)); previous = actual_map.get((row["province"], target - timedelta(days=1)))
        if actual_value is None or previous is None: continue
        model_value = float(row["pm25"]); baseline_value = float(previous)
        for version, predicted in (("ml-local-v3.0", model_value), (BASELINE, baseline_value)):
            error = abs(predicted - actual_value); rows.append({"province": row["province"], "target_date": row["target_date"], "horizon": row["horizon"], "model_version": version, "predicted_pm25": predicted, "observed_pm25": actual_value, "absolute_error": error, "squared_error": error * error})
        key = (row["province"], int(row["horizon"])); streaks.setdefault(key, []).append((target, abs(model_value - actual_value) > abs(baseline_value - actual_value)))
    overrides = []
    for (province, horizon), values in streaks.items():
        bad = 0
        for _, is_bad in sorted(values, reverse=True):
            if is_bad: bad += 1
            else: break
        if bad > 3: overrides.append({"province": province, "preferred_model_version": BASELINE, "reason": f"ML worse than persistence for {bad} consecutive evaluated targets (horizon {horizon})", "consecutive_bad_days": bad})
    if args.publish:
        def post(table: str, payload: list[dict], conflict: str):
            if payload: requests.post(f"{base}/rest/v1/{table}?on_conflict={conflict}", headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"}, json=payload, timeout=60).raise_for_status()
        post("pm25_forecast_accuracy_14d", rows, "province,target_date,horizon,model_version")
        post("pm25_model_overrides", overrides, "province")
    print(json.dumps({"mode": "published" if args.publish else "dry-run", "evaluated_rows": len(rows), "override_count": len(overrides), "overrides": overrides}, ensure_ascii=False, indent=2))


if __name__ == "__main__": main()
