-- Phase 1039: freeze consumer_profiles.welcome_email_sent_at once set.
--
-- Authenticated consumers can UPDATE their own profile (023). That includes
-- welcome_email_sent_at, which maybeSendTravelerWelcome uses as a client-side
-- dedupe flag after notify-customer-booking traveler_welcome. An attacker
-- (or buggy client) can CLEAR the timestamp and re-trigger welcome emails,
-- or flip it without authorization beyond owning the row.
--
-- Fix: BEFORE UPDATE trigger — once welcome_email_sent_at is non-null, only
-- service_role / postgres / supabase_admin may change it. Null → timestamp
-- (the legitimate client stamp after a successful send) remains allowed.

create or replace function public.consumer_profiles_freeze_welcome_email_sent_at()
returns trigger
language plpgsql
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce((select auth.jwt()) ->> 'role', '');
  if jwt_role = 'service_role' then
    return new;
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if old.welcome_email_sent_at is not null
    and new.welcome_email_sent_at is distinct from old.welcome_email_sent_at
  then
    raise exception
      using errcode = '42501',
      message = 'welcome_email_sent_at cannot be changed once set';
  end if;

  return new;
end;
$$;

drop trigger if exists consumer_profiles_freeze_welcome_email_sent_at on public.consumer_profiles;
create trigger consumer_profiles_freeze_welcome_email_sent_at
  before update on public.consumer_profiles
  for each row
  execute function public.consumer_profiles_freeze_welcome_email_sent_at();

comment on function public.consumer_profiles_freeze_welcome_email_sent_at() is
  'Once welcome_email_sent_at is stamped, consumers cannot clear or rewrite it (Phase 1039). service_role exempt.';
