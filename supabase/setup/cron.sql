-- Hosted-project setup (not a migration: pg_cron/pg_net/vault exist only on Supabase).
-- Runs the reminder job every 5 minutes. The shared secret is read from Vault at
-- run time; send-reminders creates it on first use (Settings → Notifications).
-- Replace the project URL when deploying to another project.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'fittrack-send-reminders',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://scihuwuayemelfzziuqu.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fittrack_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
