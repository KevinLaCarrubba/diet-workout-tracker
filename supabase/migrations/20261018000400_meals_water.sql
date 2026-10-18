-- FitTrack Phase 3: meal reminders (schedule only — no nutrition data) and water intake.

create type public.meal_status as enum ('pending', 'eaten', 'skipped', 'rescheduled');

-- ---------------------------------------------------------------------------
-- Meal schedules: a named meal at a local time on chosen weekdays.
-- Times are wall-clock in the user's profile timezone.
-- ---------------------------------------------------------------------------
create table public.meal_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  description text check (description is null or char_length(description) <= 120),
  notes text check (notes is null or char_length(notes) <= 500),
  local_time time not null,
  recurrence_weekdays smallint[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(recurrence_weekdays) between 1 and 7 and recurrence_weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meal_schedules_user_idx on public.meal_schedules (user_id, local_time);

create trigger meal_schedules_set_updated_at
  before update on public.meal_schedules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Meal occurrences: one per scheduled meal per day, plus ad hoc meals.
-- ---------------------------------------------------------------------------
create table public.meal_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  schedule_id uuid references public.meal_schedules (id) on delete set null,
  local_date date not null,
  local_time time not null,
  scheduled_at timestamptz not null,
  label_snapshot text not null check (char_length(btrim(label_snapshot)) between 1 and 40),
  description_snapshot text check (description_snapshot is null or char_length(description_snapshot) <= 120),
  notes text check (notes is null or char_length(notes) <= 500),
  status public.meal_status not null default 'pending',
  completed_at timestamptz,
  rescheduled_from uuid references public.meal_occurrences (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'eaten') = (completed_at is not null) or status = 'skipped')
);

create unique index meal_occurrences_rule_day
  on public.meal_occurrences (schedule_id, local_date) where schedule_id is not null;
create index meal_occurrences_user_date_idx on public.meal_occurrences (user_id, local_date, local_time);
create index meal_occurrences_due_idx on public.meal_occurrences (status, scheduled_at) where status = 'pending';

create trigger meal_occurrences_set_updated_at
  before update on public.meal_occurrences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Water
-- ---------------------------------------------------------------------------
create table public.water_logs (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_ml integer not null check (amount_ml between 1 and 5000),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index water_logs_user_occurred_idx on public.water_logs (user_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.meal_schedules enable row level security;
alter table public.meal_occurrences enable row level security;
alter table public.water_logs enable row level security;

create policy "meal schedules: own" on public.meal_schedules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "meal occurrences: own" on public.meal_occurrences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (schedule_id is null or exists (
      select 1 from public.meal_schedules ms where ms.id = schedule_id and ms.user_id = (select auth.uid())))
  );

create policy "water logs: own" on public.water_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.meal_schedules, public.meal_occurrences, public.water_logs from anon, authenticated;

grant select, delete on public.meal_schedules to authenticated;
grant insert (id, user_id, label, description, notes, local_time, recurrence_weekdays, active)
  on public.meal_schedules to authenticated;
grant update (label, description, notes, local_time, recurrence_weekdays, active)
  on public.meal_schedules to authenticated;

grant select, delete on public.meal_occurrences to authenticated;
grant insert (id, user_id, schedule_id, local_date, local_time, scheduled_at, label_snapshot, description_snapshot,
  notes, status, completed_at, rescheduled_from) on public.meal_occurrences to authenticated;
grant update (local_date, local_time, scheduled_at, label_snapshot, description_snapshot, notes, status, completed_at)
  on public.meal_occurrences to authenticated;

grant select, delete on public.water_logs to authenticated;
grant insert (id, user_id, amount_ml, occurred_at) on public.water_logs to authenticated;
grant update (amount_ml, occurred_at) on public.water_logs to authenticated;

grant all on public.meal_schedules, public.meal_occurrences, public.water_logs to service_role;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Generates pending occurrences from active schedules for [p_from, p_to].
create function public.materialize_meal_occurrences(p_user uuid, p_from date, p_to date)
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
    (user_id, schedule_id, local_date, local_time, scheduled_at, label_snapshot, description_snapshot, notes)
  select ms.user_id, ms.id, d::date, ms.local_time, (d::date + ms.local_time) at time zone tz,
         ms.label, ms.description, ms.notes
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

create function public.ensure_my_meal_occurrences(p_from date, p_to date)
returns integer
language sql
set search_path = ''
as $$
  select public.materialize_meal_occurrences((select auth.uid()), p_from, p_to);
$$;

-- Editing or pausing a schedule refreshes its untouched occurrences from today on.
create function public.reset_future_meal_occurrences()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz text;
begin
  select timezone into tz from public.profiles where id = old.user_id;
  delete from public.meal_occurrences
   where schedule_id = old.id
     and status = 'pending'
     and local_date >= (now() at time zone coalesce(tz, 'UTC'))::date;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger meal_schedules_reset_occurrences
  after update of label, description, notes, local_time, recurrence_weekdays, active or delete
  on public.meal_schedules
  for each row execute function public.reset_future_meal_occurrences();

-- Daily water totals by local calendar day in the user's timezone.
create function public.water_daily_totals(p_from date, p_to date)
returns table (local_date date, total_ml integer, entries integer)
language sql
stable
set search_path = ''
as $$
  with tz as (
    select coalesce((select timezone from public.profiles where id = (select auth.uid())), 'UTC') as name
  )
  select (w.occurred_at at time zone tz.name)::date as local_date,
         sum(w.amount_ml)::integer as total_ml,
         count(*)::integer as entries
    from public.water_logs w, tz
   where w.user_id = (select auth.uid())
     and (w.occurred_at at time zone tz.name)::date between p_from and p_to
   group by 1
   order by 1;
$$;

revoke execute on function public.materialize_meal_occurrences(uuid, date, date) from public, anon;
revoke execute on function public.ensure_my_meal_occurrences(date, date) from public, anon;
revoke execute on function public.reset_future_meal_occurrences() from public, anon, authenticated;
revoke execute on function public.water_daily_totals(date, date) from public, anon;
grant execute on function public.materialize_meal_occurrences(uuid, date, date) to authenticated, service_role;
grant execute on function public.ensure_my_meal_occurrences(date, date) to authenticated, service_role;
grant execute on function public.water_daily_totals(date, date) to authenticated, service_role;
grant execute on function public.reset_future_meal_occurrences() to service_role;
