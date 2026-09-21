-- Schema draft only. Do not run until the personalized-risk data retention decision is approved.
-- TODO: verify + cite privacy/consent and retention requirements before migration.
create table if not exists public.personalized_risk_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pm25_value numeric not null,
  pm25_unit text not null default 'µg/m³',
  averaging_period text not null,
  threshold_set_id text not null,
  audience text not null check (audience in ('general', 'sensitive', 'unknown')),
  level_code text,
  evaluated_at timestamptz not null default now(),
  source_timestamp timestamptz,
  source_station text,
  created_at timestamptz not null default now()
);
