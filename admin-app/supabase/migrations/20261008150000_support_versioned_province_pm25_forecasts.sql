begin;

-- Keep older forecast versions intact while allowing the frozen v2.7 batch job
-- to publish a separate forecast for the same station/date.
alter table public.pm25_forecast_daily
  add column if not exists province text;

alter table public.pm25_forecast_daily
  drop constraint if exists pm25_forecast_daily_station_date_key;

create unique index if not exists pm25_forecast_daily_station_date_model_key
  on public.pm25_forecast_daily (station_id, date, model_version);

create index if not exists pm25_forecast_daily_province_date_model_idx
  on public.pm25_forecast_daily (province, date, model_version);

-- Forecast rows are backend-only. The browser continues to read the dashboard API.
alter table public.pm25_forecast_daily enable row level security;
revoke all on public.pm25_forecast_daily from anon, authenticated;
grant select, insert, update, delete on public.pm25_forecast_daily to service_role;

drop policy if exists pm25_forecast_daily_service_role_all on public.pm25_forecast_daily;
create policy pm25_forecast_daily_service_role_all
  on public.pm25_forecast_daily
  for all
  to service_role
  using (true)
  with check (true);

commit;
