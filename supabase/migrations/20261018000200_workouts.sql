-- FitTrack Phase 2: exercises, templates, schedules, sessions, sets, cardio, PRs.
--
-- Offline-first writes: sessions, session exercises, sets and cardio use
-- client-generated UUIDs. A whole workout is synced through
-- sync_workout_session(), which upserts the snapshot atomically and is
-- idempotent (replaying the same payload changes nothing).

create type public.exercise_difficulty as enum ('beginner', 'intermediate', 'advanced');
create type public.scheduled_workout_status as enum ('scheduled', 'completed', 'skipped', 'rescheduled', 'rest');
create type public.workout_session_status as enum ('in_progress', 'completed', 'discarded');
create type public.personal_record_type as enum ('max_weight', 'max_reps_at_weight', 'estimated_1rm', 'session_volume');
create type public.cardio_activity as enum ('walking', 'running', 'stairmaster', 'cycling', 'elliptical', 'rowing', 'custom');

-- ---------------------------------------------------------------------------
-- Exercises (owner_user_id null = shared catalog)
-- ---------------------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment text check (equipment is null or char_length(equipment) <= 40),
  instructions text check (instructions is null or char_length(instructions) <= 4000),
  difficulty public.exercise_difficulty not null default 'beginner',
  is_bodyweight boolean not null default false,
  media jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index exercises_unique_name
  on public.exercises (coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index exercises_owner_idx on public.exercises (owner_user_id);

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

create table public.exercise_animations (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  asset_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (exercise_id, asset_path)
);

-- Is this exercise visible to the current user (shared or their own)?
create function public.exercise_visible(p_exercise_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.exercises e
    where e.id = p_exercise_id
      and (e.owner_user_id is null or e.owner_user_id = (select auth.uid()))
  );
$$;

-- ---------------------------------------------------------------------------
-- Templates (user_id null = shared example plan that users copy)
-- ---------------------------------------------------------------------------
create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  default_rest_seconds integer not null default 90 check (default_rest_seconds between 0 and 900),
  plan_name text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workout_templates_user_idx on public.workout_templates (user_id, created_at);

create trigger workout_templates_set_updated_at
  before update on public.workout_templates
  for each row execute function public.set_updated_at();

create table public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  sort_order integer not null default 0,
  target_sets integer not null default 3 check (target_sets between 1 and 20),
  rep_min integer not null default 8 check (rep_min between 1 and 100),
  rep_max integer not null default 12 check (rep_max between 1 and 100),
  rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 900),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  check (rep_max >= rep_min)
);

create index workout_template_exercises_template_idx on public.workout_template_exercises (template_id, sort_order);
create index workout_template_exercises_exercise_idx on public.workout_template_exercises (exercise_id);

create function public.template_owned(p_template_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.workout_templates t
    where t.id = p_template_id and t.user_id = (select auth.uid())
  );
$$;

create function public.template_visible(p_template_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.workout_templates t
    where t.id = p_template_id and (t.user_id is null or t.user_id = (select auth.uid()))
  );
$$;

-- ---------------------------------------------------------------------------
-- Weekly schedule rules and dated occurrences
-- ---------------------------------------------------------------------------
create table public.workout_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 = Monday
  template_id uuid references public.workout_templates (id) on delete cascade, -- null = rest day
  local_time time,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workout_schedules_one_per_weekday
  on public.workout_schedules (user_id, weekday) where active;

create trigger workout_schedules_set_updated_at
  before update on public.workout_schedules
  for each row execute function public.set_updated_at();

create table public.scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  schedule_id uuid references public.workout_schedules (id) on delete set null,
  template_id uuid references public.workout_templates (id) on delete set null,
  local_date date not null,
  local_time time,
  -- UTC instant of local_date + local_time in the user's timezone (null when no time is set).
  scheduled_at timestamptz,
  is_rest boolean not null default false,
  status public.scheduled_workout_status not null default 'scheduled',
  rescheduled_from uuid references public.scheduled_workouts (id) on delete set null,
  session_id uuid,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_rest = (status = 'rest') or status in ('rescheduled', 'skipped'))
);

