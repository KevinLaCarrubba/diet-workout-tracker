-- Coach-plan support: richer meal and workout prescriptions, plus an idempotent
-- importer. Still no nutrition data: meal "items" are literal free-text
-- quantities/alternatives exactly as written by the coach.

-- ---------------------------------------------------------------------------
-- Meals
-- ---------------------------------------------------------------------------
alter table public.meal_schedules
  add column meal_number smallint check (meal_number is null or meal_number between 1 and 20),
  add column display_order smallint not null default 0,
  -- [{ "text": "6 oz chicken OR 99% lean ground turkey", "optional": false }]
  add column items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  add column coach_note text check (coach_note is null or char_length(coach_note) <= 1000),
  add column relative_event text check (relative_event is null or relative_event in ('wake', 'workout_start', 'workout_end')),
  add column relative_offset_minutes integer check (relative_offset_minutes is null or relative_offset_minutes between -720 and 720),
  add column needs_confirmation boolean not null default false,
  add column confirmation_note text check (confirmation_note is null or char_length(confirmation_note) <= 500),
  add column import_key text check (import_key is null or char_length(import_key) <= 120);

create unique index meal_schedules_import_key on public.meal_schedules (user_id, import_key) where import_key is not null;

alter table public.meal_occurrences
  add column meal_number smallint,
  add column display_order smallint not null default 0,
  add column items_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(items_snapshot) = 'array'),
  add column coach_note_snapshot text,
  add column snoozed_until timestamptz;

grant insert (meal_number, display_order, items, coach_note, relative_event, relative_offset_minutes,
  needs_confirmation, confirmation_note) on public.meal_schedules to authenticated;
grant update (meal_number, display_order, items, coach_note, relative_event, relative_offset_minutes,
  needs_confirmation, confirmation_note) on public.meal_schedules to authenticated;
grant insert (meal_number, display_order, items_snapshot, coach_note_snapshot, snoozed_until)
  on public.meal_occurrences to authenticated;
grant update (items_snapshot, coach_note_snapshot, snoozed_until, display_order) on public.meal_occurrences to authenticated;

create or replace function public.materialize_meal_occurrences(p_user uuid, p_from date, p_to date)
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

  insert into public.meal_occurrences
    (user_id, schedule_id, local_date, local_time, scheduled_at, label_snapshot, description_snapshot, notes,
     meal_number, display_order, items_snapshot, coach_note_snapshot)
  select ms.user_id, ms.id, d::date, ms.local_time, (d::date + ms.local_time) at time zone tz,
         ms.label, ms.description, ms.notes, ms.meal_number, ms.display_order, ms.items, ms.coach_note
    from public.meal_schedules ms
    cross join generate_series(p_from, p_to, interval '1 day') as d
   where ms.user_id = p_user
     and ms.active
     and extract(isodow from d)::smallint = any (ms.recurrence_weekdays)
     and ms.created_at::date <= d::date + 1
  on conflict (schedule_id, local_date) where schedule_id is not null do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create or replace trigger meal_schedules_reset_occurrences
  after update of label, description, notes, local_time, recurrence_weekdays, active, items, coach_note,
    meal_number, display_order or delete
  on public.meal_schedules
  for each row execute function public.reset_future_meal_occurrences();

-- ---------------------------------------------------------------------------
-- Workouts
-- ---------------------------------------------------------------------------
alter table public.workout_templates
  add column import_key text check (import_key is null or char_length(import_key) <= 120);
create unique index workout_templates_import_key on public.workout_templates (user_id, import_key) where import_key is not null;

-- rep_min/rep_max stay NOT NULL; they only apply when rep_mode = 'reps'
-- (AMRAP and timed sets store 1/1 and the app ignores them).
alter table public.workout_template_exercises
  add column group_name text check (group_name is null or char_length(group_name) <= 40),
  add column tempo text check (tempo is null or char_length(tempo) <= 20),
  add column rep_mode text not null default 'reps' check (rep_mode in ('reps', 'amrap', 'timed')),
  add column duration_seconds_min integer check (duration_seconds_min is null or duration_seconds_min between 1 and 3600),
  add column alternative_exercise_ids uuid[] not null default '{}',
  add constraint workout_template_exercises_prescription_check check (
    (rep_mode in ('reps', 'amrap'))
    or (rep_mode = 'timed' and duration_seconds_min is not null)
  );

grant insert (group_name, tempo, rep_mode, duration_seconds_min, alternative_exercise_ids)
  on public.workout_template_exercises to authenticated;
grant update (group_name, tempo, rep_mode, duration_seconds_min, alternative_exercise_ids)
  on public.workout_template_exercises to authenticated;

alter table public.workout_session_exercises
  add column group_name text check (group_name is null or char_length(group_name) <= 40),
  add column tempo text check (tempo is null or char_length(tempo) <= 20),
  add column rep_mode text not null default 'reps' check (rep_mode in ('reps', 'amrap', 'timed')),
  add column duration_seconds_min integer;

