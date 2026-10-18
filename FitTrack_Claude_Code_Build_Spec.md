# FitTrack — Claude Code Build Specification

## Mission
Build a private, mobile-first fitness and weight-loss Progressive Web App (PWA) for 2–5 invited users. The app manages workout routines and gym logging, simple scheduled meal reminders (NOT calorie or nutrition tracking), water intake, body-weight trends, progress, and phone push notifications. Prioritize a fast, touch-friendly workout experience.

## Required stack
- React + TypeScript + Vite
- Mantine UI (no Tailwind)
- React Router
- Supabase: Auth, PostgreSQL, Storage, Edge Functions, Row Level Security
- TanStack Query for server state; Zustand for small client-only state
- Mantine Form + Zod for validation
- Recharts for analytics
- vite-plugin-pwa + service worker
- IndexedDB/Dexie for offline workout sessions and sync queue
- Three.js via React Three Fiber + Drei for future animated exercise demonstrations
- Vitest + React Testing Library + Playwright
- Deploy frontend to Vercel

## Product constraints
- 2–5 users; invite-only signup; user data private by default.
- Mobile-first responsive interface with fixed bottom navigation: Home, Workouts, Meals, Progress, Settings.
- Dark-first premium fitness styling using Mantine; large touch targets and minimal gym data entry.
- Imperial and metric unit preferences.
- All timestamps stored consistently, with per-user IANA timezone for schedules and reminders.
- No food nutrition database, macros, calories, recipes, portion calculations, or barcode scanning. Do NOT implement these.
- Meal management is only a named meal with a scheduled time and optional notes, e.g. “Meal #2 — Chicken and rice — 1:30 PM”. User can mark as eaten, skip, or reschedule. Allow reusable meal schedules by day of week.
- Water tracking is a separate feature: quick-add buttons (e.g. 8/12/16/24 oz or metric equivalents), custom amount, daily target, history and progress.
- Notifications must be opt-in, respect quiet hours and timezones, and avoid repeated nagging.
- Do not introduce an AI dependency in V1.

## Modules and features

### 1. Authentication and profile
- Supabase email/password authentication, password reset, persistent sessions.
- Invite-only onboarding for 2–5 users. Admin can invite/manage users; users cannot view one another's personal data.
- Profile: display name, height, preferred units, timezone, starting weight, goal weight, optional target date.
- User settings: theme, reminders, quiet hours, sound/vibration preferences.
- Enforce Row Level Security on every user-owned table and secure Storage policies for private photos.

### 2. Home dashboard
- Current weight, starting weight, target weight, weight lost/gained, seven-day moving average, goal progress.
- Today's scheduled workout with Start Workout action and completion status.
- Today's meal reminders: upcoming meal name, time, and eaten/skipped/pending state.
- Today's water progress and quick-add action.
- Daily checklist: log weight, workout, meals, water target (adapt to rest days).
- Recent progress and next reminder.
- No calorie or macro widgets.

### 3. Exercises and workout templates
- Shared exercise catalog: name, primary/secondary muscles, equipment, instructions, difficulty, optional media/animation asset.
- User-created exercises.
- Reusable workout templates: title, ordered exercises, target sets, rep ranges, default rest duration, optional notes.
- Recurring weekly schedules, scheduled rest days, manual rescheduling, exercise substitutions.
- Seed common strength exercises and a few example plans (Push/Pull/Legs, Upper/Lower, Full Body); templates are editable.

### 4. Active workout mode — highest UX priority
- Prominent Start Workout, elapsed session timer, Finish/Pause/Resume actions.
- Large one-handed set logging: set number, previous performance, weight, reps, completion checkbox, optional RPE/notes.
- Automatically prefill last used weight and reps where appropriate; never overwrite a user's edits.
- Add/delete/reorder sets and exercises; navigate freely between exercises. Optionally offer guided next-exercise flow.
- Auto-start configurable rest timer on set completion; pause, skip, +30 sec, sound/vibration when available.
- Timestamp-based timers to survive backgrounding without drift; acknowledge mobile OS limits on background sound and exact alarms.
- Save every change locally immediately, recover sessions after reload/phone lock, sync to Supabase when online.
- Prevent duplicate uploads using client-generated UUIDs, idempotent writes, and visible sync state.
- Store immutable workout history with exercise snapshots; track duration, sets, reps, weight, total volume, and notes.
- Personal records: max weight, max reps at weight, estimated 1RM (clearly labeled estimate), session volume.

### 5. Cardio
- Log walking, running, StairMaster, cycling, elliptical, rowing, and custom cardio.
- Duration plus optional distance, pace, incline, speed, resistance, heart rate, notes.
- No requirement for calorie-burn estimation.

