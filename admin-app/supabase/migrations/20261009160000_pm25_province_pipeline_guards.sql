begin;

-- Persistent Air4Thai -> OpenAQ mapping.  Rows are created only from live
-- station metadata and a coordinate match within the pipeline's 3 km limit.
create table if not exists public.province_stations (
  province text not null,
  air4thai_station_code text not null,
  air4thai_area text,
  latitude double precision not null,
  longitude double precision not null,
  openaq_location_id bigint,
  openaq_sensor_id bigint,
  distance_km double precision,
  matched_at timestamptz not null default now(),
  active boolean not null default true,
  primary key (province, air4thai_station_code),
  check (latitude between -90 and 90),
  check (longitude between -180 and 180),
  check (distance_km is null or distance_km <= 3)
);

create index if not exists province_stations_province_active_idx
  on public.province_stations (province, active);
create index if not exists province_stations_sensor_idx
  on public.province_stations (openaq_sensor_id, active);

-- Rejected observations are retained for audit and never enter inference.
create table if not exists public.pm25_quality_rejections (
  id bigint generated always as identity primary key,
  station_id text not null,
  observed_date date not null,
  pm25 numeric,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (station_id, observed_date, reason)
);

-- Daily accuracy guard results.  No row means that the target was not
-- observable yet; it must not be interpreted as a good score.
create table if not exists public.pm25_forecast_accuracy_14d (
  id bigint generated always as identity primary key,
  province text not null,
  target_date date not null,
  horizon integer not null check (horizon between 1 and 3),
  model_version text not null,
  predicted_pm25 numeric not null,
  observed_pm25 numeric not null,
  absolute_error numeric not null,
  squared_error numeric not null,
  evaluated_at timestamptz not null default now(),
  unique (province, target_date, horizon, model_version)
);

create table if not exists public.pm25_model_overrides (
  province text primary key,
  preferred_model_version text not null,
  reason text not null,
  consecutive_bad_days integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.pm25_forecast
  add column if not exists status text not null default 'ok',
  add column if not exists source_issued_date date,
  add column if not exists is_fallback boolean not null default false;

alter table public.pipeline_runs
  add column if not exists phase text,
  add column if not exists missing_stations text[] default '{}',
  add column if not exists guard_summary jsonb;

alter table public.province_stations enable row level security;
alter table public.pm25_quality_rejections enable row level security;
alter table public.pm25_forecast_accuracy_14d enable row level security;
alter table public.pm25_model_overrides enable row level security;

revoke all on public.province_stations from anon, authenticated;
revoke all on public.pm25_quality_rejections from anon, authenticated;
revoke all on public.pm25_forecast_accuracy_14d from anon, authenticated;
revoke all on public.pm25_model_overrides from anon, authenticated;
grant select, insert, update, delete on public.province_stations to service_role;
grant select, insert, update, delete on public.pm25_quality_rejections to service_role;
grant select, insert, update, delete on public.pm25_forecast_accuracy_14d to service_role;
grant select, insert, update, delete on public.pm25_model_overrides to service_role;

drop policy if exists province_stations_service_role_all on public.province_stations;
create policy province_stations_service_role_all on public.province_stations
  for all to service_role using (true) with check (true);
drop policy if exists pm25_quality_rejections_service_role_all on public.pm25_quality_rejections;
create policy pm25_quality_rejections_service_role_all on public.pm25_quality_rejections
  for all to service_role using (true) with check (true);
drop policy if exists pm25_forecast_accuracy_service_role_all on public.pm25_forecast_accuracy_14d;
create policy pm25_forecast_accuracy_service_role_all on public.pm25_forecast_accuracy_14d
  for all to service_role using (true) with check (true);
drop policy if exists pm25_model_overrides_service_role_all on public.pm25_model_overrides;
create policy pm25_model_overrides_service_role_all on public.pm25_model_overrides
  for all to service_role using (true) with check (true);

commit;
