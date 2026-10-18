-- Hardening after review:
-- 1. Deleting a schedule must clean up its future, untouched occurrences. The
--    AFTER DELETE triggers fire after the FK's ON DELETE SET NULL action has
--    already detached them, so add BEFORE DELETE triggers that run first.
-- 2. Covering indexes for foreign keys (Supabase performance advisor).

create trigger meal_schedules_cleanup_before_delete
  before delete on public.meal_schedules
  for each row execute function public.reset_future_meal_occurrences();

create trigger workout_schedules_cleanup_before_delete
  before delete on public.workout_schedules
  for each row execute function public.reset_future_occurrences();

create index if not exists invitations_invited_by_idx on public.invitations (invited_by);
create index if not exists invitations_invited_user_idx on public.invitations (invited_user_id);
create index if not exists meal_occurrences_rescheduled_from_idx on public.meal_occurrences (rescheduled_from);
create index if not exists meal_occurrences_schedule_idx on public.meal_occurrences (schedule_id);
create index if not exists notification_logs_reminder_idx on public.notification_logs (reminder_id);
create index if not exists personal_records_exercise_idx on public.personal_records (exercise_id);
create index if not exists personal_records_session_idx on public.personal_records (source_session_id);
create index if not exists scheduled_workouts_rescheduled_from_idx on public.scheduled_workouts (rescheduled_from);
create index if not exists scheduled_workouts_session_idx on public.scheduled_workouts (session_id);
create index if not exists scheduled_workouts_template_idx on public.scheduled_workouts (template_id);
create index if not exists workout_schedules_template_idx on public.workout_schedules (template_id);
create index if not exists workout_session_exercises_exercise_idx on public.workout_session_exercises (exercise_id);
create index if not exists workout_session_exercises_substituted_idx on public.workout_session_exercises (substituted_for_exercise_id);
create index if not exists workout_sessions_scheduled_workout_idx on public.workout_sessions (scheduled_workout_id);
create index if not exists workout_sessions_template_idx on public.workout_sessions (template_id);
create index if not exists workout_sets_user_idx on public.workout_sets (user_id);
create index if not exists exercise_animations_exercise_idx on public.exercise_animations (exercise_id);
