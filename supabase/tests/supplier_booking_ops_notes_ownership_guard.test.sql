-- Phase 1017: adversarial regression coverage for migration 108
-- (supplier_booking_ops_notes cross-supplier ownership guard).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_108
--   sudo -u postgres psql -d traverion_test_108 -f supabase/tests/supplier_booking_ops_notes_ownership_guard.test.sql
--
-- Builds a minimal schema covering the real tables the affected policies
-- reference (auth.users, public.listings, public.bookings), then installs
-- the CURRENT, real, committed migration 015 body verbatim (transcribed as
-- read on 2026-09-27), proves GAP CONFIRMED against it, applies the real
-- migration 108 fix, proves the same attempt is rejected, proves a
-- genuine same-supplier note insert/update/read/delete still works, and
-- mutation-tests the fix by reverting it and confirming the gap reopens.

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
-- CURRENT pre-108 migration 015 body, verbatim.
-- ============================================================
create table public.supplier_booking_ops_notes (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  supplier_id uuid not null references auth.users(id) on delete cascade,
  note text not null,
  updated_at timestamptz not null default now()
);

alter table public.supplier_booking_ops_notes enable row level security;

create policy "Suppliers can read own booking notes"
  on public.supplier_booking_ops_notes
  for select
  using (supplier_id = auth.uid());

create policy "Suppliers can upsert own booking notes"
  on public.supplier_booking_ops_notes
  for insert
  with check (supplier_id = auth.uid());

create policy "Suppliers can update own booking notes"
  on public.supplier_booking_ops_notes
  for update
  using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

create policy "Suppliers can delete own booking notes"
  on public.supplier_booking_ops_notes
  for delete
  using (supplier_id = auth.uid());

grant select, insert, update, delete on public.supplier_booking_ops_notes to test_actor;

-- ============================================================
-- Seed data.
-- Supplier A: victim, owns listing L_A and a real booking on it.
-- Supplier B: attacker, owns their own listing/booking too.
-- ============================================================
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'supplier-b@example.com');

insert into public.listings (id, supplier_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'), -- A's listing
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222'); -- B's own listing

insert into public.bookings (id, listing_id, guest_user_id, guest_email) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'traveler@example.com'), -- A's real booking
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc', null, 'other-traveler@example.com'); -- B's own real booking

-- ============================================================
-- GAP CONFIRMED (pre-fix): supplier B inserts an ops note with
-- supplier_id = B (passes the only check) but booking_id pointing at
-- supplier A's real booking.
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  insert into public.supplier_booking_ops_notes (booking_id, supplier_id, note)
  values (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', -- A's booking
    '22222222-2222-2222-2222-222222222222', -- B's own uid
    'PRE-FIX planted note on a competitor''s booking'
  );
  raise notice 'GAP CONFIRMED: pre-fix policy let supplier B plant an ops note on supplier A''s booking';
exception
  when others then
    raise exception 'TEST SETUP INVALID: pre-fix insert was unexpectedly blocked (%) -- hypothesis not reproduced against current code', sqlerrm;
end
$$;
rollback;

-- ============================================================
-- Apply the real migration 108 fix.
-- ============================================================
\ir 108_supplier_booking_ops_notes_ownership_guard.sql

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
    insert into public.supplier_booking_ops_notes (booking_id, supplier_id, note)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '22222222-2222-2222-2222-222222222222',
      'POST-FIX attempt'
    );
    raise exception 'REGRESSION: post-fix policy still let supplier B plant a note on supplier A''s booking';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'post-fix cross-tenant insert correctly blocked: %', sqlerrm;
  end;
end
$$;
rollback;

-- ============================================================
-- POST-FIX regression check: supplier B's own booking still works for
-- insert, update, select, and delete.
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

insert into public.supplier_booking_ops_notes (booking_id, supplier_id, note)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd', -- B's own booking
  '22222222-2222-2222-2222-222222222222', -- B's own uid
  'GENUINE-OK first note'
);

do $$
begin
  if not exists (
    select 1 from public.supplier_booking_ops_notes
    where booking_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' and note = 'GENUINE-OK first note'
  ) then
    raise exception 'REGRESSION: a genuine same-supplier note insert was wrongly rejected';
  end if;
  raise notice 'genuine same-supplier insert correctly succeeded';
end
$$;

-- Genuine owner can still update the note text on their own existing row
-- without needing to resupply a passing booking.
update public.supplier_booking_ops_notes
  set note = 'GENUINE-OK updated note'
  where booking_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

do $$
begin
  if not exists (
    select 1 from public.supplier_booking_ops_notes
    where booking_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' and note = 'GENUINE-OK updated note'
  ) then
    raise exception 'REGRESSION: a genuine same-supplier note update was wrongly rejected';
  end if;
  raise notice 'genuine same-supplier update correctly succeeded';
end
$$;

-- Genuine owner can still read and delete their own row.
do $$
begin
  if not exists (
    select 1 from public.supplier_booking_ops_notes
    where booking_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  ) then
    raise exception 'REGRESSION: a genuine same-supplier note select was wrongly empty';
  end if;
end
$$;

delete from public.supplier_booking_ops_notes
  where booking_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

do $$
begin
  if exists (
    select 1 from public.supplier_booking_ops_notes
    where booking_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  ) then
    raise exception 'REGRESSION: a genuine same-supplier note delete was wrongly rejected';
  end if;
  raise notice 'genuine same-supplier delete correctly succeeded';
end
$$;
rollback;

-- ============================================================
-- MUTATION TEST: revert the fix (restore the original bodyless policy)
-- and confirm the cross-tenant insert case correctly reopens, proving
-- this test suite actually exercises the fixed code path.
-- ============================================================
drop policy "Suppliers can upsert own booking notes" on public.supplier_booking_ops_notes;
create policy "Suppliers can upsert own booking notes"
  on public.supplier_booking_ops_notes
  for insert
  with check (supplier_id = auth.uid());

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.supplier_booking_ops_notes (booking_id, supplier_id, note)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '22222222-2222-2222-2222-222222222222',
      'MUTATION-REOPENED'
    );
    raise notice 'MUTATION CHECK OK: with the guard removed, the gap reopens as expected -- the test suite is exercising the real guard.';
  exception when others then
    raise exception 'MUTATION CHECK FAILED: gap did not reopen after removing the fix (%). Test is not actually exercising the guard.', sqlerrm;
  end;
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (108)' as result;