### 6. Meals — reminders only, NOT nutrition logging
- Create meal reminders with label, description, scheduled local time, optional notes and recurring weekdays.
- Example: Meal #2 | Chicken and rice | 1:30 PM.
- Day view and weekly plan; add/edit/duplicate/delete meals.
- Mark eaten, skipped, or rescheduled; record actual completion time.
- Optional gentle follow-up when meal time passes and meal remains pending; configurable per user.
- Support ad hoc meals without nutrition data.
- Dashboard shows upcoming meal and day's schedule.

### 7. Water intake
- Daily water target per user.
- Quick-add presets and custom amount with unit conversion; allow correcting/removing accidental entries.
- Daily total, progress bar, timestamps, historical chart.
- Optional scheduled hydration reminders; never imply water goals are universal medical recommendations.

### 8. Weight, body metrics, and progress
- Daily weigh-ins; weight history and seven-day rolling average; weekly/monthly trends.
- Optional body measurements: waist, chest, arms, thighs, body fat percentage.
- Optional private progress photos stored in Supabase Storage.
- Starting/current/goal weight, total change, rate of change, estimated goal date with clear uncertainty.
- Workout adherence calendar, history, strength progression, records, cardio history, water adherence, and weekly summaries.
- Rest days, skipped workouts, and reschedules must be distinguishable; no punitive streak logic.

### 9. Push notifications
- Real Web Push using VAPID keys, service worker, push subscriptions, Supabase Edge Functions and scheduled jobs (Supabase Cron/pg_cron or equivalent).
- User opt-in, granular settings, quiet hours, timezone awareness, unsubscribe/revoke handling.
- Notifications: meal due, workout upcoming, workout missed (only after configurable grace period), weigh-in reminder, optional water reminder, optional weekly summary.
- Reminder processing must be idempotent with delivery log / unique occurrence keys to avoid duplicate notifications.
- Check actual workout/meal status before sending missed reminders; skip if completed, rescheduled, or intentionally skipped.
- On iOS, Home Screen installation and permission are needed for PWA Web Push; explain this in onboarding. Browser/OS can delay delivery; do not promise exact timing.
- Rest timer uses in-app timer/audio/vibration while app is active; do not promise reliable background alarm behavior.

### 10. 3D exercise demonstrations — later phase
- Reusable `<ExerciseViewer exerciseId="..." />` built with React Three Fiber + Drei.
- Load licensed or original GLB/GLTF animated assets, not bespoke code for each exercise.
- Controls: play/pause, playback speed, camera rotate/zoom, front/side view; optional primary muscle highlighting.
- Lazy-load 3D bundle and assets to keep initial mobile app lightweight; provide a static fallback.
- Start with 10–20 common exercises; do not block V1 on animation production.

## Data model — proposed tables

### Identity
- `profiles`: id (auth user FK), display_name, height, timezone, preferred_units, created_at, updated_at.
- `user_settings`: user_id, theme, quiet_hours, reminder preferences, water_goal_ml.
- `fitness_goals`: id, user_id, start_weight_kg, target_weight_kg, target_date, effective_from.
- `invitations`: id, email, invited_by, status, expires_at (secure invite process).

### Workouts
- `exercises`: id, owner_user_id nullable (null = shared), name, muscles, equipment, instructions, difficulty, media metadata.
- `exercise_animations`: id, exercise_id, asset_path, metadata.
- `workout_templates`: id, user_id, title, description.
- `workout_template_exercises`: id, template_id, exercise_id, sort_order, target_sets, rep_min, rep_max, rest_seconds.
- `workout_schedules`: id, user_id, template_id, scheduled_at / recurrence rule, status, rescheduled_from.
- `workout_sessions`: id, user_id, template_id nullable, schedule_id nullable, started_at, ended_at, status, notes, client_updated_at.
- `workout_session_exercises`: id, session_id, exercise_id, sort_order, exercise_name_snapshot.
- `workout_sets`: id, session_exercise_id, sort_order, weight_kg, reps, completed_at, notes, optional rpe.
- `cardio_sessions`: id, user_id, activity_type, duration_seconds, distance_meters, optional metrics, occurred_at.
- `personal_records`: id, user_id, exercise_id, record_type, value, achieved_at, source_session_id.

### Meals (simple schedule only)
- `meal_schedules`: id, user_id, label, description, local_time, timezone, recurrence_weekdays, active, notes.
- `meal_occurrences`: id, user_id, schedule_id nullable, local_date, scheduled_at, label_snapshot, description_snapshot, status (pending/eaten/skipped/rescheduled), completed_at.

### Water and body
- `water_logs`: id, user_id, amount_ml, occurred_at.
- `weight_logs`: id, user_id, weight_kg, measured_at, notes.
- `body_measurements`: id, user_id, measured_at, waist_cm, chest_cm, arm_cm, thigh_cm, body_fat_percent.
- `progress_photos`: id, user_id, private_storage_path, captured_at, notes.