-- Materialising a recurring rule twice for the same day is a no-op.
create unique index scheduled_workouts_rule_day
  on public.scheduled_workouts (schedule_id, local_date) where schedule_id is not null;
create index scheduled_workouts_user_date_idx on public.scheduled_workouts (user_id, local_date);
create index scheduled_workouts_due_idx on public.scheduled_workouts (status, scheduled_at)
  where status = 'scheduled';

create trigger scheduled_workouts_set_updated_at
  before update on public.scheduled_workouts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sessions, exercises, sets (client UUIDs)
-- ---------------------------------------------------------------------------
create table public.workout_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid references public.workout_templates (id) on delete set null,
  scheduled_workout_id uuid references public.scheduled_workouts (id) on delete set null,
  title text not null default 'Workout' check (char_length(title) <= 80),
  status public.workout_session_status not null default 'in_progress',
  started_at timestamptz not null,
  ended_at timestamptz,
  paused_seconds integer not null default 0 check (paused_seconds >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  total_volume_kg numeric(10, 2) not null default 0,
  total_sets integer not null default 0,
  notes text check (notes is null or char_length(notes) <= 2000),
  client_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

alter table public.scheduled_workouts
  add constraint scheduled_workouts_session_fk
  foreign key (session_id) references public.workout_sessions (id) on delete set null;

create index workout_sessions_user_started_idx on public.workout_sessions (user_id, started_at desc);

create trigger workout_sessions_set_updated_at
  before update on public.workout_sessions
  for each row execute function public.set_updated_at();

create table public.workout_session_exercises (
  id uuid primary key,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  substituted_for_exercise_id uuid references public.exercises (id) on delete set null,
  sort_order integer not null default 0,
  exercise_name_snapshot text not null check (char_length(exercise_name_snapshot) <= 80),
  primary_muscles_snapshot text[] not null default '{}',
  rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 900),
  rep_min integer,
  rep_max integer,
  notes text check (notes is null or char_length(notes) <= 1000)
);

create index workout_session_exercises_session_idx on public.workout_session_exercises (session_id, sort_order);
create index workout_session_exercises_user_exercise_idx on public.workout_session_exercises (user_id, exercise_id);

create table public.workout_sets (
  id uuid primary key,
  session_exercise_id uuid not null references public.workout_session_exercises (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sort_order integer not null default 0,
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg between 0 and 1000),
  reps integer check (reps is null or reps between 0 and 1000),
  rpe numeric(3, 1) check (rpe is null or rpe between 1 and 10),
  is_warmup boolean not null default false,
  completed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 500)
);

create index workout_sets_session_exercise_idx on public.workout_sets (session_exercise_id, sort_order);

-- ---------------------------------------------------------------------------
-- Cardio
-- ---------------------------------------------------------------------------
create table public.cardio_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_type public.cardio_activity not null,
  custom_name text check (custom_name is null or char_length(custom_name) <= 60),
  occurred_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds between 1 and 86400),
  distance_meters numeric(9, 1) check (distance_meters is null or distance_meters >= 0),
  pace_seconds_per_km integer check (pace_seconds_per_km is null or pace_seconds_per_km > 0),
  incline_percent numeric(4, 1) check (incline_percent is null or incline_percent between -10 and 40),
  speed_kph numeric(5, 2) check (speed_kph is null or speed_kph between 0 and 100),
  resistance_level numeric(5, 1) check (resistance_level is null or resistance_level between 0 and 100),
  avg_heart_rate integer check (avg_heart_rate is null or avg_heart_rate between 30 and 250),
  max_heart_rate integer check (max_heart_rate is null or max_heart_rate between 30 and 250),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (activity_type <> 'custom' or custom_name is not null)
);

create index cardio_sessions_user_occurred_idx on public.cardio_sessions (user_id, occurred_at desc);

create trigger cardio_sessions_set_updated_at
  before update on public.cardio_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Personal records (an append-only log of record-setting events)
