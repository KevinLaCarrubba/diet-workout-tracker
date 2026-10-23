# Handoff — where we left off

Last updated: **2026-10-18** (Sunday). The owner's plan starts **Monday 2026-10-19 at 3:35 AM**, which is week one.
Read this first, then `CLAUDE.md` (rules and conventions) and `docs/implementation-plan.md` (feature checklist).

## State in one paragraph

All 7 phases of `FitTrack_Claude_Code_Build_Spec.md` are built, verified and deployed. The owner's coach plan
(`FitTrack_Claude_Meals_Workouts_Import.md`) is imported into their account, with the meal times and labels below.
Every exercise and alternative in the plan has a 3D demo. The work now is **iterating on the owner's feedback during
week one**: demos that don't match their gym's machines, meal and workout tweaks, and small UX fixes.

## Where things live

| What          | Where                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Live app      | https://fittrack-sand-one.vercel.app (Vercel team `kevinlacarrubbas-projects`)                 |
| Repo          | `git@github.com:KevinLaCarrubba/diet-workout-tracker.git` (**public**), branch `main`          |
| Deploys       | Pushing to `main` auto-deploys on Vercel                                                       |
| Supabase      | Project ref `scihuwuayemelfzziuqu`, via the Supabase MCP (`execute_sql`, `apply_migration`, …) |
| Owner account | The admin whose email is _not_ `@example.com`. It's in Claude memory (`coach-plan-decisions`)  |
| Ops notes     | `docs/runbook.md` (cron checks, notification logs, invites, backups)                           |

### Local setup

- Node 22: `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`. The default nvm Node is 20, which is too old.
- `npm run dev` serves http://localhost:3000. `npm run verify` must pass before calling anything done (325 tests at
  last run).
- Git pushes go over SSH. The HTTPS remote picks up a work credential and fails with a 403.
- `vercel` CLI commands need `--scope kevinlacarrubbas-projects`.
- `.env.local` holds the client env vars and a Vercel OIDC token, and is gitignored. Smoke scripts
  `scripts/smoke-*.mjs` and `scripts/.*.mjs` contain the test password and are also gitignored.

## Owner's schedule (live in the DB)

Timezone `America/New_York`. Wake time is 3:30 AM. Quiet hours are **21:00–03:30**, moved from 22:00–07:00 so the
early reminders get through. One active iPhone push subscription (web.push.apple.com), registered 2026-10-18.

**Workouts:** all at 5:00 AM. Mon Shoulders + Chest · Tue Legs + Glutes + Calves · Wed Back · **Thu rest** · Fri
Shoulders + Triceps + Chest · Sat Legs + Glutes + Calves · Sun Back + Biceps.

**Meals.** Labels follow the order the owner eats. `meal_number` keeps the coach's numbering, and the weekly-plan
UI shows "Coach meal #N" when the label differs.

| Training days (Mon–Wed, Fri–Sun)                                                                        | Coach # |     | Thursday (rest)   | Coach # |
| ------------------------------------------------------------------------------------------------------- | ------- | --- | ----------------- | ------- |
| 3:35 Meal 1: whey                                                                                       | 1       |     | 3:35 Meal 1       | 1       |
| 4:00 Meal 2 (Pre-workout)                                                                               | 3       |     | 7:00 Meal 2: beef | 2       |
| ~6:30 Meal 3 (Post-workout); also fires when a logged workout finishes (`relative_event = workout_end`) | 4       |     | 10:15 Meal 3      | 3       |
| 9:00 Meal 4: beef                                                                                       | 2       |     | 1:15 PM Meal 4    | 4       |
| 4:30 PM Meal 5                                                                                          | 5       |     | 4:30 PM Meal 5    | 5       |
| 8:00 PM Meal 6                                                                                          | 6       |     | 8:00 PM Meal 6    | 6       |

How this is stored:

- A meal schedule has **one time for all its weekdays**. Thursday therefore has separate rows for coach meals 2, 3
  and 4 (import keys `…:meal-2-thu`, `…:meal-3-thu`, `…:meal-4-thu`). The regular rows exclude weekday 4.
  - If the owner changes a food in one of those meals, update **both** rows.
  - If the duplicate rows get annoying, consider adding per-weekday time overrides.
- Changing a schedule **deletes that schedule's future pending occurrences**. They are regenerated on demand by
  `ensure_my_meal_occurrences` (from the app) or `materialize_meal_occurrences(user, from, to)` (service role).
  `send-reminders` also materializes the current day on every run.
  - After editing schedules over SQL, re-materialize, then **query in a separate statement**. A CTE can't see rows
    the function inserted in the same statement.
