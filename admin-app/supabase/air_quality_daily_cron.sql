-- Configure these secrets in Supabase Vault before running this SQL:
--   air_quality_project_url = deployed admin-app origin, e.g. https://app.example.com
--   air_quality_cron_secret = same random secret as AIR_QUALITY_CRON_SECRET on the server
-- Also configure AIR_QUALITY_TARGET_LAT and AIR_QUALITY_TARGET_LON in the server environment.
-- Runs at 03:15 Asia/Bangkok (20:15 UTC) every day.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'air_quality_project_url' and nullif(trim(decrypted_secret), '') is not null
  ) or not exists (
    select 1 from vault.decrypted_secrets
    where name = 'air_quality_cron_secret' and nullif(trim(decrypted_secret), '') is not null
  ) then
    raise exception 'Configure air_quality_project_url and air_quality_cron_secret in Supabase Vault first';
  end if;
end;
$$;

select cron.unschedule('air-quality-daily-ingest')
where exists (select 1 from cron.job where jobname = 'air-quality-daily-ingest');

select cron.schedule(
  'air-quality-daily-ingest',
  '15 20 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'air_quality_project_url') || '/api/air-quality/daily-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'air_quality_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- Verify: select jobname, schedule, active from cron.job where jobname = 'air-quality-daily-ingest';
