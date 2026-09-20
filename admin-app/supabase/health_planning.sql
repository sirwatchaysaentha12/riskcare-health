-- Health Planning & Management System
-- Run after the existing schema.sql in Supabase SQL Editor.

create table if not exists public.health_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_name text,
  contact_value text,
  age integer,
  sex text not null default 'unspecified',
  weight_kg numeric(6,2),
  height_cm numeric(6,2),
  days_per_week integer not null default 3 check (days_per_week between 1 and 7),
  scheduled_at timestamptz,
  exercise_type text,
  duration_minutes integer,
  goal text,
  intensity text not null default 'เบา',
  chronic_condition text not null default 'ไม่มีโรคประจำตัว',
  risk_group text,
  province text,
  aqi numeric(8,2),
  plan_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.health_medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose text,
  schedule_time time not null,
  condition_name text not null default 'ไม่มีโรคประจำตัว',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.health_appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_at timestamptz not null,
  provider text,
  department text,
  location text,
  reminder_at timestamptz,
  preparation text,
  bring_items text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.health_appointments add column if not exists preparation text;
alter table public.health_appointments add column if not exists contact_name text;
alter table public.health_appointments add column if not exists contact_value text;
alter table public.health_appointments add column if not exists reminder_sent_at timestamptz;
alter table public.health_appointments add column if not exists notified_at timestamptz;
alter table public.health_appointments add column if not exists in_app_notified_at timestamptz;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.health_appointments add column if not exists bring_items text;
alter table public.health_appointments add column if not exists department text;
alter table public.health_appointments add column if not exists location text;
alter table public.health_appointments add column if not exists reminder_at timestamptz;
alter table public.health_plans add column if not exists scheduled_at timestamptz;
alter table public.health_plans add column if not exists exercise_type text;
alter table public.health_plans add column if not exists duration_minutes integer;
alter table public.health_plans add column if not exists goal text;

create index if not exists health_appointments_reminder_idx
  on public.health_appointments (user_id, reminder_at);

create table if not exists public.health_symptom_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symptoms text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.health_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chronic_condition text not null default 'ไม่มีโรคประจำตัว',
  medication text not null default 'ไม่ได้ใช้ยาประจำ',
  updated_at timestamptz not null default now()
);

alter table public.health_plans enable row level security;
alter table public.health_medications enable row level security;
alter table public.health_appointments enable row level security;
alter table public.health_symptom_logs enable row level security;
alter table public.health_profiles enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "Users manage own health plans" on public.health_plans;
create policy "Users manage own health plans" on public.health_plans for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own medications" on public.health_medications;
create policy "Users manage own medications" on public.health_medications for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own appointments" on public.health_appointments;
create policy "Users manage own appointments" on public.health_appointments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own symptom logs" on public.health_symptom_logs;
create policy "Users manage own symptom logs" on public.health_symptom_logs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own health profile" on public.health_profiles;
create policy "Users manage own health profile" on public.health_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
