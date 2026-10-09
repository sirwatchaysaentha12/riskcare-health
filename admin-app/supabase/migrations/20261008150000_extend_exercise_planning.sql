begin;

-- Preserve existing health_plans rows; add provenance and draft-state metadata.
alter table public.health_plans
  add column if not exists plan_status text not null default 'saved',
  add column if not exists rule_version text,
  add column if not exists source_inputs jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.health_plans
  drop constraint if exists health_plans_plan_status_check;
alter table public.health_plans
  add constraint health_plans_plan_status_check
  check (plan_status in ('saved', 'pending_rules'));

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  health_plan_id uuid references public.health_plans(id) on delete set null,
  activity_name text not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  feeling text,
  notes text,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists workout_sessions_user_completed_idx
  on public.workout_sessions (user_id, completed_at desc);

alter table public.health_plans enable row level security;
alter table public.workout_sessions enable row level security;

drop policy if exists "Users manage own health plans" on public.health_plans;
create policy "Users manage own health plans" on public.health_plans
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own workout sessions" on public.workout_sessions;
create policy "Users manage own workout sessions" on public.workout_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
