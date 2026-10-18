-- FitTrack Phase 5: Web Push subscriptions, reminder settings, idempotent delivery log.
-- The send-reminders Edge Function (service role) is invoked by pg_cron; see
-- docs/runbook.md for the schedule, which needs the project URL and a secret.

create type public.reminder_type as enum (
  'meal_due', 'meal_followup', 'workout_upcoming', 'workout_missed', 'weigh_in', 'water', 'weekly_summary'
);
create type public.notification_status as enum ('sent', 'failed', 'skipped');

-- ---------------------------------------------------------------------------
-- Push subscriptions (one per browser/device)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  -- Browser-generated encryption keys for this subscription (not account secrets);
  -- readable only by the owner and the service role.
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  device_label text check (device_label is null or char_length(device_label) <= 60),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0,
  revoked_at timestamptz
);

create index push_subscriptions_user_active_idx on public.push_subscriptions (user_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Time-based reminders that aren't tied to a meal or workout
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.reminder_type not null check (type in ('weigh_in', 'water', 'weekly_summary')),
  enabled boolean not null default true,
  local_time time not null,
  weekdays smallint[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  related_entity_id uuid,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type, local_time)
);

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Delivery log: one row per reminder occurrence; the unique key makes sending
-- idempotent even if the job overlaps or retries.
-- ---------------------------------------------------------------------------
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reminder_id uuid references public.reminders (id) on delete set null,
  reminder_type public.reminder_type not null,
  related_entity_id uuid,
  occurrence_key text not null unique,
  status public.notification_status not null,
  title text,
  body text,
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  error_code text,
  devices_attempted integer not null default 0,
  devices_delivered integer not null default 0
);

create index notification_logs_user_idx on public.notification_logs (user_id, attempted_at desc);

-- ---------------------------------------------------------------------------
-- Settings: when reminders fire
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column weigh_in_time time not null default '07:30',
  add column water_reminder_times time[] not null default '{11:00,14:00,17:00}'
    check (cardinality(water_reminder_times) <= 8),
  add column workout_reminder_minutes integer not null default 30
    check (workout_reminder_minutes between 0 and 240),
  add column weekly_summary_weekday smallint not null default 7 check (weekly_summary_weekday between 1 and 7),
  add column weekly_summary_time time not null default '18:00';

grant update (weigh_in_time, water_reminder_times, workout_reminder_minutes, weekly_summary_weekday, weekly_summary_time)
  on public.user_settings to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;
alter table public.reminders enable row level security;
alter table public.notification_logs enable row level security;

create policy "push subscriptions: own" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reminders: own" on public.reminders for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notification logs: read own" on public.notification_logs for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions, public.reminders, public.notification_logs from anon, authenticated;

grant select, delete on public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth, device_label, user_agent) on public.push_subscriptions to authenticated;
grant update (device_label, revoked_at) on public.push_subscriptions to authenticated;

grant select, delete on public.reminders to authenticated;
grant insert (user_id, type, enabled, local_time, weekdays, related_entity_id, config) on public.reminders to authenticated;
grant update (enabled, local_time, weekdays, config) on public.reminders to authenticated;

grant select on public.notification_logs to authenticated;

grant all on public.push_subscriptions, public.reminders, public.notification_logs to service_role;

-- Registers (or re-activates) this device's subscription for the caller. A
-- browser endpoint belongs to one device; if another account signed in on the
-- same browser before, the subscription moves to the current user.
create function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_device_label text, p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  sub_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_label, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, nullif(btrim(p_device_label), ''), left(p_user_agent, 300))
  on conflict (endpoint) do update set
    user_id = uid,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    device_label = coalesce(excluded.device_label, public.push_subscriptions.device_label),
    user_agent = excluded.user_agent,
    revoked_at = null,
    failure_count = 0
  returning id into sub_id;
  return sub_id;
end;
$$;

revoke execute on function public.register_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text, text) to authenticated, service_role;

-- Same week-at-a-glance as weekly_summary(), for the reminder job (service role only).
create function public.weekly_summary_for(p_user uuid, p_week_start date)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'service_role')::text, true);
  select public.weekly_summary(p_week_start) into result;
  return result;
end;
$$;

revoke execute on function public.weekly_summary_for(uuid, date) from public, anon, authenticated;
grant execute on function public.weekly_summary_for(uuid, date) to service_role;
