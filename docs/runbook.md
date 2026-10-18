# FitTrack runbook

Operational notes for the hosted deployment (2–5 private users). Project ref: `scihuwuayemelfzziuqu`.

## Architecture at a glance

- **Frontend:** Vite PWA on Vercel (`vercel.json`). The browser gets only `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`. `VITE_VAPID_PUBLIC_KEY` is optional: when empty, the app fetches the public
  key from the server.
- **Database:** Supabase Postgres with RLS on every table. Migrations live in `supabase/migrations/`.
- **Edge Functions:**
  - `admin-invitations`: invites, one-time links, member removal. Admin only.
  - `send-reminders`: the push reminder job, plus the "test notification" and "init" actions.
- **Scheduler:** pg_cron job `fittrack-send-reminders` runs every 5 minutes and calls `send-reminders` with a
  shared secret (`supabase/setup/cron.sql`).
- **Secrets:** the VAPID key pair and the cron secret live in **Supabase Vault**. `send-reminders` generates them
  the first time anyone opens Settings → Notifications. Env-var overrides on the function: `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` or `https:` contact for push services), and `CRON_SECRET`.

## First-time setup on a new Supabase project

1. Apply `supabase/migrations/*.sql` in order (`supabase db push`, the SQL editor, or MCP).
   - The hosted project's migration history uses split names (`workouts_1_tables`, …). The local files are the
     canonical schema.
   - The MCP can't apply large or `DELETE`-containing migrations without an interactive confirmation.
2. Deploy both functions: `supabase functions deploy admin-invitations send-reminders --no-verify-jwt`. Both
   functions authenticate callers themselves.
3. Run `supabase/setup/cron.sql`, with the project URL changed to match.
4. Auth → URL configuration: set **Site URL** to the Vercel URL and add `http://localhost:3000` as a redirect URL.
5. Create the first account. The first account is the admin; after that, signups need an invitation.

## Deploy the frontend (Vercel)

- Import the repo and use framework preset **Vite**. Set the env vars above.
- `vercel.json` adds an SPA fallback, `no-cache` on `sw.js` so updates arrive, and security headers.
- A new deploy shows an "Update available" prompt. During a workout the app waits until the session is finished.

## Routine checks

```sql
-- Did the reminder job run? (last 10 runs)
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
-- What did the function answer?
select status_code, left(content::text, 200), created from net._http_response order by created desc limit 10;
-- Notification outcomes (deduplicated by occurrence_key)
select reminder_type, status, error_code, count(*) from notification_logs
 where attempted_at > now() - interval '1 day' group by 1, 2, 3;
-- Dead push subscriptions get revoked automatically after 404/410 or 5 failures
select count(*) filter (where revoked_at is null) as active, count(*) as total from push_subscriptions;
```

Security advisors: Dashboard → Advisors, or MCP `get_advisors`. Two known, intentional warnings:
`is_admin()` and `admin_list_members()` are callable by signed-in users. Both are scoped: the first returns
only the caller's own role, and the second raises unless the caller is admin.

## Common tasks

- **Invite someone:** Settings → Manage members → Create invitation, then share the one-time link. Members are
  capped at 5, including pending invites.
- **Someone is locked out:** Manage members → ⋯ → Create password-reset link.
- **Remove a member:** Manage members → ⋯ → Remove. This deletes their auth user, all their rows (cascade) and
  their photos.
- **Rotate push keys:** delete the `fittrack_vapid_*` secrets in Vault (Dashboard → Vault), then open Settings →
  Notifications. Each device must turn notifications on again.
- **Re-import the coach plan:** run `public.import_coach_plan(<user id>, '<json>')` as the service role. It is
  idempotent and skips anything already imported, so it never overwrites edits.

## Backups and recovery

- **Supabase:** daily backups on paid plans (Dashboard → Database → Backups). On the free plan, run
  `supabase db dump --data-only > backup-$(date +%F).sql` weekly and keep it somewhere private.
- **Progress photos:** these live in the private bucket `progress-photos`. Database dumps don't include
  Storage, so download photos separately if needed.
- **Offline data:** unsynced workouts sit in the device's IndexedDB outbox until they upload. Clearing site
  data on a phone before it syncs loses those changes. The header badge shows pending items.

## Known platform limits (by design)

- iOS Web Push needs the app installed to the Home Screen (iOS 16.4+). Delivery times are best effort.
- Rest-timer sounds and vibration only work while the app is open. Mobile OSes don't allow reliable background
  alarms for web apps.
