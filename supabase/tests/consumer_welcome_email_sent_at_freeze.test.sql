-- Phase 1039: adversarial coverage for migration 121.
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_121
--   sudo -u postgres psql -d traverion_test_121 -f supabase/tests/consumer_welcome_email_sent_at_freeze.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb
$$;

create table public.consumer_profiles (
  id uuid primary key references auth.users(id),
  display_name text,
  welcome_email_sent_at timestamptz
);

alter table public.consumer_profiles enable row level security;
create policy "Consumers can update own profile"
  on public.consumer_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
create policy "Consumers can read own profile"
  on public.consumer_profiles for select
  using (auth.uid() = id);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select, update on public.consumer_profiles to test_actor;

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'traveler@example.com');
insert into public.consumer_profiles (id, display_name, welcome_email_sent_at) values
  ('33333333-3333-3333-3333-333333333333', 'Traveler', null);

\ir ../migrations/121_consumer_welcome_email_sent_at_freeze.sql

-- Legitimate null → stamp
begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
select set_config('test.jwt', '{"role":"authenticated"}', true);
update public.consumer_profiles
  set welcome_email_sent_at = '2026-09-27T12:00:00Z'
  where id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  if not exists (
    select 1 from public.consumer_profiles
    where id = '33333333-3333-3333-3333-333333333333'
      and welcome_email_sent_at is not null
  ) then
    raise exception 'REGRESSION: null→stamp welcome_email_sent_at wrongly blocked';
  end if;
  raise notice 'null→stamp OK';
end
$$;
rollback;

-- Stamp first as table owner, then try clear as actor
update public.consumer_profiles
  set welcome_email_sent_at = '2026-09-27T12:00:00Z'
  where id = '33333333-3333-3333-3333-333333333333';

begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
select set_config('test.jwt', '{"role":"authenticated"}', true);
do $$
begin
  begin
    update public.consumer_profiles
      set welcome_email_sent_at = null
      where id = '33333333-3333-3333-3333-333333333333';
    raise exception 'REGRESSION: clearing welcome_email_sent_at was allowed';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'clear correctly blocked: %', sqlerrm;
  end;
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (121)' as result;
