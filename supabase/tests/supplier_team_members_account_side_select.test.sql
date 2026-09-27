-- Phase 1209: adversarial coverage for migration 156.
-- Team JWT must SELECT full owner roster (peers); stranger must not.
--
-- Run manually when a local Postgres is available:
--   sudo -u postgres createdb traverion_test_156
--   sudo -u postgres psql -d traverion_test_156 -f supabase/tests/supplier_team_members_account_side_select.test.sql

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

-- Post-153 policy (self + owner supplier_id).
create policy "Team members can read own supplier team"
  on public.supplier_team_members for select
  using (
    user_id = auth.uid()::text
    or supplier_id = auth.uid()::text
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
  ('33333333-3333-3333-3333-333333333333', 'peer@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com');

insert into public.supplier_team_members (supplier_id, user_id, label, role) values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Primary', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Ops', 'ops'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Finance', 'finance');

-- GAP: team sees only own row before 156.
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_team_members
    where supplier_id = '11111111-1111-1111-1111-111111111111';
  if n <> 1 then
    raise exception 'GAP expected: team sees only self before 156, got %', n;
  end if;
end $$;
reset role;

\ir ../migrations/156_supplier_team_members_account_side_select.sql

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_team_members
    where supplier_id = '11111111-1111-1111-1111-111111111111';
  if n <> 3 then
    raise exception 'FAIL: team JWT cannot SELECT full roster after 156, got %', n;
  end if;
  raise notice 'PASS: team JWT can SELECT full owner roster';
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
    raise exception 'FAIL: stranger can SELECT team rows after 156, got %', n;
  end if;
  raise notice 'PASS: stranger cannot SELECT team rows';
end $$;
rollback;

select 'supplier_team_members_account_side_select.test.sql OK' as result;
