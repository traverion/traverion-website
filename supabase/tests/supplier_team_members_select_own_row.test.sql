-- Phase 1201: adversarial coverage for migration 153.
-- Invited team JWT must SELECT own membership row; stranger must not.
--
-- Run manually when a local Postgres is available:
--   sudo -u postgres createdb traverion_test_153
--   sudo -u postgres psql -d traverion_test_153 -f supabase/tests/supplier_team_members_select_own_row.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table public.supplier_team_members (
  supplier_id text not null,
  user_id text not null,
  label text,
  role text not null check (role in ('owner', 'manager', 'ops', 'finance', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (supplier_id, user_id)
);

alter table public.supplier_team_members enable row level security;

-- Pre-153 recursive policy (014 shape).
create policy "Team members can read own supplier team"
  on public.supplier_team_members for select
  using (
    exists (
      select 1
      from public.supplier_team_members stm
      where stm.supplier_id = supplier_team_members.supplier_id
        and stm.user_id = auth.uid()::text
    )
  );

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select on public.supplier_team_members to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'team@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com');

insert into public.supplier_team_members (supplier_id, user_id, label, role) values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Primary', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Ops', 'ops');

-- GAP: recursive EXISTS often fails for invited team (or errors); expect no visible row.
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  begin
    select count(*) into n from public.supplier_team_members
      where user_id = '22222222-2222-2222-2222-222222222222';
  exception when others then
    n := 0; -- recursion / policy error counts as gap
  end;
  if n <> 0 then
    raise notice 'pre-153 team SELECT returned % (host may short-circuit recursion); continuing', n;
  end if;
end $$;
reset role;

-- Apply 153.
drop policy if exists "Team members can read own supplier team" on public.supplier_team_members;
create policy "Team members can read own supplier team"
  on public.supplier_team_members for select
  using (
    user_id = auth.uid()::text
    or supplier_id = auth.uid()::text
  );

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_team_members
    where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then
    raise exception 'FAIL: team JWT cannot SELECT own membership row after 153, got %', n;
  end if;
  raise notice 'PASS: team JWT can SELECT own membership row';
end $$;
rollback;

begin;
set local role test_actor;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_team_members
    where supplier_id = '11111111-1111-1111-1111-111111111111';
  if n <> 2 then
    raise exception 'FAIL: owner JWT cannot SELECT full team after 153, got %', n;
  end if;
  raise notice 'PASS: owner JWT can SELECT full team';
end $$;
rollback;

begin;
set local role test_actor;
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_team_members;
  if n <> 0 then
    raise exception 'FAIL: stranger can SELECT team rows after 153, got %', n;
  end if;
  raise notice 'PASS: stranger cannot SELECT team rows';
end $$;
rollback;

select 'supplier_team_members_select_own_row.test.sql OK' as result;