-- ---------------------------------------------------------------------------
create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  record_type public.personal_record_type not null,
  value numeric(10, 2) not null,
  weight_kg numeric(6, 2),
  reps integer,
  achieved_at timestamptz not null,
  source_session_id uuid not null references public.workout_sessions (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One record of each kind per exercise per session (reps-at-weight: per weight).
  unique nulls not distinct (source_session_id, exercise_id, record_type, weight_kg)
);

create index personal_records_user_exercise_idx on public.personal_records (user_id, exercise_id, record_type);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.exercises enable row level security;
alter table public.exercise_animations enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_template_exercises enable row level security;
alter table public.workout_schedules enable row level security;
alter table public.scheduled_workouts enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.cardio_sessions enable row level security;
alter table public.personal_records enable row level security;

create policy "exercises: read shared or own" on public.exercises for select to authenticated
  using (owner_user_id is null or owner_user_id = (select auth.uid()));
create policy "exercises: insert own" on public.exercises for insert to authenticated
  with check (owner_user_id = (select auth.uid()));
create policy "exercises: update own" on public.exercises for update to authenticated
  using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy "exercises: delete own" on public.exercises for delete to authenticated
  using (owner_user_id = (select auth.uid()));

create policy "exercise_animations: read visible" on public.exercise_animations for select to authenticated
  using ((select public.exercise_visible(exercise_id)));

create policy "templates: read shared or own" on public.workout_templates for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy "templates: insert own" on public.workout_templates for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "templates: update own" on public.workout_templates for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "templates: delete own" on public.workout_templates for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "template exercises: read visible" on public.workout_template_exercises for select to authenticated
  using ((select public.template_visible(template_id)));
create policy "template exercises: insert own" on public.workout_template_exercises for insert to authenticated
  with check ((select public.template_owned(template_id)) and (select public.exercise_visible(exercise_id)));
create policy "template exercises: update own" on public.workout_template_exercises for update to authenticated
  using ((select public.template_owned(template_id)))
  with check ((select public.template_owned(template_id)) and (select public.exercise_visible(exercise_id)));
create policy "template exercises: delete own" on public.workout_template_exercises for delete to authenticated
  using ((select public.template_owned(template_id)));

create policy "schedules: own" on public.workout_schedules for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (template_id is null or (select public.template_owned(template_id))));

create policy "scheduled workouts: own" on public.scheduled_workouts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (template_id is null or (select public.template_visible(template_id))));

create policy "sessions: own" on public.workout_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "session exercises: own" on public.workout_session_exercises for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
    and (exercise_id is null or (select public.exercise_visible(exercise_id)))
  );

create policy "sets: own" on public.workout_sets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.workout_session_exercises se
      where se.id = session_exercise_id and se.user_id = (select auth.uid())
    )
  );

create policy "cardio: own" on public.cardio_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "personal records: read own" on public.personal_records for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.exercises, public.exercise_animations, public.workout_templates,
  public.workout_template_exercises, public.workout_schedules, public.scheduled_workouts,
  public.workout_sessions, public.workout_session_exercises, public.workout_sets,
  public.cardio_sessions, public.personal_records
  from anon, authenticated;

grant select, delete on public.exercises to authenticated;
grant insert (owner_user_id, name, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_bodyweight)
  on public.exercises to authenticated;
grant update (name, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_bodyweight)
  on public.exercises to authenticated;

grant select on public.exercise_animations to authenticated;

grant select, delete on public.workout_templates to authenticated;
grant insert (id, user_id, title, description, notes, default_rest_seconds) on public.workout_templates to authenticated;
grant update (title, description, notes, default_rest_seconds, archived_at) on public.workout_templates to authenticated;

grant select, delete on public.workout_template_exercises to authenticated;
grant insert (id, template_id, exercise_id, sort_order, target_sets, rep_min, rep_max, rest_seconds, notes)
  on public.workout_template_exercises to authenticated;
grant update (exercise_id, sort_order, target_sets, rep_min, rep_max, rest_seconds, notes)
  on public.workout_template_exercises to authenticated;

grant select, delete on public.workout_schedules to authenticated;
grant insert (id, user_id, weekday, template_id, local_time, active) on public.workout_schedules to authenticated;
grant update (template_id, local_time, active) on public.workout_schedules to authenticated;

