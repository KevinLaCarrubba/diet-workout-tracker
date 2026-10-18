-- FitTrack Phase 1: identity, settings, goals, invitations.
--
-- Security model
--   * Every user-owned table has RLS enabled and policies scoped to auth.uid().
--   * Privileges are granted explicitly; anon gets nothing on user data.
--   * Columns that must never be user-editable (profiles.role, ids, timestamps)
--     are protected with column-level UPDATE grants.
--   * Signup is invite-only: a BEFORE INSERT trigger on auth.users rejects any
--     account that does not match a pending, unexpired invitation. The only
--     exception is bootstrapping the very first account, which becomes admin.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.unit_system as enum ('imperial', 'metric');
create type public.theme_preference as enum ('dark', 'light', 'auto');
create type public.app_role as enum ('admin', 'member');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Hard cap on accounts (members + outstanding invitations). Spec: 2–5 users.
create function public.max_members()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;

-- Valid IANA timezone name (e.g. 'America/New_York').
create function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return tz is not null and length(tz) between 1 and 64;
exception
  when others then
    return false;
end;
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default ''
    check (char_length(display_name) <= 60),
  height_cm numeric(5, 1)
    check (height_cm is null or height_cm between 50 and 275),
  timezone text not null default 'UTC'
    check (public.is_valid_timezone(timezone)),
  preferred_units public.unit_system not null default 'imperial',
  role public.app_role not null default 'member',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Private to its owner.';
comment on column public.profiles.height_cm is 'Canonical metric; converted for display only.';
comment on column public.profiles.role is 'Not user-editable (no UPDATE grant on this column).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- SECURITY DEFINER so policies on other tables can check admin status without
-- recursing through profiles RLS.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme public.theme_preference not null default 'dark',
  sound_enabled boolean not null default true,
  vibration_enabled boolean not null default true,
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  -- Reminder preferences. Delivery requires a push subscription (Phase 5),
  -- which is itself opt-in; these toggles refine what is sent.
  notify_meals boolean not null default true,
  notify_meal_followup boolean not null default false,
  notify_workouts boolean not null default true,
  notify_missed_workouts boolean not null default true,
  missed_workout_grace_minutes integer not null default 120
    check (missed_workout_grace_minutes between 15 and 1440),
  notify_weigh_in boolean not null default false,
  notify_water boolean not null default false,
  notify_weekly_summary boolean not null default false,
  water_goal_ml integer not null default 2000
    check (water_goal_ml between 250 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- fitness_goals (history; the current goal is the latest effective_from)
-- ---------------------------------------------------------------------------
create table public.fitness_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_weight_kg numeric(5, 2) not null
    check (start_weight_kg between 20 and 400),
  target_weight_kg numeric(5, 2) not null
    check (target_weight_kg between 20 and 400),
  target_date date,
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, effective_from)
);

create index fitness_goals_user_effective_idx
  on public.fitness_goals (user_id, effective_from desc);

create trigger fitness_goals_set_updated_at
  before update on public.fitness_goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null
    check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by uuid references public.profiles (id) on delete set null,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  invited_user_id uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- At most one outstanding invitation per address.
create unique index invitations_one_pending_per_email
  on public.invitations (email) where status = 'pending';

create index invitations_status_idx on public.invitations (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Auth hooks: invite-only signup + profile provisioning
-- ---------------------------------------------------------------------------

-- Seats in use = existing accounts + pending invitations that have not yet
-- produced an account.
create function public.seats_in_use()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.profiles)::integer
    + (select count(*) from public.invitations
       where status = 'pending' and expires_at > now() and invited_user_id is null)::integer;
$$;

create function public.enforce_invite_only_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_admin boolean;
  has_invite boolean;
begin
  select exists (select 1 from public.profiles where role = 'admin') into has_admin;

  if not has_admin then
    -- Bootstrap: the first account becomes the admin.
    return new;
  end if;

  if (select count(*) from public.profiles) >= public.max_members() then
    raise exception 'Member limit reached' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.invitations
    where email = lower(btrim(new.email))
      and status = 'pending'
      and expires_at > now()
      and invited_user_id is null
  ) into has_invite;

  if not has_invite then
    raise exception 'Signups are invite-only'
      using errcode = 'P0001', hint = 'Ask the FitTrack admin for an invitation.';
  end if;

  return new;
