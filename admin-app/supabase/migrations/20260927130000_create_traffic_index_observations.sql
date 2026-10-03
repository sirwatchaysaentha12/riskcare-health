create table if not exists public.traffic_index_observations (
  id bigserial primary key,
  zone_id text not null,
  observed_at timestamptz not null,
  traffic_index double precision not null check (traffic_index between 0 and 100),
  mean_speed_mps double precision,
  sample_count integer not null default 0 check (sample_count >= 0),
  latitude double precision,
  longitude double precision,
  source text not null default 'Longdo Traffic Speed API',
  index_method text not null default 'derived_speed_congestion_proxy',
  created_at timestamptz not null default now(),
  constraint traffic_index_observations_zone_time_key unique (zone_id, observed_at)
);

create index if not exists traffic_index_observations_zone_time_idx
  on public.traffic_index_observations (zone_id, observed_at desc);

alter table public.traffic_index_observations enable row level security;
grant select, insert, update, delete on public.traffic_index_observations to service_role;
grant usage, select on sequence public.traffic_index_observations_id_seq to service_role;
