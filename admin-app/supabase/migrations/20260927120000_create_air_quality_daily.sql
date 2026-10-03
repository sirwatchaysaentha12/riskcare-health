create table if not exists public.air_quality_daily (
  id bigserial primary key,
  station_id text not null,
  station_name text,
  latitude double precision,
  longitude double precision,
  date date not null,
  pm25 double precision,
  pm10 double precision,
  temperature double precision,
  humidity double precision,
  pressure double precision,
  wind_speed double precision,
  wind_direction double precision,
  rainfall double precision,
  created_at timestamp without time zone default now(),
  updated_at timestamp without time zone default now(),
  constraint air_quality_daily_station_date_key unique (station_id, date)
);

create index if not exists air_quality_daily_station_date_desc_idx
  on public.air_quality_daily (station_id, date desc);

create index if not exists air_quality_daily_date_desc_idx
  on public.air_quality_daily (date desc);

alter table public.air_quality_daily enable row level security;

-- service_role bypasses RLS; grant it access without exposing rows to anon/authenticated.
grant select, insert, update, delete on public.air_quality_daily to service_role;
grant usage, select on sequence public.air_quality_daily_id_seq to service_role;

create or replace function public.set_air_quality_daily_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists air_quality_daily_updated_at on public.air_quality_daily;
create trigger air_quality_daily_updated_at
before update on public.air_quality_daily
for each row execute function public.set_air_quality_daily_updated_at();
