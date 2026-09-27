-- Phase 1202: adversarial coverage for migration 154.
-- Team JWT must SELECT owner supplier_profiles; stranger must not.
--
-- Run manually when a local Postgres is available:
--   sudo -u postgres createdb traverion_test_154
--   sudo -u postgres psql -d traverion_test_154 -f supabase/tests/supplier_profiles_team_select.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table public.supplier_team_members (
  supplier_id text not null,
  user_id text not null,
  primary key (supplier_id, user_id)
);

create or replace function public.is_supplier_account_side(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and p_supplier_id is not null
    and (
      p_supplier_id = auth.uid()
      or exists (
        select 1
        from public.supplier_team_members stm
        where stm.supplier_id = p_supplier_id::text
          and stm.user_id = auth.uid()::text
      )
    );
$$;

create table public.supplier_profiles (
  id uuid primary key references auth.users(id),
  display_name text,
  verification_status text
);

alter table public.supplier_profiles enable row level security;

create policy "Owners can read own supplier profile"
  on public.supplier_profiles for select
  using (auth.uid() = id);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select on public.supplier_profiles, public.supplier_team_members to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'team@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com');

insert into public.supplier_team_members (supplier_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into public.supplier_profiles (id, display_name, verification_status) values
  ('11111111-1111-1111-1111-111111111111', 'Owner Co', 'verified');

-- GAP before 154.
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if exists (select 1 from public.supplier_profiles where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'GAP expected: team SELECT should fail before 154';
  end if;
end $$;
reset role;

\ir ../migrations/154_supplier_profiles_team_select.sql

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if not exists (
    select 1 from public.supplier_profiles
    where id = '11111111-1111-1111-1111-111111111111'
      and verification_status = 'verified'
  ) then
    raise exception 'FAIL: team JWT cannot SELECT owner profile after 154';
  end if;
  raise notice 'PASS: team JWT can SELECT owner profile';
end $$;
rollback;

begin;
set local role test_actor;
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
do $$
begin
  if exists (select 1 from public.supplier_profiles) then
    raise exception 'FAIL: stranger can SELECT supplier_profiles after 154';
  end if;
  raise notice 'PASS: stranger cannot SELECT supplier_profiles';
end $$;
rollback;

select 'supplier_profiles_team_select.test.sql OK' as result;
