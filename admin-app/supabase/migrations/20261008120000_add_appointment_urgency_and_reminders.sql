begin;

-- Add fields to the existing per-user appointment table; preserve existing appointments.
alter table public.health_appointments
  add column if not exists urgency text,
  add column if not exists reminder_day_before_sent_at timestamptz,
  add column if not exists reminder_day_of_sent_at timestamptz;

alter table public.health_appointments
  drop constraint if exists health_appointments_urgency_check;

alter table public.health_appointments
  add constraint health_appointments_urgency_check
  check (urgency is null or urgency in ('critical', 'urgent', 'soon', 'normal'));

create index if not exists health_appointments_scheduled_at_idx
  on public.health_appointments (appointment_at)
  where status = 'scheduled';

commit;
