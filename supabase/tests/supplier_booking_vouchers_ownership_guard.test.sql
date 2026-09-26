-- Phase 595: adversarial regression coverage for migration 099
-- (supplier_booking_vouchers cross-supplier ownership guard).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_099
--   sudo -u postgres psql -d traverion_test_099 -f supabase/tests/supplier_booking_vouchers_ownership_guard.test.sql
--
-- Builds a minimal schema covering the real tables the affected policies
-- reference (auth.users, public.listings, public.bookings), then installs
-- the CURRENT, real, committed migration 018 body verbatim (transcribed as
-- read on 2026-09-26), proves GAP CONFIRMED against it, applies the real
-- migration 099 fix, proves the same attempts are rejected, proves a
-- genuine same-supplier voucher (booking/listing that really is theirs)
-- still succeeds on insert and update, and mutation-tests the fix by
-- reverting it and confirming the case correctly reopens.

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
-- CURRENT pre-099 migration 018 body, verbatim.
-- ============================================================
create table public.supplier_booking_vouchers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  supplier_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  code text not null unique,
  guest_email text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired')),
  notes text,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supplier_booking_vouchers enable row level security;

create policy "Suppliers can read own vouchers"
  on public.supplier_booking_vouchers
  for select using (supplier_id = auth.uid());

create policy "Suppliers can write own vouchers"
  on public.supplier_booking_vouchers
  for insert with check (supplier_id = auth.uid());

create policy "Suppliers can update own vouchers"
  on public.supplier_booking_vouchers
  for update using (supplier_id = auth.uid())
  with check (supplier_id = auth.uid());

grant select, insert, update, delete on public.supplier_booking_vouchers to test_actor;

-- ============================================================
-- Seed data.
-- Supplier A: victim, owns listing L_A and a real booking on it.
-- Supplier B: attacker.
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
-- GAP CONFIRMED (pre-fix): supplier B inserts a voucher with
-- supplier_id = B (passes the only check) but booking_id/listing_id
-- pointing at supplier A's real booking/listing.
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  insert into public.supplier_booking_vouchers (
    booking_id, supplier_id, listing_id, code, discount_type, discount_value
  ) values (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', -- A's booking
    '22222222-2222-2222-2222-222222222222', -- B's own uid
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',  -- A's listing
    'PRE-FIX-CROSS-TENANT', 'percent', 100
  );
  raise notice 'GAP CONFIRMED: pre-fix policy let supplier B insert a voucher against supplier A''s booking/listing';
exception
  when others then
    raise exception 'TEST SETUP INVALID: pre-fix insert was unexpectedly blocked (%) -- hypothesis not reproduced against current code', sqlerrm;
end
$$;
rollback;

-- ============================================================
-- Apply the real migration 099 fix.
-- ============================================================
\ir 099_supplier_booking_vouchers_ownership_guard.sql

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
    insert into public.supplier_booking_vouchers (
      booking_id, supplier_id, listing_id, code, discount_type, discount_value
    ) values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '22222222-2222-2222-2222-222222222222',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'POST-FIX-CROSS-TENANT', 'percent', 100
    );
    raise exception 'REGRESSION: post-fix policy still let supplier B insert a cross-tenant voucher';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'post-fix insert correctly blocked: %', sqlerrm;
  end;
end
$$;
rollback;

-- ============================================================
-- POST-FIX regression check: supplier B inserting a voucher for a
-- booking/listing that genuinely IS theirs still works.
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

insert into public.supplier_booking_vouchers (
  booking_id, supplier_id, listing_id, code, discount_type, discount_value
) values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd', -- B's own booking
  '22222222-2222-2222-2222-222222222222', -- B's own uid
  'cccccccc-cccc-cccc-cccc-cccccccccccc', -- B's own listing
  'GENUINE-OK', 'percent', 20
);

do $$
begin
  if not exists (
    select 1 from public.supplier_booking_vouchers where code = 'GENUINE-OK'
  ) then
    raise exception 'REGRESSION: a genuine same-supplier voucher insert was wrongly rejected';
  end if;
  raise notice 'genuine same-supplier insert correctly succeeded';
end
$$;

-- And the genuine owner can still update their own voucher's status
-- without needing to resupply the booking/listing pair.
update public.supplier_booking_vouchers
  set status = 'redeemed'
  where code = 'GENUINE-OK';

do $$
begin
  if not exists (
    select 1 from public.supplier_booking_vouchers where code = 'GENUINE-OK' and status = 'redeemed'
  ) then
    raise exception 'REGRESSION: a genuine same-supplier status update was wrongly rejected';
  end if;
  raise notice 'genuine same-supplier update correctly succeeded';
end
$$;
rollback;

-- ============================================================
-- POST-FIX: supplier B cannot re-point an existing (genuinely their own)
-- voucher row's booking_id/listing_id at supplier A's booking/listing via
-- UPDATE either (the WITH CHECK gap mirrors the INSERT gap).
-- ============================================================
begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

insert into public.supplier_booking_vouchers (
  booking_id, supplier_id, listing_id, code, discount_type, discount_value
) values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '22222222-2222-2222-2222-222222222222',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'RETARGET-ATTEMPT', 'percent', 10
);

do $$
begin
  begin
    update public.supplier_booking_vouchers
      set booking_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          listing_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      where code = 'RETARGET-ATTEMPT';
    raise exception 'REGRESSION: post-fix UPDATE policy let supplier B re-point their voucher at supplier A''s booking/listing';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'post-fix retarget-by-update correctly blocked: %', sqlerrm;
  end;
end
$$;
rollback;

-- ============================================================
-- MUTATION TEST: revert the fix (restore the original bodyless policies)
-- and confirm the cross-tenant insert case correctly reopens, proving
-- this test suite actually exercises the fixed code path rather than
-- something else.
-- ============================================================
drop policy "Suppliers can write own vouchers" on public.supplier_booking_vouchers;
create policy "Suppliers can write own vouchers"
  on public.supplier_booking_vouchers
  for insert with check (supplier_id = auth.uid());

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
select set_config('test.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.supplier_booking_vouchers (
      booking_id, supplier_id, listing_id, code, discount_type, discount_value
    ) values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '22222222-2222-2222-2222-222222222222',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'MUTATION-REOPENED', 'percent', 100
    );
    raise notice 'MUTATION CHECK OK: with the guard removed, the gap reopens as expected -- the test suite is exercising the real guard.';
  exception when others then
    raise exception 'MUTATION CHECK FAILED: gap did not reopen after removing the fix (%). Test is not actually exercising the guard.', sqlerrm;
  end;
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (099)' as result;
