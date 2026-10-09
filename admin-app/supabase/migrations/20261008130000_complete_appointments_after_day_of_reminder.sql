begin;

-- Keep appointment records for history while removing completed visits from the active calendar.
alter table public.health_appointments
  add column if not exists completed_at timestamptz;

alter table public.health_appointments
  drop constraint if exists health_appointments_status_check;

alter table public.health_appointments
  add constraint health_appointments_status_check
  check (status in ('scheduled', 'cancelled', 'completed'));

commit;
