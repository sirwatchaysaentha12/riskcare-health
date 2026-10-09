-- ═══════════════════════════════════════════════════════════════════════════
-- pm25_forecast (ระดับจังหวัด) + pipeline_runs — รันซ้ำได้ (idempotent)
-- ผู้ใช้ตรวจแล้วรันเองใน Supabase SQL Editor (ใช้ service connection ปัจจุบัน)
-- ห้ามรันจากสคริปต์อัตโนมัติ — ตารางนี้ RLS on, เขียนผ่าน service_role เท่านั้น
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) ตารางพยากรณ์รายจังหวัด
create table if not exists public.pm25_forecast (
  id bigint generated always as identity primary key,
  province text not null,
  target_date date not null,
  issued_date date not null,
  horizon int not null check (horizon between 1 and 3),
  pm25 numeric not null check (pm25 >= 0 and pm25 <= 500),
  model_version text not null,
  generated_at timestamptz not null default now(),
  unique (province, target_date, issued_date, horizon, model_version)
);

comment on table public.pm25_forecast is
  'พยากรณ์ PM2.5 รายจังหวัด (+1/+2/+3 วัน) — เขียนโดย pipeline เท่านั้น; หน้าเว็บอ่านอย่างเดียว; ห้ามลบ issued_date เก่า (ใช้ทำ stale fallback)';

create index if not exists pm25_forecast_province_target_idx
  on public.pm25_forecast (province, target_date desc, issued_date desc);

-- 2) ตารางบันทึกการรัน pipeline รายวัน
create table if not exists public.pipeline_runs (
  id bigint generated always as identity primary key,
  run_date date not null,
  status text not null check (status in ('ok', 'partial', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz,
  stations_total int,
  stations_missing text[] default '{}',
  provinces_covered int,
  detail jsonb,
  unique (run_date, started_at)
);

comment on table public.pipeline_runs is
  'บันทึกผลรัน pipeline รายวัน — สถานะ ok/partial/failed + สถานีที่ขาด';

-- 3) RLS: ทุกคนอ่านได้ (anon/authenticated), เขียนเฉพาะ service_role
alter table public.pm25_forecast enable row level security;
alter table public.pipeline_runs enable row level security;

drop policy if exists "pm25_forecast_read_all" on public.pm25_forecast;
create policy "pm25_forecast_read_all"
  on public.pm25_forecast for select
  to anon, authenticated
  using (true);

drop policy if exists "pipeline_runs_read_all" on public.pipeline_runs;
create policy "pipeline_runs_read_all"
  on public.pipeline_runs for select
  to anon, authenticated
  using (true);

-- ไม่สร้าง policy insert/update/delete สำหรับ anon/authenticated
-- → เขียนได้เฉพาะ service_role (ซึ่ง bypass RLS) — ตรงตามกฎ secret/สิทธิ์
