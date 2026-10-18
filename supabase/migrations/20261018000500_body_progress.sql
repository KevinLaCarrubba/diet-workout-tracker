-- FitTrack Phase 4: weigh-ins, body measurements, private progress photos, analytics.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.weight_logs (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  weight_kg numeric(5, 2) not null check (weight_kg between 20 and 400),
  measured_at timestamptz not null,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

create index weight_logs_user_measured_idx on public.weight_logs (user_id, measured_at desc);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  measured_at timestamptz not null default now(),
  waist_cm numeric(5, 1) check (waist_cm is null or waist_cm between 20 and 300),
  chest_cm numeric(5, 1) check (chest_cm is null or chest_cm between 20 and 300),
  hips_cm numeric(5, 1) check (hips_cm is null or hips_cm between 20 and 300),
  arm_cm numeric(5, 1) check (arm_cm is null or arm_cm between 5 and 150),
  thigh_cm numeric(5, 1) check (thigh_cm is null or thigh_cm between 10 and 200),
  body_fat_percent numeric(4, 1) check (body_fat_percent is null or body_fat_percent between 2 and 75),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  check (num_nonnulls(waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm, body_fat_percent) > 0)
);

create index body_measurements_user_idx on public.body_measurements (user_id, measured_at desc);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  private_storage_path text not null unique,
  pose text check (pose is null or pose in ('front', 'side', 'back', 'other')),
  captured_at timestamptz not null default now(),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  -- Files live under "<user_id>/" in the private bucket.
  check (private_storage_path like user_id::text || '/%')
);

create index progress_photos_user_idx on public.progress_photos (user_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.weight_logs enable row level security;
alter table public.body_measurements enable row level security;
alter table public.progress_photos enable row level security;

create policy "weight logs: own" on public.weight_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "measurements: own" on public.body_measurements for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "photos: own" on public.progress_photos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.weight_logs, public.body_measurements, public.progress_photos from anon, authenticated;

grant select, delete on public.weight_logs to authenticated;
grant insert (id, user_id, weight_kg, measured_at, notes) on public.weight_logs to authenticated;
grant update (weight_kg, measured_at, notes) on public.weight_logs to authenticated;

grant select, delete on public.body_measurements to authenticated;
grant insert (id, user_id, measured_at, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm, body_fat_percent, notes)
  on public.body_measurements to authenticated;
grant update (measured_at, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm, body_fat_percent, notes)
  on public.body_measurements to authenticated;

grant select, delete on public.progress_photos to authenticated;
grant insert (id, user_id, private_storage_path, pose, captured_at, notes) on public.progress_photos to authenticated;
grant update (pose, captured_at, notes) on public.progress_photos to authenticated;

grant all on public.weight_logs, public.body_measurements, public.progress_photos to service_role;

-- ---------------------------------------------------------------------------
-- Private storage bucket for progress photos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, '{image/jpeg,image/png,image/webp,image/heic,image/heif}')
on conflict (id) do update set public = false;

create policy "progress photos: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress photos: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress photos: owner updates" on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress photos: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------

