-- Phase 1018: adversarial regression coverage for migration 109
-- (supplier_booking_events cross-supplier ownership guard).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_109
--   sudo -u postgres psql -d traverion_test_109 -f supabase/tests/supplier_booking_events_ownership_guard.test.sql
--
-- Builds a minimal schema covering the real tables the affected policies
-- reference (auth.users, public.listings, public.bookings), then installs
-- the CURRENT, real, committed migration 016 body for events (transcribed
-- as read on 2026-09-27), proves GAP CONFIRMED against it, applies the
-- real migration 109 fix, proves the same attempt is rejected, proves a
-- genuine same-supplier event insert/read still works, and mutation-tests
-- the fix by reverting it and confirming the gap reopens.

\set ON_ERROR_STOP on

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create or replace function auth.role() returns text
language sql stable
as $$ select coalesce(current_setting('test.role', true), 'anon') $$;

create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  guest_user_id uuid,
  guest_email text
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end
$$;

grant usage on schema public to test_actor;
grant select, insert, update, delete on public.listings, public.bookings to test_actor;

-- ============================================================
-- CURRENT pre-109 migration 016 body for events, verbatim.
-- ============================================================
create table public.supplier_booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  supplier_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in ('booking_created', 'acknowledged', 'status_confirmed', 'status_cancelled', 'note')
  ),
  details text,
  created_at timestamptz not null default now()
);

alter table public.supplier_booking_events enable row level security;

create policy "Suppliers can read own booking events"
  on public.supplier_booking_events
  for select
  using (supplier_id = auth.uid());

create policy "Suppliers can write own booking events"
  on public.supplier_booking_events
  for insert
  with check (supplier_id = auth.uid());

grant select, insert on public.supplier_booking_events to test_actor;

-- ============================================================
-- Seed data.
-- ============================================================
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'supplier-b@example.com');

insert into public.listings (id, supplier_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222');

insert into public.bookings (id, listing_id, guest_user_id, guest_email) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'traveler@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', null, 'other-traveler@example.com');

-- ============================================================
-- GAP CONFIRMED (pre-fix): supplier B plants an event on A's booking.
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  insert into public.supplier_booking_events (booking_id, supplier_id, event_type, details)
  values (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '22222222-2222-2222-2222-222222222222',
    'note',
    'PRE-FIX planted event on a competitor''s booking'
  );
  raise notice 'GAP CONFIRMED: pre-fix policy let supplier B plant an event on supplier A''s booking';
exception
  when others then
    raise exception 'TEST SETUP INVALID: pre-fix insert was unexpectedly blocked (%) -- hypothesis not reproduced against current code', sqlerrm;
end
$$;
rollback;

-- ============================================================
-- Apply the real migration 109 fix.
-- ============================================================
\ir ../migrations/109_supplier_booking_events_ownership_guard.sql

-- ============================================================
-- POST-FIX: the identical cross-tenant insert attempt is rejected.
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.supplier_booking_events (booking_id, supplier_id, event_type, details)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '22222222-2222-2222-2222-222222222222',
      'note',
      'POST-FIX attempt'
    );
    raise exception 'REGRESSION: post-fix policy still let supplier B plant an event on supplier A''s booking';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'post-fix cross-tenant insert correctly blocked: %', sqlerrm;
  end;
end
$$;
rollback;

-- ============================================================
-- POST-FIX: supplier B's own booking still works for insert + select.
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

insert into public.supplier_booking_events (booking_id, supplier_id, event_type, details)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '22222222-2222-2222-2222-222222222222',
  'acknowledged',
  'GENUINE-OK event'
);

do $$
begin
  if not exists (
    select 1 from public.supplier_booking_events
    where booking_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
      and details = 'GENUINE-OK event'
  ) then
    raise exception 'REGRESSION: a genuine same-supplier event insert was wrongly rejected';
  end if;
  raise notice 'genuine same-supplier insert correctly succeeded';
end
$$;
rollback;

-- ============================================================
-- MUTATION TEST: revert the fix and confirm the gap reopens.
-- ============================================================
drop policy "Suppliers can write own booking events" on public.supplier_booking_events;
create policy "Suppliers can write own booking events"
  on public.supplier_booking_events
  for insert
  with check (supplier_id = auth.uid());

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.supplier_booking_events (booking_id, supplier_id, event_type, details)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '22222222-2222-2222-2222-222222222222',
      'note',
      'MUTATION-REOPENED'
    );
    raise notice 'MUTATION CHECK OK: with the guard removed, the gap reopens as expected -- the test suite is exercising the real guard.';
  exception when others then
    raise exception 'MUTATION CHECK FAILED: gap did not reopen after removing the fix (%). Test is not actually exercising the guard.', sqlerrm;
  end;
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (109)' as result;
