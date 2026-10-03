-- Phase 6: forecast-result store for Vertex AI batch predictions.
-- Populated by admin-app/scripts/vertex-import-batch-predictions.mjs (run manually
-- after each Vertex AI batch prediction job) — the dashboard API only READS this table.
-- If this table does not exist yet, the API falls back to the named baseline forecast.

create table if not exists public.pm25_forecast_daily (
  station_id text not null,
  date date not null,
  pm25 double precision not null check (pm25 >= 0 and pm25 <= 500),
  pm25_min double precision,
  pm25_max double precision,
  horizon integer not null default 0,
  model_version text not null,
  updated_at timestamptz not null default now(),
  constraint pm25_forecast_daily_station_date_key unique (station_id, date)
);

create index if not exists pm25_forecast_daily_station_date_idx
  on public.pm25_forecast_daily (station_id, date asc);

grant select, insert, update, delete on public.pm25_forecast_daily to service_role;

-- RLS: only service_role (backend) reads/writes; anon/authenticated get nothing
-- (frontend receives forecasts through the dashboard API, never directly).
alter table public.pm25_forecast_daily enable row level security;
