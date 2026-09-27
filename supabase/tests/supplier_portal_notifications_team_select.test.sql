-- Phase 1204: adversarial coverage for migration 155.
-- Team JWT must SELECT owner-targeted supplier banners; stranger must not.
--
-- Run manually when a local Postgres is available:
--   sudo -u postgres createdb traverion_test_155
--   sudo -u postgres psql -d traverion_test_155 -f supabase/tests/supplier_portal_notifications_team_select.test.sql

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

create table public.supplier_portal_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  variant text not null default 'info',
  audience text not null check (audience in ('all', 'supplier')),
  supplier_user_id uuid,
  created_at timestamptz not null default now()
);

alter table public.supplier_portal_notifications enable row level security;

create policy supplier_portal_notifications_select_own
  on public.supplier_portal_notifications for select
  using (
    audience = 'all'
    or (audience = 'supplier' and supplier_user_id = auth.uid())
  );

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select on public.supplier_portal_notifications, public.supplier_team_members to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'team@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com');

insert into public.supplier_team_members (supplier_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into public.supplier_portal_notifications (id, title, body, audience, supplier_user_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'All', 'broadcast', 'all', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Owner only', 'warn', 'supplier',
   '11111111-1111-1111-1111-111111111111');

-- GAP before 155.
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_portal_notifications
    where audience = 'supplier';
  if n <> 0 then
    raise exception 'GAP expected: team cannot see owner banner before 155';
  end if;
end $$;
reset role;

\ir ../migrations/155_supplier_portal_notifications_team_select.sql

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_portal_notifications;
  if n <> 2 then
    raise exception 'FAIL: team should see all + owner banner after 155, got %', n;
  end if;
  raise notice 'PASS: team JWT can SELECT owner-targeted banners';
end $$;
rollback;

begin;
set local role test_actor;
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
do $$
declare n int;
begin
  select count(*) into n from public.supplier_portal_notifications where audience = 'supplier';
  if n <> 0 then
    raise exception 'FAIL: stranger can SELECT supplier banner after 155';
  end if;
  select count(*) into n from public.supplier_portal_notifications where audience = 'all';
  if n <> 1 then
    raise exception 'FAIL: stranger should still see audience=all';
  end if;
  raise notice 'PASS: stranger cannot SELECT owner-targeted banners';
end $$;
rollback;

select 'supplier_portal_notifications_team_select.test.sql OK' as result;