### Notifications
- `push_subscriptions`: id, user_id, endpoint, encrypted keys / secure representation, device_label, created_at, revoked_at.
- `reminders`: id, user_id, type, related_entity_id, schedule configuration, enabled.
- `notification_logs`: id, user_id, reminder_id, occurrence_key, status, attempted_at, delivered_at nullable, error_code; unique reminder occurrence key.

Use UUID primary keys, timestamps, constraints, appropriate indexes, foreign keys, and RLS. Store measurements in canonical metric units, convert only for display. Keep snapshots for historical accuracy. Never expose Supabase service-role credentials or VAPID private key to client code.

## PWA and offline behavior
- Installable manifest with app icons, theme color, standalone display.
- Cache application shell and selected read-only exercise metadata.
- Use IndexedDB/Dexie for active workout draft and durable outbound operation queue.
- Display offline/syncing/synced/error state.
- Recover interrupted sessions; avoid data loss and duplicate writes.
- Handle service-worker updates without silently interrupting active workouts.
- Offline meal/water entry is optional after core workout offline support works.

## Design guidelines
- Dark-first premium look; near-black backgrounds, charcoal cards, restrained electric-lime accent, subtle blue secondary accent.
- Mantine components and theme tokens; no Tailwind.
- Fixed bottom nav, safe-area padding, thumb-friendly controls, accessible contrast and focus states.
- Active workout screen prioritizes numeric inputs and set completion, with keyboard handling and minimal navigation.
- Responsive desktop layout, but mobile is primary.

## Implementation roadmap and acceptance criteria

### Phase 1: Foundation
Set up repository, dependencies, formatting/linting, environment validation, Mantine theme, routing, auth, invitation flow, profiles, Supabase migrations and RLS, responsive shell, PWA manifest/service worker, and initial tests.
**Done when:** two test users can sign in independently, cannot access each other's records, and install the PWA.

### Phase 2: Workouts
Implement exercise catalog, templates, schedule, active workout logging, previous-set values, timers, history, PRs, cardio, offline recovery and sync.
**Done when:** a full workout can be completed with phone reception disabled, reloaded, and later synchronized exactly once.

### Phase 3: Meals and water
Implement simple named meal schedules and occurrences, mark eaten/skipped/rescheduled, and water targets/logging/quick-add.
**Done when:** a user can schedule “Meal #2 — Chicken and rice” for 1:30 PM, see it on the dashboard, mark it eaten, and track water without entering nutrition facts.

### Phase 4: Body metrics and analytics
Implement weigh-ins, measurements, photos, progress graphs, workout adherence, weekly summaries.
**Done when:** charts use real user records, seven-day averages are correct, and all personal photos are private.

### Phase 5: Push notifications
Implement subscription onboarding, scheduling jobs, meal/workout/weigh-in/water notifications, missed-workout checks, timezone/quiet hours, logs, and iOS installation guidance.
**Done when:** installed supported devices receive opt-in push reminders and completed/skipped workouts do not trigger missed-workout alerts.

### Phase 6: Three.js
Implement lazy-loaded exercise viewer and a small initial animation library, with mobile performance and fallback handling.
**Done when:** animations work on supported mobile devices without slowing down the main workout UI.

### Phase 7: Hardening and deployment
Accessibility, error boundaries, loading/empty states, security and RLS audit, E2E tests, offline/online transitions, notification failure testing, backups, Vercel deployment and documentation.
**Done when:** application is reliable for 2–5 invited users and deployment/runbooks are documented.

## Claude Code execution instructions
1. Read this entire specification first.
2. Create `CLAUDE.md` with architecture, conventions, commands, security rules, and current progress.
3. Create `docs/implementation-plan.md` with granular tasks grouped by phase and a status checklist.
4. Begin with Phase 1 ONLY. Do not attempt all phases in a single pass.
5. Before coding each phase, list assumptions and unresolved choices; choose sensible defaults where low risk.
6. Implement actual runnable code, migrations, RLS policies, and tests, not mock-only screens.
7. After each phase, run typecheck, lint, tests and build; fix failures before proceeding.
8. Document environment variables in `.env.example` and setup steps in README; never commit secrets.
9. Use secure Supabase patterns: client uses publishable/anon key, privileged operations remain server-side, RLS protects all user-owned data.
10. Keep modules feature-oriented and avoid overengineering for 2–5 users.
11. Stop at phase boundaries, summarize completed work, test results, and the next phase.
12. Critically: do NOT add calories, macros, nutrition labels, recipes, or a food database. Meals are schedules/reminders with names and optional descriptions only.

## Suggested first Claude Code prompt
> Read `FitTrack_Claude_Code_Build_Spec.md` completely. Create a practical `CLAUDE.md` and phased implementation checklist. Then implement **Phase 1 only** using React, Vite, TypeScript, Mantine UI, and Supabase. Include migrations, Row Level Security, invite-only authentication, responsive mobile-first app shell, installable PWA setup, tests, and README instructions. Run checks and report results. Do not build nutrition calculations; meal tracking will be simple named reminders. Stop when Phase 1 is verified.