-- One weight per local day (the day's last weigh-in) plus the trailing
-- seven-calendar-day average of those daily weights.
create function public.weight_trend(p_from date, p_to date)
returns table (local_date date, weight_kg numeric, avg_7d numeric, entries_7d integer)
language sql
stable
set search_path = ''
as $$
  with tz as (
    select coalesce((select timezone from public.profiles where id = (select auth.uid())), 'UTC') as name
  ),
  daily as (
    select distinct on ((w.measured_at at time zone tz.name)::date)
           (w.measured_at at time zone tz.name)::date as d, w.weight_kg
      from public.weight_logs w, tz
     where w.user_id = (select auth.uid())
       and (w.measured_at at time zone tz.name)::date between p_from - 6 and p_to
     order by (w.measured_at at time zone tz.name)::date, w.measured_at desc
  ),
  windowed as (
    select d, weight_kg,
           avg(weight_kg) over (order by d range between interval '6 days' preceding and current row) as avg_7d,
           count(*) over (order by d range between interval '6 days' preceding and current row) as n
      from daily
  )
  select d, weight_kg, round(avg_7d, 2), n::integer
    from windowed
   where d between p_from and p_to
   order by d;
$$;

-- Week at a glance (ISO week starting p_week_start, the user's local dates).
create function public.weekly_summary(p_week_start date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with me as (
    select p.id, coalesce(p.timezone, 'UTC') as tz, s.water_goal_ml
      from public.profiles p
      join public.user_settings s on s.user_id = p.id
     where p.id = (select auth.uid())
  ),
  bounds as (select p_week_start as d0, p_week_start + 6 as d1)
  select jsonb_build_object(
    'week_start', p_week_start,
    'workouts_completed', (
      select count(*) from public.workout_sessions ws, me, bounds
       where ws.user_id = me.id and ws.status = 'completed'
         and (ws.started_at at time zone me.tz)::date between bounds.d0 and bounds.d1),
    'workouts_scheduled', (
      select count(*) from public.scheduled_workouts sw, me, bounds
       where sw.user_id = me.id and not sw.is_rest and sw.status <> 'rescheduled'
         and sw.local_date between bounds.d0 and bounds.d1),
    'workouts_skipped', (
      select count(*) from public.scheduled_workouts sw, me, bounds
       where sw.user_id = me.id and sw.status = 'skipped' and sw.local_date between bounds.d0 and bounds.d1),
    'rest_days', (
      select count(*) from public.scheduled_workouts sw, me, bounds
       where sw.user_id = me.id and sw.is_rest and sw.local_date between bounds.d0 and bounds.d1),
    'total_volume_kg', (
      select coalesce(sum(ws.total_volume_kg), 0) from public.workout_sessions ws, me, bounds
       where ws.user_id = me.id and ws.status = 'completed'
         and (ws.started_at at time zone me.tz)::date between bounds.d0 and bounds.d1),
    'cardio_minutes', (
      select coalesce(sum(c.duration_seconds), 0) / 60 from public.cardio_sessions c, me, bounds
       where c.user_id = me.id and (c.occurred_at at time zone me.tz)::date between bounds.d0 and bounds.d1),
    'meals_eaten', (
      select count(*) from public.meal_occurrences m, me, bounds
       where m.user_id = me.id and m.status = 'eaten' and m.local_date between bounds.d0 and bounds.d1),
    'meals_planned', (
      select count(*) from public.meal_occurrences m, me, bounds
       where m.user_id = me.id and m.status <> 'rescheduled' and m.local_date between bounds.d0 and bounds.d1),
    'water_days_on_target', (
      select count(*) from (
        select (w.occurred_at at time zone me.tz)::date as d, sum(w.amount_ml) as total
          from public.water_logs w, me, bounds
         where w.user_id = me.id and (w.occurred_at at time zone me.tz)::date between bounds.d0 and bounds.d1
         group by 1) t, me
       where t.total >= me.water_goal_ml),
    'weigh_ins', (
      select count(*) from public.weight_logs w, me, bounds
       where w.user_id = me.id and (w.measured_at at time zone me.tz)::date between bounds.d0 and bounds.d1),
    'weight_start_kg', (
      select w.weight_kg from public.weight_logs w, me, bounds
       where w.user_id = me.id and (w.measured_at at time zone me.tz)::date between bounds.d0 and bounds.d1
       order by w.measured_at asc limit 1),
    'weight_end_kg', (
      select w.weight_kg from public.weight_logs w, me, bounds
       where w.user_id = me.id and (w.measured_at at time zone me.tz)::date between bounds.d0 and bounds.d1
       order by w.measured_at desc limit 1)
  )
  from me;
$$;

revoke execute on function public.weight_trend(date, date) from public, anon;
revoke execute on function public.weekly_summary(date) from public, anon;
grant execute on function public.weight_trend(date, date) to authenticated, service_role;
grant execute on function public.weekly_summary(date) to authenticated, service_role;
