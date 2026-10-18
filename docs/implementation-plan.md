# FitTrack implementation plan

Status: `[x]` done · `[ ]` todo · `[~]` partial

## Phase 1 — Foundation

- [x] Vite + React + TS, ESLint, Prettier, Vitest projects (unit, db), Playwright
- [x] Env validation (zod) and `.env.example`
- [x] Mantine dark-first theme (near-black, charcoal, lime primary, blue secondary)
- [x] Router with auth guards, onboarding gate, route error boundary
- [x] Supabase auth: sign in, forgot password, `/auth/confirm` token links, set password
- [x] Invite-only signup enforced in the database; admin bootstrap; member cap (5)
- [x] `admin-invitations` Edge Function: invite (link or email), new link, revoke, reset link, remove member
- [x] Profiles, user settings, fitness goals (with history); onboarding + settings screens
- [x] RLS + column grants on all tables; PGlite RLS tests
- [x] Responsive shell: header with sync status, bottom nav (mobile), side nav (desktop), safe areas
- [x] PWA manifest, icons, injectManifest service worker, update prompt that waits for active workouts
- [x] Verified live: two invited users sign in independently and cannot read/modify each other's rows

## Phase 2 — Workouts

- [x] Schema: exercises, templates, template exercises, schedules + dated occurrences, sessions, session exercises, sets, cardio, PRs
- [x] Seed shared catalog (41 exercises) + example plans (PPL, Upper/Lower, Full Body) copied per user
- [x] Exercise catalog + custom exercises + detail (with 3D demo)
- [x] Template editor (order, sets, rep range / AMRAP / timed, rest, group, tempo, coach cue, alternatives)
- [x] Weekly schedule, rest days, skip, reschedule (distinct states, no streaks)
- [x] Active workout: timestamp timers, pause/resume/finish, set logging, prefill + previous column, add/delete/reorder, substitutions, timed holds
- [x] Rest timer (absolute end time) with chime/vibration while open; wake lock
- [x] Dexie draft + outbox; idempotent `sync_workout_session` RPC; sync badge; recovery after reload
- [x] History (incl. unsynced device copies), session detail, PRs (max weight, reps at weight, est. 1RM labelled, volume), strength progression chart
- [x] Cardio logging (offline-first)
- [x] Verified: 5-exercise / 13-set workout logged offline → reloaded offline → reconnected → synced exactly once (scripts/smoke-phase2.mjs)

## Coach plan import (owner's account)

- [x] Coach-plan schema: meal numbering vs display order, literal items, coach notes, relative timing, conflict flag, snooze; workout groups, tempo, rep modes, timed sets, alternatives
- [x] Idempotent `import_coach_plan` + seed JSON; imported for klacarrubba.dev@gmail.com (6 templates, 67 slots, Thursday rest, 6 meals; Meal 3 flagged; Meals 3/4 off Thursdays)
- [ ] Pending owner approval: remote update of `sync_workout_session` (coach_plans_2_sync) so tempo/rep-mode/timed seconds are stored with history

## Phase 3 — Meals and water

- [x] Schema: meal schedules (weekday recurrence) + occurrences, water logs, daily totals RPC
- [x] UI: day view (coach items, notes, conflict flag), Ate/Skip/Snooze/Reschedule/Undo, ad hoc meals, weekly plan editor, water quick-add (8/12/16/24 oz) + custom + undo + history chart, offline water
- [x] Dashboard: next meal, day schedule, water progress (Home)

## Phase 4 — Body metrics and analytics

- [x] Schema: weight logs, measurements, private photos bucket, weight_trend (7-day avg), weekly_summary
- [x] UI: overview (7-day avg, rate, goal ETA as a range or "not enough data"), weight chart + log, measurements, private photos (resized, signed URLs, compare), adherence calendar, cardio + water adherence, weekly summary

## Phase 5 — Push notifications

- [x] Push subscriptions, reminders settings, idempotent notification log
- [x] SW push + click handlers; opt-in card with iOS install guidance; test notification
- [x] `send-reminders` Edge Function: meal due / snooze / follow-up, post-workout meal from actual finish, workout upcoming, missed (status-checked), weigh-in, water (only when behind), weekly summary; quiet hours + timezones
- [x] VAPID keys + cron secret generated server-side into Vault; pg_cron every 5 min (verified 200 response)

## Phase 6 — 3D exercise viewer

- [x] Lazy `<ExerciseViewer>` (R3F + Drei) with play/pause, speed, front/side, muscle highlight, static fallback
- [x] 12 original GLB demos generated from data (`scripts/generate-exercise-models.mjs`), excluded from precache

## Phase 7 — Hardening and deployment

- [x] App + route error boundaries, loading/empty states, axe scans (no serious/critical issues on main screens)
- [x] Security/RLS: RLS on every table, column grants, DB tests (64), advisor review; FK indexes added; orphaned-occurrence bug fixed
- [x] Playwright E2E (auth, PWA, a11y, RLS isolation, offline workout exactly-once) — 7/7 passing
- [x] Notification failure handling verified live (410 → subscription revoked; concurrent runs deduplicated)
- [x] Runbook (`docs/runbook.md`), README, `vercel.json`
- [ ] Owner: deploy to Vercel (needs your Vercel account) and set Supabase Site URL to the deployed URL
- [ ] Owner: enable leaked-password protection (Supabase Auth settings)
- [ ] Owner: approve the pending `coach_plans_2_sync` migration
- [ ] Before inviting real people: remove test accounts (admin@/alice@/bob@example.com)