end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles where role = 'admin') into is_first;

  insert into public.profiles (id, role)
  values (new.id, case when is_first then 'admin'::public.app_role else 'member'::public.app_role end);

  insert into public.user_settings (user_id) values (new.id);

  update public.invitations
     set invited_user_id = new.id
   where email = lower(btrim(new.email))
     and status = 'pending'
     and invited_user_id is null;

  return new;
end;
$$;

-- When an invited user verifies their email (follows the invite link), the
-- invitation is complete.
create function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.invitations
       set status = 'accepted', accepted_at = now()
     where invited_user_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

-- Deleting an account that came from a still-pending invitation (e.g. the
-- admin revoking it) must not free the invitation for reuse.
create function public.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invitations
     set status = 'revoked', revoked_at = now()
   where invited_user_id = old.id and status = 'pending';
  return old;
end;
$$;

create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.handle_user_deleted();

create trigger enforce_invite_only_signup
  before insert on auth.users
  for each row execute function public.enforce_invite_only_signup();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- Used by the admin-invitations Edge Function (service role only).
create function public.auth_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users where lower(email) = lower(btrim(p_email)));
$$;

-- ---------------------------------------------------------------------------
-- Admin read model: members list without exposing personal metrics.
-- ---------------------------------------------------------------------------
create function public.admin_list_members()
returns table (
  id uuid,
  email text,
  display_name text,
  role public.app_role,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  return query
    select p.id, u.email::text, p.display_name, p.role, p.created_at,
           u.last_sign_in_at, u.email_confirmed_at is not null
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.fitness_goals enable row level security;
alter table public.invitations enable row level security;

-- profiles: owner only. Rows are created by handle_new_user, never by clients.
create policy "profiles: owner can read"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- user_settings: owner only. Rows are created by handle_new_user.
create policy "user_settings: owner can read"
  on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_settings: owner can update"
  on public.user_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- fitness_goals: owner has full control over their own goal history.
create policy "fitness_goals: owner can read"
  on public.fitness_goals for select to authenticated
  using (user_id = (select auth.uid()));

create policy "fitness_goals: owner can insert"
  on public.fitness_goals for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "fitness_goals: owner can update"
  on public.fitness_goals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "fitness_goals: owner can delete"
  on public.fitness_goals for delete to authenticated
  using (user_id = (select auth.uid()));

-- invitations: admins can read. Creating and revoking happen only in the
-- admin-invitations Edge Function (service role), because both also touch
-- auth.users (send the invite email / delete an unaccepted invited account).
create policy "invitations: admin can read"
  on public.invitations for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Privileges (explicit; do not rely on platform defaults)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.user_settings, public.fitness_goals, public.invitations
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, height_cm, timezone, preferred_units, onboarded_at)
  on public.profiles to authenticated;

grant select on public.user_settings to authenticated;
grant update (
  theme, sound_enabled, vibration_enabled,
  quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
  notify_meals, notify_meal_followup, notify_workouts, notify_missed_workouts,
  missed_workout_grace_minutes, notify_weigh_in, notify_water, notify_weekly_summary,
  water_goal_ml
) on public.user_settings to authenticated;

grant select, delete on public.fitness_goals to authenticated;
grant insert (user_id, start_weight_kg, target_weight_kg, target_date, effective_from)
  on public.fitness_goals to authenticated;
grant update (start_weight_kg, target_weight_kg, target_date)
  on public.fitness_goals to authenticated;

grant select on public.invitations to authenticated;

grant all on public.profiles, public.user_settings, public.fitness_goals, public.invitations
  to service_role;

-- Functions: PUBLIC gets EXECUTE by default; tighten to what clients need.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_members() to authenticated;
grant execute on function public.is_valid_timezone(text) to authenticated;
grant execute on function public.max_members() to authenticated;
grant execute on all functions in schema public to service_role;
-- Trigger functions run as their owner; auth's internal role must be able to fire them.
grant execute on function public.enforce_invite_only_signup() to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.handle_user_confirmed() to supabase_auth_admin;
grant execute on function public.handle_user_deleted() to supabase_auth_admin;