- The seed `supabase/seed/coach-plan-garrett-2026-10-18.json` mirrors the live plan, including the Thursday rows and
  the labels. `tests/db/coach_plan.test.ts` asserts on it. Re-importing (`import_coach_plan`) skips existing import
  keys and never overwrites edits.
- Hard rule: **no nutrition data** (calories, macros and so on). Store quantities literally.
- Open questions for the coach, not decided by us: raw vs cooked weights, and cream-of-rice serving size.

## 3D exercise demos: week-one review list

The generator is `scripts/generate-exercise-models.mjs`. Its exercise libraries are in `scripts/exercise-models/`
(`kit.mjs` for the rig and helpers, plus `library-core.mjs`, `library-coach.mjs` and `library-coach-2.mjs`). The
output is `public/models/exercises/*.glb` plus `manifest.json`: 63 GLBs, about 3.5 MB, not precached. The client
manifest with aliases and tempo is `src/features/exercise-viewer/manifest.ts`.
`src/features/exercise-viewer/library.test.ts` fails if any coach-plan exercise or alternative lacks a demo.

Approximations to check with the owner, and fix if they don't match the gym:

- Hamstring Curls are shown as a **lying** curl. Is the gym's machine seated?
- Pendulum Squat and Hack Squat are generic machine approximations.
- Pec Deck shows the handle version, not the elbow-pad version.
- Standing Viking Press is shown as a landmine press.
- Single Arm Alternating DB Row is shown chest-supported on an incline bench.
- Calf raises: the heel lift is small on camera, so the camera could zoom in.

## Still open

**Owner to-dos.** Status unknown: ask the owner.

- Supabase Auth → Email:
  - min password length 10, letters + digits (the client already enforces this)
  - OTP/link expiry 86400
- Supabase Auth → Sessions: make sure the time-box and inactivity limits are 0. The owner wants never to be logged
  out; the client also requests persistent storage.
- Leaked-password protection: the owner couldn't find the toggle. It's likely a Pro-plan feature, so it's fine to
  skip.
- Done: Site URL set to the Vercel URL; app installed on the iPhone with push enabled.

**Members (2026-10-23):** the owner (admin), two real members (gibby, joined 10-19; Josh, joined 10-23) and the
test accounts `admin@example.com` and `bob@example.com`. Alice is already removed.

- Removing members failed until migrations `20261023000100_template_exercise_fk` and
  `20261023000200_user_delete_schedules` (remote: `template_exercise_fk`, `user_delete_schedules`).
  `handle_user_deleted` now deletes the member's meal/workout schedules and templates itself, before the cascade.
  - Hosted Postgres is **17**; PGlite tests run **18**, which runs AFTER triggers as the role that queued them. On
    17 the schedule reset triggers fired as `supabase_auth_admin` (no rights on `profiles`), so DB tests can't catch
    that class of bug. Keep account cleanup inside the SECURITY DEFINER trigger.
- Admins can remove other admins (owner's call, 2026-10-23); only removing yourself is refused. The owner wants to be
  the sole admin: there is no promote UI, so nobody else can become one.
- The member cap is 5, including pending invites.

**Docs housekeeping:** `docs/implementation-plan.md` still lists "deploy to Vercel" and "approve
coach_plans_2_sync" as open. Both are done: the remote migration `coach_plans_2_sync` is applied. Tick them, and
add the Phase 6 coach-demo lines.

## Gotchas that cost time before

- **Supabase MCP `apply_migration`:** large payloads, `DROP` and `DELETE … USING` trigger an approval prompt that
  expires with "Invalid or expired requestState" when the owner is away.
  - Split migrations, use `create or replace`, and avoid `DROP`.
  - Local files in `supabase/migrations/` are canonical; remote history uses split names.
- **Types:** regenerate with MCP `generate_typescript_types`, save the result to a file, then run
  `python3 scripts/write-types.py <file>`.
- **Offline:** queries use `networkMode: 'offlineFirst'`. Workouts sync through the Dexie outbox and the idempotent
  `sync_workout_session` RPC, and completed sessions are immutable.
- **Reminders:** pg_cron runs every 5 minutes and calls `send-reminders`. Each reminder is due within a 10-minute
  window and deduplicated by `occurrence_key`. Check outcomes in `notification_logs` (queries are in the runbook).
- **Shell:** zsh in this environment chokes on `${!v}` and on unquoted `--include=*.tsx` globs. Use bash or quote
  them.
- **Chrome testing:** the Claude-in-Chrome extension may not be connected. Playwright Chromium against the real
  Supabase project works as a fallback, with test user bob@example.com and the password from the smoke scripts.