grant select, delete on public.scheduled_workouts to authenticated;
grant insert (id, user_id, schedule_id, template_id, local_date, local_time, scheduled_at, is_rest, status,
  rescheduled_from, notes) on public.scheduled_workouts to authenticated;
grant update (template_id, local_date, local_time, scheduled_at, is_rest, status, session_id, notes)
  on public.scheduled_workouts to authenticated;

-- Sessions/sets are normally written through sync_workout_session() (security invoker, so RLS applies).
grant select, delete on public.workout_sessions, public.workout_session_exercises, public.workout_sets
  to authenticated;
grant insert (id, user_id, template_id, scheduled_workout_id, title, status, started_at, ended_at, paused_seconds,
  notes, client_updated_at) on public.workout_sessions to authenticated;
grant update (template_id, scheduled_workout_id, title, status, started_at, ended_at, paused_seconds, notes,
  client_updated_at, total_volume_kg, total_sets, duration_seconds) on public.workout_sessions to authenticated;
grant insert (id, session_id, user_id, exercise_id, substituted_for_exercise_id, sort_order, exercise_name_snapshot,
  primary_muscles_snapshot, rest_seconds, rep_min, rep_max, notes) on public.workout_session_exercises to authenticated;
grant update (exercise_id, substituted_for_exercise_id, sort_order, exercise_name_snapshot, primary_muscles_snapshot,
  rest_seconds, rep_min, rep_max, notes) on public.workout_session_exercises to authenticated;
grant insert (id, session_exercise_id, user_id, sort_order, weight_kg, reps, rpe, is_warmup, completed_at, notes)
  on public.workout_sets to authenticated;
grant update (session_exercise_id, sort_order, weight_kg, reps, rpe, is_warmup, completed_at, notes)
  on public.workout_sets to authenticated;

grant select, delete on public.cardio_sessions to authenticated;
grant insert (id, user_id, activity_type, custom_name, occurred_at, duration_seconds, distance_meters,
  pace_seconds_per_km, incline_percent, speed_kph, resistance_level, avg_heart_rate, max_heart_rate, notes)
  on public.cardio_sessions to authenticated;
grant update (activity_type, custom_name, occurred_at, duration_seconds, distance_meters, pace_seconds_per_km,
  incline_percent, speed_kph, resistance_level, avg_heart_rate, max_heart_rate, notes)
  on public.cardio_sessions to authenticated;

grant select on public.personal_records to authenticated;

grant all on public.exercises, public.exercise_animations, public.workout_templates,
  public.workout_template_exercises, public.workout_schedules, public.scheduled_workouts,
  public.workout_sessions, public.workout_session_exercises, public.workout_sets,
  public.cardio_sessions, public.personal_records
  to service_role;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Epley estimate; only meaningful for lower rep ranges.
