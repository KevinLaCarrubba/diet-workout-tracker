# FitTrack

Private, mobile-first fitness PWA for a handful of invited people: workouts and gym logging, scheduled meal
reminders (no nutrition tracking), water, body weight and progress, and push reminders.

## Setup

Requirements: Node 22 (`nvm use`), a Supabase project.

```bash
npm install
cp .env.example .env.local   # fill in your project URL and publishable key
npm run dev                  # http://localhost:3000
```

### Supabase

1. Apply the SQL in `supabase/migrations/` in order (Supabase CLI `supabase db push`, the SQL editor, or MCP).
2. Deploy Edge Functions in `supabase/functions/` (`supabase functions deploy <name>`).
3. Auth settings (Dashboard → Authentication):
   - **Site URL**: your production URL (e.g. `https://fittrack.vercel.app`); add `http://localhost:3000` to
     redirect URLs for local development.
   - Optional: custom SMTP if you want invitation/reset emails. Without it, admins share one-time links.
   - Optional email template (Reset password): `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
4. Optional Edge Function secret `ALLOWED_APP_ORIGINS` (comma-separated) to pin invite-link origins.

### Push reminders

Push works without manual key handling. The first time anyone opens **Settings → Notifications**, the
`send-reminders` function generates the VAPID key pair and cron secret and stores them in Supabase Vault. Then
run `supabase/setup/cron.sql` once to schedule the job every 5 minutes. On iPhone, notifications require adding
FitTrack to the Home Screen (iOS 16.4+).

### First admin

The first account created in the project becomes the admin; after that, signups are rejected unless the email
has a pending invitation. Create the first account in the Dashboard (Authentication → Add user), then sign in.
Invite others from **Settings → Manage members**. The cap is 5 accounts.

## Scripts

| Command                   | What it does                                             |
| ------------------------- | -------------------------------------------------------- |
| `npm run dev`             | Dev server                                               |
| `npm run verify`          | Typecheck, lint, format check, tests, production build   |
| `npm run test:unit`       | Component and library tests (jsdom)                      |
| `npm run test:db`         | Migration + RLS tests in an in-process Postgres (PGlite) |
| `npm run test:e2e`        | Playwright end-to-end tests                              |
| `npm run check:functions` | Type-check Edge Functions with Deno                      |

## End-to-end tests

The E2E suite runs against the real Supabase project, using existing invited test accounts. It never creates
accounts.

```bash
set -a; . ./.env.local; set +a
E2E_EMAIL=… E2E_PASSWORD=… E2E_EMAIL_2=… E2E_PASSWORD_2=… npm run test:e2e
```

It builds and serves the production bundle, so the service worker and offline mode are real. It covers:

- the auth guard and sign-in errors
- PWA installability
- axe accessibility scans of the main screens
- RLS isolation between two members
- a workout logged offline, reloaded, and synced exactly once

## Deploying

The frontend deploys to Vercel; `vercel.json` covers SPA routing, service worker caching and security headers.
Operational notes are in `docs/runbook.md`.

## Coach plans

`supabase/seed/*.json` holds coach programs, imported per user with `public.import_coach_plan(user_id, plan)`
(service role only). The import is idempotent: re-running never duplicates rows and never overwrites edits.

## Security model

- Row Level Security on every table; users can only read and write their own rows.
- Column-level grants stop clients editing protected fields (roles, ownership, timestamps).
- Invite-only signup is enforced by a database trigger, not just the UI.
- The browser only has the publishable key. Privileged operations run in Edge Functions.

See `CLAUDE.md` for architecture and conventions, `docs/implementation-plan.md` for progress.
