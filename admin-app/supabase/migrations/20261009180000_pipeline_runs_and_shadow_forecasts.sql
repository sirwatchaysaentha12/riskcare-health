-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: pipeline_runs (ขยาย) + shadow_forecasts (ใหม่)
-- รันซ้ำได้ (idempotent) — รันเองใน Supabase SQL Editor
-- ห้ามรันจากสคริปต์อัตโนมัติ — ใช้ service connection เท่านั้น
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1) pipeline_runs — ตรวจว่ามีแล้วหรือยัง (สร้างใหม่ถ้ายังไม่มี)
--    NOTE: ถ้ามี migration 20261007 รันแล้ว ตารางนี้มีอยู่แล้ว
--    ไฟล์นี้ใช้ "create table if not exists" + "add column if not exists" จึงปลอดภัย
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.pipeline_runs (
  id bigint generated always as identity primary key,
  run_date date not null,
  status text not null check (status in ('ok', 'partial', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz,
  stations_total int,
  stations_missing text[] default '{}',
  provinces_covered int,
  phase text,
  detail jsonb,
  unique (run_date, started_at)
);

-- คอลัมน์ใหม่ (เพิ่มเติมจาก migration เก่า)
alter table public.pipeline_runs
  add column if not exists provider_used text,
  add column if not exists pipeline_status text check (pipeline_status in ('ok', 'degraded', 'failed')),
  add column if not exists missing_stations text[] default '{}',
  add column if not exists guard_summary jsonb;

create index if not exists pipeline_runs_run_date_idx
  on public.pipeline_runs (run_date desc, started_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- 2) shadow_forecasts — เก็บพยากรณ์ทุกวัน + ค่าจริง + MAE
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.shadow_forecasts (
  id bigint generated always as identity primary key,
  issued_date date not null,
  target_date date not null,
  horizon int not null check (horizon between 1 and 3),
  province text not null,
  pm25_predicted numeric not null check (pm25_predicted >= 0 and pm25_predicted <= 500),
  model_version text not null,
  pm25_actual numeric check (pm25_actual >= 0 and pm25_actual <= 500),
  mae_vs_baseline numeric,
  beats_baseline_streak int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (issued_date, target_date, horizon, province, model_version)
);

comment on table public.shadow_forecasts is
  'โหมดเงา: เก็บพยากรณ์รายวัน + ค่าจริง + MAE เทียบ persistence baseline';

create index if not exists shadow_forecasts_province_target_idx
  on public.shadow_forecasts (province, target_date desc, horizon);

create index if not exists shadow_forecasts_model_version_idx
  on public.shadow_forecasts (model_version, province, horizon, target_date desc);

-- ─────────────────────────────────────────────────────────────────────
-- 3) RLS
-- ─────────────────────────────────────────────────────────────────────
alter table public.pipeline_runs enable row level security;
alter table public.shadow_forecasts enable row level security;

-- pipeline_runs: อ่านได้ทุกคน (anon/authenticated), เขียนเฉพาะ service_role
drop policy if exists "pipeline_runs_read_all" on public.pipeline_runs;
create policy "pipeline_runs_read_all"
  on public.pipeline_runs for select
  to anon, authenticated
  using (true);

-- shadow_forecasts: อ่านได้ทุกคน, เขียนเฉพาะ service_role
drop policy if exists "shadow_forecasts_read_all" on public.shadow_forecasts;
create policy "shadow_forecasts_read_all"
  on public.shadow_forecasts for select
  to anon, authenticated
  using (true);

-- เขียนได้เฉพาะ service_role (bypass RLS โดยอัตโนมัติ)
-- ไม่สร้าง insert/update policy สำหรับ anon/authenticated

commit;
