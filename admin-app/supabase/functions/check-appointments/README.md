# check-appointments

Deploy with Supabase CLI:

```bash
supabase functions deploy check-appointments --no-verify-jwt
```

Required Function secrets:

- `CRON_SECRET`: same value used by `check_appointments_cron.sql`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`: for example `mailto:admin@example.com`
- `REMINDER_WINDOW_MINUTES`: optional, default `60`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: supplied by Supabase; never expose the service key in the browser

Optional legacy LINE support:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_USER_ID`

Dashboard checklist:

1. Verify the sender domain in Resend and set the Resend secrets in Edge Function settings.
2. Set `CRON_SECRET` in the Function and store the same value in Vault before running the cron SQL.
3. Replace `YOUR_PROJECT_REF` in `check_appointments_cron.sql` with the real Supabase project URL.
4. Run `health_planning.sql`, deploy the function, then run `check_appointments_cron.sql` in SQL Editor.
5. Confirm `pg_cron` and `pg_net` are enabled and check Edge Function Logs after a test appointment.
