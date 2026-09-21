-- RiskCARE personalized PM2.5 SQL runbook
-- Generated from the SQL files currently present in the repository.
-- IMPORTANT: repository inspection cannot prove whether a Supabase SQL Editor
-- statement was executed. Run the verification queries in Section 6 first.

-- ============================================================
-- 1) BASE AUTH/ASSESSMENT SCHEMA
-- Source: admin-app/supabase/schema.sql
-- Status: ไม่แน่ใจ ต้องให้ผู้ใช้ยืนยัน; schema.sql contains profiles,
-- risk_assessments, RLS policies, triggers and helper functions.
-- Run the complete source file before dependent sections if the base schema
-- is not already present. Do not paste this section as a replacement for the
-- complete source file.
-- ============================================================

-- ============================================================
-- 2) HEALTH PROFILE / HEALTH PLANNING SCHEMA
-- Source: admin-app/supabase/health_planning.sql
-- Status: ไม่แน่ใจ ต้องให้ผู้ใช้ยืนยัน; this source creates health_profiles,
-- health_plans, appointments, medications, symptom logs and push subscriptions,
-- plus RLS policies. personalizedPm25 reads health_profiles.
-- Run the complete source file after schema.sql if health_profiles is absent.
-- ============================================================

-- ============================================================
-- 3) PERSONALIZED RISK RESULT SCHEMA DRAFT
-- Source: admin-app/supabase/personalized_risk_schema.sql
-- Status: ยืนยันแล้วว่ายังไม่ได้รัน; source file explicitly says schema draft
-- only. Run only after privacy/retention approval.
-- ============================================================

-- TODO: verify privacy/consent and retention requirements before migration.
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

-- ============================================================
-- 4) VERIFICATION QUERY FOR PERSONALIZED PM2.5 INPUTS
-- Status: ไม่แน่ใจ; safe read-only query. Requires authenticated/service role
-- access when run outside a user's session.
-- ============================================================

select
  p.id as user_id,
  p.email,
  p.username,
  p.health_risk_group,
  p.has_completed_assessment,
  hp.chronic_condition,
  hp.medication,
  ra.answers,
  ra.created_at as assessment_created_at
from public.profiles p
left join public.health_profiles hp on hp.user_id = p.id
left join lateral (
  select answers, created_at
  from public.risk_assessments
  where user_id = p.id
  order by created_at desc
  limit 1
) ra on true
order by p.created_at desc;

-- Verify the tables/columns used by the card.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'profiles' and column_name in ('id', 'health_risk_group', 'has_completed_assessment'))
    or (table_name = 'health_profiles' and column_name in ('user_id', 'chronic_condition', 'medication'))
    or (table_name = 'risk_assessments' and column_name in ('user_id', 'answers', 'created_at')))
order by table_name, ordinal_position;

-- ============================================================
-- 5) APPOINTMENT CRON / UNRELATED HEALTH SQL INVENTORY
-- These are not required by personalized PM2.5 risk.
-- ============================================================

-- Source: admin-app/supabase/check_appointments_cron.sql
-- Status: ไม่แน่ใจ ต้องให้ผู้ใช้ยืนยัน. It enables pg_cron/pg_net, stores Vault
-- secrets, and schedules check-appointments every 15 minutes.
-- Run that source separately only if appointment notifications are in scope.

-- Source: admin-app/supabase/auth_test.sql
-- Status: test-only; do not run as production migration. It inserts a mock
-- auth user, validates profile triggers, then rolls back.

-- ============================================================
-- 6) EXECUTION ORDER / STATUS SUMMARY
-- ============================================================
-- 1. admin-app/supabase/schema.sql
--    Status: ไม่แน่ใจ; verify public.profiles and public.risk_assessments first.
-- 2. admin-app/supabase/health_planning.sql
--    Status: ไม่แน่ใจ; verify public.health_profiles first.
-- 3. This file's personalized_risk_results CREATE TABLE
--    Status: ยืนยันแล้วว่ายังไม่ได้รัน; requires approval before execution.
-- 4. This file's read-only verification queries
--    Status: ไม่แน่ใจ; safe to run after steps 1–2.
-- 5. admin-app/supabase/check_appointments_cron.sql
--    Status: ไม่แน่ใจ; unrelated and requires secrets/Edge Function deployment.
-- 6. admin-app/supabase/auth_test.sql
--    Status: test-only, not a migration.

-- No supabase/migrations directory was found in the repository scan.
