-- Run in Supabase SQL Editor after deploying check-appointments.
-- This uses the existing health_appointments table and runs every 15 minutes.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an older copy before recreating the schedule.
select cron.unschedule('check-appointments-every-15-minutes')
where exists (
  select 1 from cron.job
  where jobname = 'check-appointments-every-15-minutes'
);

-- Store these values in Supabase Vault, not in frontend code.
select vault.create_secret(
  'https://tmwmcidvnlzhbtljwsjj.supabase.co',
  'project_url'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'project_url'
);

select vault.create_secret(
  '116520pm',
  'check_appointments_cron_secret'
)
where not exists (
  select 1 from vault.decrypted_secrets
  where name = 'check_appointments_cron_secret'
);

select cron.schedule(
  'check-appointments-every-15-minutes',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'project_url'
    ) || '/functions/v1/check-appointments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'check_appointments_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- Verify after running:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname = 'check-appointments-every-15-minutes';
