-- Removing a member failed once they had templates that use their own
-- exercises: deleting the account cascades to exercises before it reaches
-- workout_templates, so the exercise FK on workout_template_exercises still
-- saw referencing rows.
--
-- 1. Delete the member's templates first, in the existing BEFORE DELETE
--    trigger on auth.users (create or replace keeps its grants).
-- 2. RESTRICT -> NO ACTION. Deleting an exercise a template still uses is
--    still refused, but now with SQLSTATE 23503, which the client maps to
--    "used in one of your templates" (RESTRICT raised 23001).

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
  delete from public.workout_templates where user_id = old.id;
  return old;
end;
$$;

alter table public.workout_template_exercises
  drop constraint workout_template_exercises_exercise_id_fkey,
  add constraint workout_template_exercises_exercise_id_fkey
    foreign key (exercise_id) references public.exercises (id) on delete no action;