create function public.estimate_1rm(p_weight numeric, p_reps integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_weight is null or p_reps is null or p_reps < 1 or p_reps > 12 or p_weight <= 0 then null
    when p_reps = 1 then p_weight
    else round(p_weight * (1 + p_reps / 30.0), 2)
  end;
$$;

-- Creates dated occurrences from the weekly rules for [p_from, p_to] (inclusive).
-- Internal: called by ensure_my_scheduled_workouts() and the reminder job.
create function public.materialize_scheduled_workouts(p_user uuid, p_from date, p_to date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  tz text;
  inserted integer;
begin
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'Date range must be 0-62 days';
  end if;
  select timezone into tz from public.profiles where id = p_user;
  if tz is null then
    return 0;
  end if;

  insert into public.scheduled_workouts
    (user_id, schedule_id, template_id, local_date, local_time, scheduled_at, is_rest, status)
  select s.user_id, s.id, s.template_id, d::date, s.local_time,
         case when s.local_time is null then null else ((d::date + s.local_time) at time zone tz) end,
         s.template_id is null,
         case when s.template_id is null then 'rest'::public.scheduled_workout_status
              else 'scheduled'::public.scheduled_workout_status end
    from public.workout_schedules s
    cross join generate_series(p_from, p_to, interval '1 day') as d
   where s.user_id = p_user
     and s.active
     and extract(isodow from d) = s.weekday
     and s.created_at::date <= d::date + 1
  on conflict (schedule_id, local_date) where schedule_id is not null do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create function public.ensure_my_scheduled_workouts(p_from date, p_to date)
returns integer
language sql
set search_path = ''
as $$
  select public.materialize_scheduled_workouts((select auth.uid()), p_from, p_to);
$$;

-- When a weekly rule changes, drop its untouched future occurrences so they are
-- regenerated from the new rule. Past days and acted-on days are kept.
create function public.reset_future_occurrences()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz text;
begin
  select timezone into tz from public.profiles where id = old.user_id;
  delete from public.scheduled_workouts
   where schedule_id = old.id
     and status in ('scheduled', 'rest')
     and session_id is null
     and local_date >= (now() at time zone coalesce(tz, 'UTC'))::date;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger workout_schedules_reset_occurrences
  after update of template_id, local_time, active, weekday or delete on public.workout_schedules
  for each row execute function public.reset_future_occurrences();

-- Copies a shared (or own) template into the caller's templates.
create function public.copy_workout_template(p_template_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.workout_templates (id, user_id, title, description, notes, default_rest_seconds)
  select new_id, uid, t.title, t.description, t.notes, t.default_rest_seconds
    from public.workout_templates t
   where t.id = p_template_id and (t.user_id is null or t.user_id = uid);
  if not found then
    raise exception 'Template not found' using errcode = 'P0002';
  end if;
  insert into public.workout_template_exercises
    (template_id, exercise_id, sort_order, target_sets, rep_min, rep_max, rest_seconds, notes)
  select new_id, te.exercise_id, te.sort_order, te.target_sets, te.rep_min, te.rep_max, te.rest_seconds, te.notes
    from public.workout_template_exercises te
   where te.template_id = p_template_id;
  return new_id;
end;
$$;

-- Most recent completed sets per exercise (for "previous" column and prefill).
create function public.last_performance(p_exercise_ids uuid[])
returns table (
  exercise_id uuid,
  session_id uuid,
  performed_at timestamptz,
  sort_order integer,
  weight_kg numeric,
  reps integer,
  rpe numeric
)
language sql
stable
set search_path = ''
as $$
  with latest as (
    select distinct on (se.exercise_id) se.exercise_id, se.id as session_exercise_id, s.id as session_id, s.started_at
      from public.workout_session_exercises se
      join public.workout_sessions s on s.id = se.session_id
     where se.user_id = (select auth.uid())
       and s.status = 'completed'
       and se.exercise_id = any (p_exercise_ids)
       and exists (select 1 from public.workout_sets ws where ws.session_exercise_id = se.id and ws.completed_at is not null)
     order by se.exercise_id, s.started_at desc
  )
  select l.exercise_id, l.session_id, l.started_at, ws.sort_order, ws.weight_kg, ws.reps, ws.rpe
    from latest l
    join public.workout_sets ws on ws.session_exercise_id = l.session_exercise_id
   where ws.completed_at is not null and not ws.is_warmup
   order by l.exercise_id, ws.sort_order;
$$;

-- Records PR events for a completed session (idempotent via the unique key).
-- SECURITY DEFINER because personal_records is not client-writable; it only
-- ever derives records from the session owner's own completed sets.
create function public.record_personal_records(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  ended timestamptz;
  inserted integer := 0;
  n integer;
begin
  select user_id, coalesce(ended_at, started_at) into uid, ended
    from public.workout_sessions where id = p_session_id and status = 'completed';
  if uid is null then
    return 0;
  end if;
  -- Clients may only trigger this for their own sessions; the service role may run it for anyone.
  if (select auth.uid()) is not null and uid <> (select auth.uid()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- Working sets of this session.
  create temporary table if not exists pr_current (
    exercise_id uuid, weight_kg numeric, reps integer
  ) on commit drop;
  truncate pr_current;
  insert into pr_current
  select se.exercise_id, ws.weight_kg, ws.reps
    from public.workout_sets ws
    join public.workout_session_exercises se on se.id = ws.session_exercise_id
   where se.session_id = p_session_id and se.exercise_id is not null
     and ws.completed_at is not null and not ws.is_warmup
     and ws.reps is not null and ws.reps > 0;

  -- Prior history (other completed sessions that started earlier).
  create temporary table if not exists pr_prior (
    exercise_id uuid, weight_kg numeric, reps integer, session_id uuid
  ) on commit drop;
  truncate pr_prior;
  insert into pr_prior
  select se.exercise_id, ws.weight_kg, ws.reps, s.id
    from public.workout_sets ws
    join public.workout_session_exercises se on se.id = ws.session_exercise_id
    join public.workout_sessions s on s.id = se.session_id
   where s.user_id = uid and s.status = 'completed' and s.id <> p_session_id
     and s.started_at < (select started_at from public.workout_sessions where id = p_session_id)
     and se.exercise_id in (select distinct exercise_id from pr_current)
     and ws.completed_at is not null and not ws.is_warmup
     and ws.reps is not null and ws.reps > 0;

  -- Max weight.
  insert into public.personal_records (user_id, exercise_id, record_type, value, weight_kg, reps, achieved_at, source_session_id)
  select uid, c.exercise_id, 'max_weight', c.w, c.w, null, ended, p_session_id
    from (select exercise_id, max(weight_kg) as w from pr_current where weight_kg > 0 group by exercise_id) c
   where c.w > coalesce((select max(p.weight_kg) from pr_prior p where p.exercise_id = c.exercise_id), 0)
  on conflict do nothing;
  get diagnostics n = row_count; inserted := inserted + n;

  -- Estimated 1RM.
  insert into public.personal_records (user_id, exercise_id, record_type, value, weight_kg, reps, achieved_at, source_session_id)
  select uid, c.exercise_id, 'estimated_1rm', c.e1rm, null, null, ended, p_session_id
    from (select exercise_id, max(public.estimate_1rm(weight_kg, reps)) as e1rm from pr_current group by exercise_id) c
   where c.e1rm is not null
     and c.e1rm > coalesce((select max(public.estimate_1rm(p.weight_kg, p.reps)) from pr_prior p where p.exercise_id = c.exercise_id), 0)
  on conflict do nothing;
  get diagnostics n = row_count; inserted := inserted + n;

  -- Max reps at a given weight (only weights done before, so a first-ever weight isn't a "record").
  insert into public.personal_records (user_id, exercise_id, record_type, value, weight_kg, reps, achieved_at, source_session_id)
  select uid, c.exercise_id, 'max_reps_at_weight', c.r, c.weight_kg, c.r, ended, p_session_id
    from (select exercise_id, weight_kg, max(reps) as r from pr_current where weight_kg is not null group by exercise_id, weight_kg) c
   where exists (select 1 from pr_prior p where p.exercise_id = c.exercise_id and p.weight_kg = c.weight_kg)
     and c.r > (select max(p.reps) from pr_prior p where p.exercise_id = c.exercise_id and p.weight_kg = c.weight_kg)
  on conflict do nothing;
  get diagnostics n = row_count; inserted := inserted + n;

  -- Session volume per exercise.
  insert into public.personal_records (user_id, exercise_id, record_type, value, weight_kg, reps, achieved_at, source_session_id)
  select uid, c.exercise_id, 'session_volume', c.v, null, null, ended, p_session_id
    from (select exercise_id, sum(coalesce(weight_kg, 0) * reps) as v from pr_current group by exercise_id) c
   where c.v > 0
     and exists (select 1 from pr_prior p where p.exercise_id = c.exercise_id)
     and c.v > (select max(v) from (select sum(coalesce(p.weight_kg, 0) * p.reps) as v from pr_prior p
                                     where p.exercise_id = c.exercise_id group by p.session_id) prev)
  on conflict do nothing;
  get diagnostics n = row_count; inserted := inserted + n;

  return inserted;
end;
$$;

-- Atomic, idempotent upsert of a whole workout snapshot from the client.
-- Payload: { id, template_id, scheduled_workout_id, title, status, started_at, ended_at, paused_seconds,
--            notes, client_updated_at, exercises: [{ id, exercise_id, substituted_for_exercise_id, sort_order,
--            exercise_name_snapshot, primary_muscles_snapshot, rest_seconds, rep_min, rep_max, notes,
--            sets: [{ id, sort_order, weight_kg, reps, rpe, is_warmup, completed_at, notes }] }] }
-- Returns { applied: bool, status, records: [...] }.
create function public.sync_workout_session(p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  sid uuid := (p_payload ->> 'id')::uuid;
  incoming_at timestamptz := (p_payload ->> 'client_updated_at')::timestamptz;
  incoming_status public.workout_session_status := coalesce(p_payload ->> 'status', 'in_progress')::public.workout_session_status;
  existing record;
  ex jsonb;
  st jsonb;
  ex_ids uuid[] := '{}';
  set_ids uuid[] := '{}';
  vol numeric;
  nsets integer;
  started timestamptz := (p_payload ->> 'started_at')::timestamptz;
  ended timestamptz := nullif(p_payload ->> 'ended_at', '')::timestamptz;
  paused integer := coalesce((p_payload ->> 'paused_seconds')::integer, 0);
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if sid is null or incoming_at is null or started is null then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;

  select id, user_id, status, client_updated_at into existing
    from public.workout_sessions where id = sid for update;

  if found then
    if existing.user_id <> uid then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    -- Completed history is immutable; stale snapshots are ignored.
    if existing.status = 'completed' or existing.client_updated_at >= incoming_at then
      return jsonb_build_object('applied', false, 'status', existing.status,
        'records', coalesce((select jsonb_agg(to_jsonb(pr)) from public.personal_records pr where pr.source_session_id = sid), '[]'::jsonb));
    end if;
  end if;

  insert into public.workout_sessions as s
    (id, user_id, template_id, scheduled_workout_id, title, status, started_at, ended_at,
     paused_seconds, notes, client_updated_at)
  values (sid, uid, nullif(p_payload ->> 'template_id', '')::uuid, nullif(p_payload ->> 'scheduled_workout_id', '')::uuid,
          coalesce(nullif(btrim(p_payload ->> 'title'), ''), 'Workout'), incoming_status, started, ended,
          paused, nullif(p_payload ->> 'notes', ''), incoming_at)
  on conflict (id) do update set
    template_id = excluded.template_id,
    scheduled_workout_id = excluded.scheduled_workout_id,
    title = excluded.title,
    status = excluded.status,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    paused_seconds = excluded.paused_seconds,
    notes = excluded.notes,
    client_updated_at = excluded.client_updated_at
  where s.user_id = uid;

  for ex in select * from jsonb_array_elements(coalesce(p_payload -> 'exercises', '[]'::jsonb)) loop
    ex_ids := ex_ids || (ex ->> 'id')::uuid;
    insert into public.workout_session_exercises as e
      (id, session_id, user_id, exercise_id, substituted_for_exercise_id, sort_order, exercise_name_snapshot,
       primary_muscles_snapshot, rest_seconds, rep_min, rep_max, notes)
    values ((ex ->> 'id')::uuid, sid, uid, nullif(ex ->> 'exercise_id', '')::uuid,
            nullif(ex ->> 'substituted_for_exercise_id', '')::uuid, coalesce((ex ->> 'sort_order')::integer, 0),
            left(coalesce(ex ->> 'exercise_name_snapshot', 'Exercise'), 80),
            coalesce((select array_agg(value) from jsonb_array_elements_text(ex -> 'primary_muscles_snapshot')), '{}'),
            (ex ->> 'rest_seconds')::integer, (ex ->> 'rep_min')::integer, (ex ->> 'rep_max')::integer,
            nullif(ex ->> 'notes', ''))
    on conflict (id) do update set
      exercise_id = excluded.exercise_id,
      substituted_for_exercise_id = excluded.substituted_for_exercise_id,
      sort_order = excluded.sort_order,
      exercise_name_snapshot = excluded.exercise_name_snapshot,
      primary_muscles_snapshot = excluded.primary_muscles_snapshot,
      rest_seconds = excluded.rest_seconds,
      rep_min = excluded.rep_min,
      rep_max = excluded.rep_max,
      notes = excluded.notes
    where e.session_id = sid and e.user_id = uid;
    if not found then
      raise exception 'Exercise id conflict' using errcode = '23505';
    end if;

    for st in select * from jsonb_array_elements(coalesce(ex -> 'sets', '[]'::jsonb)) loop
      set_ids := set_ids || (st ->> 'id')::uuid;
      insert into public.workout_sets as w
        (id, session_exercise_id, user_id, sort_order, weight_kg, reps, rpe, is_warmup, completed_at, notes)
      values ((st ->> 'id')::uuid, (ex ->> 'id')::uuid, uid, coalesce((st ->> 'sort_order')::integer, 0),
              (st ->> 'weight_kg')::numeric, (st ->> 'reps')::integer, (st ->> 'rpe')::numeric,
              coalesce((st ->> 'is_warmup')::boolean, false), nullif(st ->> 'completed_at', '')::timestamptz,
              nullif(st ->> 'notes', ''))
      on conflict (id) do update set
        session_exercise_id = excluded.session_exercise_id,
        sort_order = excluded.sort_order,
        weight_kg = excluded.weight_kg,
        reps = excluded.reps,
        rpe = excluded.rpe,
        is_warmup = excluded.is_warmup,
        completed_at = excluded.completed_at,
        notes = excluded.notes
      where w.user_id = uid;
      if not found then
        raise exception 'Set id conflict' using errcode = '23505';
      end if;
    end loop;
  end loop;

  -- Anything removed on the device is removed here too.
  delete from public.workout_sets
   where session_exercise_id in (select id from public.workout_session_exercises where session_id = sid)
     and not (id = any (set_ids));
  delete from public.workout_session_exercises where session_id = sid and not (id = any (ex_ids));

  select coalesce(sum(coalesce(ws.weight_kg, 0) * ws.reps), 0), count(*)
    into vol, nsets
    from public.workout_sets ws
    join public.workout_session_exercises se on se.id = ws.session_exercise_id
   where se.session_id = sid and ws.completed_at is not null and not ws.is_warmup and coalesce(ws.reps, 0) > 0;

  update public.workout_sessions
     set total_volume_kg = vol,
         total_sets = nsets,
         duration_seconds = case when ended is null then null
                                 else greatest(0, extract(epoch from ended - started)::integer - paused) end
   where id = sid;

  if incoming_status = 'completed' then
    update public.scheduled_workouts
       set status = 'completed', session_id = sid
     where id = nullif(p_payload ->> 'scheduled_workout_id', '')::uuid and user_id = uid;
    perform public.record_personal_records(sid);
  end if;

  return jsonb_build_object('applied', true, 'status', incoming_status,
    'records', coalesce((select jsonb_agg(to_jsonb(pr)) from public.personal_records pr where pr.source_session_id = sid), '[]'::jsonb));
end;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_members() to authenticated;
grant execute on function public.is_valid_timezone(text) to authenticated;
grant execute on function public.max_members() to authenticated;
grant execute on function public.exercise_visible(uuid) to authenticated;
grant execute on function public.template_owned(uuid) to authenticated;
grant execute on function public.template_visible(uuid) to authenticated;
grant execute on function public.estimate_1rm(numeric, integer) to authenticated;
grant execute on function public.materialize_scheduled_workouts(uuid, date, date) to authenticated;
grant execute on function public.ensure_my_scheduled_workouts(date, date) to authenticated;
grant execute on function public.copy_workout_template(uuid) to authenticated;
grant execute on function public.last_performance(uuid[]) to authenticated;
grant execute on function public.record_personal_records(uuid) to authenticated;
grant execute on function public.sync_workout_session(jsonb) to authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.enforce_invite_only_signup() to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.handle_user_confirmed() to supabase_auth_admin;
grant execute on function public.handle_user_deleted() to supabase_auth_admin;