grant insert (group_name, tempo, rep_mode, duration_seconds_min) on public.workout_session_exercises to authenticated;
grant update (group_name, tempo, rep_mode, duration_seconds_min) on public.workout_session_exercises to authenticated;

alter table public.workout_sets
  add column duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 7200);

grant insert (duration_seconds) on public.workout_sets to authenticated;
grant update (duration_seconds) on public.workout_sets to authenticated;

create or replace function public.copy_workout_template(p_template_id uuid)
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
    (template_id, exercise_id, sort_order, target_sets, rep_min, rep_max, rest_seconds, notes,
     group_name, tempo, rep_mode, duration_seconds_min, alternative_exercise_ids)
  select new_id, te.exercise_id, te.sort_order, te.target_sets, te.rep_min, te.rep_max, te.rest_seconds, te.notes,
         te.group_name, te.tempo, te.rep_mode, te.duration_seconds_min, te.alternative_exercise_ids
    from public.workout_template_exercises te
   where te.template_id = p_template_id;
  return new_id;
end;
$$;

-- Sync now carries groups, tempo, rep modes and timed sets.
create or replace function public.sync_workout_session(p_payload jsonb)
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
       primary_muscles_snapshot, rest_seconds, rep_min, rep_max, notes,
       group_name, tempo, rep_mode, duration_seconds_min)
    values ((ex ->> 'id')::uuid, sid, uid, nullif(ex ->> 'exercise_id', '')::uuid,
            nullif(ex ->> 'substituted_for_exercise_id', '')::uuid, coalesce((ex ->> 'sort_order')::integer, 0),
            left(coalesce(ex ->> 'exercise_name_snapshot', 'Exercise'), 80),
            coalesce((select array_agg(value) from jsonb_array_elements_text(ex -> 'primary_muscles_snapshot')), '{}'),
            (ex ->> 'rest_seconds')::integer, (ex ->> 'rep_min')::integer, (ex ->> 'rep_max')::integer,
            nullif(ex ->> 'notes', ''), nullif(ex ->> 'group_name', ''), nullif(ex ->> 'tempo', ''),
            coalesce(nullif(ex ->> 'rep_mode', ''), 'reps'), (ex ->> 'duration_seconds_min')::integer)
    on conflict (id) do update set
      exercise_id = excluded.exercise_id,
      substituted_for_exercise_id = excluded.substituted_for_exercise_id,
      sort_order = excluded.sort_order,
      exercise_name_snapshot = excluded.exercise_name_snapshot,
      primary_muscles_snapshot = excluded.primary_muscles_snapshot,
      rest_seconds = excluded.rest_seconds,
      rep_min = excluded.rep_min,
      rep_max = excluded.rep_max,
      notes = excluded.notes,
      group_name = excluded.group_name,
      tempo = excluded.tempo,
      rep_mode = excluded.rep_mode,
      duration_seconds_min = excluded.duration_seconds_min
    where e.session_id = sid and e.user_id = uid;
    if not found then
      raise exception 'Exercise id conflict' using errcode = '23505';
    end if;

    for st in select * from jsonb_array_elements(coalesce(ex -> 'sets', '[]'::jsonb)) loop
      set_ids := set_ids || (st ->> 'id')::uuid;
      insert into public.workout_sets as w
        (id, session_exercise_id, user_id, sort_order, weight_kg, reps, rpe, is_warmup, completed_at, notes,
         duration_seconds)
      values ((st ->> 'id')::uuid, (ex ->> 'id')::uuid, uid, coalesce((st ->> 'sort_order')::integer, 0),
              (st ->> 'weight_kg')::numeric, (st ->> 'reps')::integer, (st ->> 'rpe')::numeric,
              coalesce((st ->> 'is_warmup')::boolean, false), nullif(st ->> 'completed_at', '')::timestamptz,
              nullif(st ->> 'notes', ''), (st ->> 'duration_seconds')::integer)
      on conflict (id) do update set
        session_exercise_id = excluded.session_exercise_id,
        sort_order = excluded.sort_order,
        weight_kg = excluded.weight_kg,
        reps = excluded.reps,
        rpe = excluded.rpe,
        is_warmup = excluded.is_warmup,
        completed_at = excluded.completed_at,
        notes = excluded.notes,
        duration_seconds = excluded.duration_seconds
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

