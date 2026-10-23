-- Removing a member still failed on the hosted database (Postgres 17) with
-- "permission denied for table profiles": the account cascade deleted their
-- workout/meal schedules, and the AFTER DELETE reset triggers fired at the end
-- of GoTrue's statement as supabase_auth_admin, which cannot read profiles.
-- (Postgres 18, used by the PGlite tests, runs them as the role that queued
-- them, so the tests never saw it.)
--
-- Delete the schedules in this SECURITY DEFINER trigger instead, so their
-- triggers run as the owner, then the templates (see template_exercise_fk).

create or replace function public.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invitations
     set status = 'revoked', revoked_at = now()
   where invited_user_id = old.id and status = 'pending';
  delete from public.meal_schedules where user_id = old.id;
  delete from public.workout_schedules where user_id = old.id;
  delete from public.workout_templates where user_id = old.id;
  return old;
end;
$$;
