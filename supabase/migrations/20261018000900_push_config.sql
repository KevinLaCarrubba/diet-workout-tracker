-- Server-side app secrets (VAPID keys, cron secret) kept in Supabase Vault.
-- The send-reminders function generates them on first use, so no secret ever
-- has to be copied by hand. Only the VAPID *public* key is readable by clients.

create function public.app_secret(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_name not like 'fittrack_%' then
    raise exception 'Unknown secret' using errcode = '22023';
  end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1);
end;
$$;

create function public.set_app_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  if p_name not like 'fittrack_%' or p_value is null or length(p_value) < 16 then
    raise exception 'Invalid secret' using errcode = '22023';
  end if;
  select id into existing from vault.secrets where name = p_name;
  if existing is null then
    perform vault.create_secret(p_value, p_name);
  else
    perform vault.update_secret(existing, p_value);
  end if;
end;
$$;

-- Public half of the Web Push key pair (safe for any signed-in client).
create function public.vapid_public_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (select decrypted_secret from vault.decrypted_secrets where name = 'fittrack_vapid_public' limit 1);
end;
$$;

revoke execute on function public.app_secret(text) from public, anon, authenticated;
revoke execute on function public.set_app_secret(text, text) from public, anon, authenticated;
revoke execute on function public.vapid_public_key() from public, anon;
grant execute on function public.app_secret(text) to service_role;
grant execute on function public.set_app_secret(text, text) to service_role;
grant execute on function public.vapid_public_key() to authenticated, service_role;