-- ---------------------------------------------------------------------------
-- Importer: loads a coach plan (see supabase/seed/*.json) into one user's
-- account. Idempotent: anything already imported (same import_key) is left
-- alone, so re-running never duplicates and never overwrites the user's edits.
-- ---------------------------------------------------------------------------
create function public.import_coach_plan(p_user uuid, p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  src text := p_plan ->> 'source';
  day jsonb;
  item jsonb;
  meal jsonb;
  alt text;
  tpl_id uuid;
  ex_id uuid;
  alt_ids uuid[];
  ord integer;
  wd integer;
  n_templates integer := 0;
  n_meals integer := 0;
  n_schedules integer := 0;
  n_exercises integer := 0;
begin
  -- Only the service role (or the user importing into their own account).
  if (select auth.uid()) is not null and (select auth.uid()) <> p_user then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if src is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Unknown user or plan' using errcode = '22023';
  end if;

  for day in select * from jsonb_array_elements(p_plan -> 'workouts') loop
    select id into tpl_id from public.workout_templates
     where user_id = p_user and import_key = src || ':' || (day ->> 'key');
    if tpl_id is null then
      insert into public.workout_templates (user_id, title, description, notes, import_key)
      values (p_user, day ->> 'title', day ->> 'description', day ->> 'notes', src || ':' || (day ->> 'key'))
      returning id into tpl_id;
      n_templates := n_templates + 1;

      ord := 0;
      for item in select * from jsonb_array_elements(day -> 'items') loop
        -- Exercises keep the coach's exact names as the user's own exercises.
        insert into public.exercises (owner_user_id, name, primary_muscles)
        select p_user, item ->> 'name', array(select jsonb_array_elements_text(item -> 'muscles'))
         where not exists (select 1 from public.exercises e
                            where e.owner_user_id = p_user and lower(e.name) = lower(item ->> 'name'));
        get diagnostics wd = row_count; n_exercises := n_exercises + wd;
        select id into ex_id from public.exercises where owner_user_id = p_user and lower(name) = lower(item ->> 'name');

        alt_ids := '{}';
        for alt in select * from jsonb_array_elements_text(coalesce(item -> 'alternatives', '[]'::jsonb)) loop
          insert into public.exercises (owner_user_id, name, primary_muscles)
          select p_user, alt, array(select jsonb_array_elements_text(item -> 'muscles'))
           where not exists (select 1 from public.exercises e where e.owner_user_id = p_user and lower(e.name) = lower(alt));
          get diagnostics wd = row_count; n_exercises := n_exercises + wd;
          alt_ids := alt_ids || (select id from public.exercises where owner_user_id = p_user and lower(name) = lower(alt));
        end loop;

        insert into public.workout_template_exercises
          (template_id, exercise_id, sort_order, target_sets, rep_min, rep_max, rep_mode, duration_seconds_min,
           group_name, tempo, notes, alternative_exercise_ids)
        values (tpl_id, ex_id, ord, (item ->> 'sets')::integer, coalesce((item ->> 'rep_min')::integer, 1),
                coalesce((item ->> 'rep_max')::integer, 1),
                coalesce(item ->> 'rep_mode', 'reps'), (item ->> 'duration_seconds_min')::integer,
                item ->> 'group', item ->> 'tempo', item ->> 'cue', alt_ids);
        ord := ord + 1;
      end loop;
    end if;

    -- Weekly schedule: only fill a weekday the user hasn't planned yet.
    wd := (day ->> 'weekday')::integer;
    if not exists (select 1 from public.workout_schedules where user_id = p_user and weekday = wd and active) then
      insert into public.workout_schedules (user_id, weekday, template_id, local_time)
      values (p_user, wd, tpl_id, (p_plan ->> 'workout_time')::time);
      n_schedules := n_schedules + 1;
    end if;
  end loop;

  for wd in select jsonb_array_elements_text(coalesce(p_plan -> 'rest_weekdays', '[]'::jsonb))::integer loop
    if not exists (select 1 from public.workout_schedules where user_id = p_user and weekday = wd and active) then
      insert into public.workout_schedules (user_id, weekday, template_id, local_time) values (p_user, wd, null, null);
      n_schedules := n_schedules + 1;
    end if;
  end loop;

  for meal in select * from jsonb_array_elements(p_plan -> 'meals') loop
    if not exists (select 1 from public.meal_schedules where user_id = p_user and import_key = src || ':' || (meal ->> 'key')) then
      insert into public.meal_schedules
        (user_id, label, description, notes, local_time, recurrence_weekdays, meal_number, display_order, items,
         coach_note, relative_event, relative_offset_minutes, needs_confirmation, confirmation_note, import_key)
      values (p_user, meal ->> 'label', meal ->> 'description', meal ->> 'notes', (meal ->> 'local_time')::time,
              array(select jsonb_array_elements_text(meal -> 'weekdays')::smallint),
              (meal ->> 'meal_number')::smallint, (meal ->> 'display_order')::smallint, coalesce(meal -> 'items', '[]'::jsonb),
              meal ->> 'coach_note', meal ->> 'relative_event', (meal ->> 'relative_offset_minutes')::integer,
              coalesce((meal ->> 'needs_confirmation')::boolean, false), meal ->> 'confirmation_note',
              src || ':' || (meal ->> 'key'));
      n_meals := n_meals + 1;
    end if;
  end loop;

  return jsonb_build_object('templates', n_templates, 'exercises', n_exercises, 'schedules', n_schedules, 'meals', n_meals);
end;
$$;

revoke execute on function public.import_coach_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_coach_plan(uuid, jsonb) to service_role;
