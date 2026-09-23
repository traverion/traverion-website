-- Regression test for migration 085 (bookings cancellation-truth guard).
--
-- Run manually against a scratch Postgres 16 database (no Deno/pgTAP/local
-- Supabase test infra exists in this repo):
--   sudo -u postgres createdb traverion_test_085
--   sudo -u postgres psql -d traverion_test_085 -f supabase/tests/bookings_cancellation_truth_guard.test.sql
--
-- Builds a minimal schema for bookings/listings/cancellation_requests/
-- supplier_ledger_entries/booking_messages, stubs auth.uid()/auth.role()/
-- auth.jwt(), includes the REAL migration 085 file (so this always tests
-- currently-committed code, not a paraphrase of it), switches to a
-- non-superuser test_actor role (current_user = 'postgres' would otherwise
-- trip an unrelated bypass in a different trigger elsewhere in this schema
-- and is worth avoiding here too, for consistency with every other test in
-- this suite), and runs both legitimate and adversarial scenarios.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- Stubs: auth.uid() / auth.role() / auth.jwt(), configurable per-session
-- via GUCs so each scenario can impersonate a different actor.
-- ---------------------------------------------------------------------
create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated');
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object('email', coalesce(nullif(current_setting('test.email', true), ''), ''));
$$;

-- ---------------------------------------------------------------------
-- Minimal schema
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id),
  guest_user_id uuid,
  guest_email text,
  payment_status text,
  amount_paid numeric,
  checkout_session_id text,
  payment_intent_id text,
  paid_at timestamptz,
  total_amount numeric,
  currency text,
  purchase_snapshot jsonb,
  guest_breakdown jsonb,
  booking_number text,
  booking_date date,
  check_out date,
  nights integer,
  nightly_amount numeric,
  cleaning_fee numeric,
  booking_option_id uuid,
  guests integer,
  start_time time,
  status text default 'confirmed',
  cancelled_at timestamptz,
  cancellation_reason text,
  refund_choice text
);

create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id),
  status text not null default 'requested',
  reason_code text,
  applied_fee numeric not null default 0,
  fee_currency text,
  policy_snapshot jsonb,
  responded_at timestamptz,
  responded_by uuid
);

create table public.supplier_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid,
  booking_id uuid,
  kind text not null,
  amount numeric not null,
  currency text,
  reason text,
  source_id text,
  policy_id text,
  unique (kind, source_id)
);

create table public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid,
  sender_role text,
  sender_user_id uuid,
  body text,
  created_at timestamptz default now()
);

-- Pre-085 baseline: the real, currently-committed 078 function body, so the
-- trigger below has something to attach to before 085's CREATE OR REPLACE
-- (further down) supersedes it with the new guard.
\ir ../migrations/078_protect_paid_booking_commercial_truth.sql

-- Attach the existing trigger (this is what 085's CREATE OR REPLACE targets).
create trigger tr_bookings_protect_payment_fields
  before update on public.bookings
  for each row execute function public.bookings_protect_payment_fields();

-- ---------------------------------------------------------------------
-- Apply the real migration under test.
-- ---------------------------------------------------------------------
\ir ../migrations/085_bookings_cancellation_truth_server_side.sql

-- ---------------------------------------------------------------------
-- Non-superuser actor, so triggers see a genuine authenticated-equivalent
-- caller rather than a postgres-role bypass.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end
$$;

grant usage on schema public, auth to test_actor;
grant all on all tables in schema public to test_actor;
grant execute on all functions in schema public to test_actor;
grant execute on all functions in schema auth to test_actor;

-- ============================================================================
-- Case 1: raw client update tries to cancel a PAID booking directly
-- (exactly what src/data/supabase-bookings.ts's updateBookingStatus /
-- batchCancelBookings send) with no cancellation_requests row and no
-- traveler consent. Must be rejected: status/cancelled_at/refund_choice
-- must stay unchanged.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_traveler uuid := gen_random_uuid();
  v_booking uuid;
  v_status text;
  v_cancelled_at timestamptz;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (
    id, listing_id, guest_user_id, payment_status, status, currency, total_amount
  ) values (
    gen_random_uuid(), v_listing, v_traveler, 'paid', 'confirmed', 'EUR', 100
  ) returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false); -- supplier acting via updateBookingStatus

  update public.bookings
    set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'unpaid_release', refund_choice = 'no_refund'
    where id = v_booking;

  reset session authorization;

  select status, cancelled_at into v_status, v_cancelled_at from public.bookings where id = v_booking;
  if v_status = 'cancelled' or v_cancelled_at is not null then
    raise exception 'Case 1 FAILED: raw client cancel of a paid booking was not blocked (status=%, cancelled_at=%)', v_status, v_cancelled_at;
  end if;
  raise notice 'Case 1 passed: raw client cancel of a paid booking blocked (status=%)', v_status;
end
$$;

-- ============================================================================
-- Case 2: raw client tries to rewrite refund_choice/cancellation_reason on an
-- ALREADY (properly) cancelled paid booking. Must also be blocked.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_traveler uuid := gen_random_uuid();
  v_booking uuid;
  v_refund_choice text;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (
    id, listing_id, guest_user_id, payment_status, status, cancelled_at, refund_choice, currency, total_amount
  ) values (
    gen_random_uuid(), v_listing, v_traveler, 'paid', 'cancelled', now(), 'no_refund', 'EUR', 100
  ) returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false); -- traveler trying to upgrade their own no_refund to full_refund

  update public.bookings set refund_choice = 'full_refund' where id = v_booking;

  reset session authorization;

  select refund_choice into v_refund_choice from public.bookings where id = v_booking;
  if v_refund_choice <> 'no_refund' then
    raise exception 'Case 2 FAILED: raw client rewrote refund_choice on an already-cancelled paid booking (now %)', v_refund_choice;
  end if;
  raise notice 'Case 2 passed: refund_choice on an already-cancelled paid booking stayed frozen';
end
$$;

-- ============================================================================
-- Case 3: raw client cancel of an UNPAID booking must still work unchanged
-- -- this is the legitimate "release an unpaid hold" feature and must not
-- regress.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_traveler uuid := gen_random_uuid();
  v_booking uuid;
  v_status text;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (
    id, listing_id, guest_user_id, payment_status, status, currency, total_amount
  ) values (
    gen_random_uuid(), v_listing, v_traveler, null, 'confirmed', 'EUR', 100
  ) returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  update public.bookings
    set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'unpaid_release', refund_choice = 'no_refund'
    where id = v_booking;

  reset session authorization;

  select status into v_status from public.bookings where id = v_booking;
  if v_status <> 'cancelled' then
    raise exception 'Case 3 FAILED: legitimate unpaid-hold release was blocked (status=%)', v_status;
  end if;
  raise notice 'Case 3 passed: unpaid-hold release still works unchanged';
end
$$;

-- ============================================================================
-- Case 4: cancel_booking_as_traveler still works end-to-end on a PAID
-- booking (bypass flag lets its own internal update through the new guard).
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_traveler uuid := gen_random_uuid();
  v_booking uuid;
  v_result jsonb;
  v_status text;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (
    id, listing_id, guest_user_id, payment_status, status, currency, total_amount,
    booking_date, start_time
  ) values (
    gen_random_uuid(), v_listing, v_traveler, 'paid', 'confirmed', 'EUR', 100,
    (current_date + interval '10 days')::date, '10:00'
  ) returning id into v_booking;

  insert into public.supplier_ledger_entries (supplier_id, booking_id, kind, amount, currency, source_id)
  values (v_supplier, v_booking, 'booking_earnings', 90, 'EUR', v_booking::text || ':earnings');

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);

  select public.cancel_booking_as_traveler(v_booking, 'full_refund') into v_result;

  reset session authorization;

  select status into v_status from public.bookings where id = v_booking;
  if v_status <> 'cancelled' then
    raise exception 'Case 4 FAILED: cancel_booking_as_traveler could not cancel a paid booking through the new guard (status=%, result=%)', v_status, v_result;
  end if;
  if not exists (
    select 1 from public.supplier_ledger_entries
    where booking_id = v_booking and kind = 'refund'
  ) then
    raise exception 'Case 4 FAILED: cancel_booking_as_traveler did not post the earnings-reversal ledger entry';
  end if;
  raise notice 'Case 4 passed: cancel_booking_as_traveler still cancels paid bookings end-to-end (result=%)', v_result;
end
$$;

-- ============================================================================
-- Case 5: respond_cancellation_request still works end-to-end on a PAID
-- booking, including its ledger entries (fee + earnings reversal).
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_traveler uuid := gen_random_uuid();
  v_booking uuid;
  v_request uuid;
  v_result jsonb;
  v_status text;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (
    id, listing_id, guest_user_id, payment_status, status, currency, total_amount
  ) values (
    gen_random_uuid(), v_listing, v_traveler, 'paid', 'confirmed', 'GBP', 200
  ) returning id into v_booking;

  insert into public.supplier_ledger_entries (supplier_id, booking_id, kind, amount, currency, source_id)
  values (v_supplier, v_booking, 'booking_earnings', 180, 'GBP', v_booking::text || ':earnings');

  insert into public.cancellation_requests (id, booking_id, status, reason_code, applied_fee, fee_currency, policy_snapshot)
  values (gen_random_uuid(), v_booking, 'requested', 'supplier_unavailable', 20, 'GBP', '{}'::jsonb)
  returning id into v_request;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);

  select public.respond_cancellation_request(v_request, true) into v_result;

  reset session authorization;

  select status into v_status from public.bookings where id = v_booking;
  if v_status <> 'cancelled' then
    raise exception 'Case 5 FAILED: respond_cancellation_request could not cancel a paid booking through the new guard (status=%, result=%)', v_status, v_result;
  end if;
  if not exists (
    select 1 from public.supplier_ledger_entries where booking_id = v_booking and kind = 'cancellation_penalty'
  ) then
    raise exception 'Case 5 FAILED: respond_cancellation_request did not post the cancellation-fee ledger entry';
  end if;
  if not exists (
    select 1 from public.supplier_ledger_entries where booking_id = v_booking and kind = 'refund'
  ) then
    raise exception 'Case 5 FAILED: respond_cancellation_request did not post the earnings-reversal ledger entry';
  end if;
  raise notice 'Case 5 passed: respond_cancellation_request still cancels paid bookings end-to-end with correct ledger entries (result=%)', v_result;
end
$$;

-- ============================================================================
-- Case 6: service_role writes remain unaffected by the new guard (matches
-- the pre-existing service_role bypass in bookings_protect_payment_fields).
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_traveler uuid := gen_random_uuid();
  v_booking uuid;
  v_status text;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (
    id, listing_id, guest_user_id, payment_status, status, currency, total_amount
  ) values (
    gen_random_uuid(), v_listing, v_traveler, 'paid', 'confirmed', 'EUR', 100
  ) returning id into v_booking;

  perform set_config('test.role', 'service_role', false);

  update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_booking;

  select status into v_status from public.bookings where id = v_booking;
  if v_status <> 'cancelled' then
    raise exception 'Case 6 FAILED: service_role write was unexpectedly blocked';
  end if;
  raise notice 'Case 6 passed: service_role writes remain unaffected';
end
$$;

-- ============================================================================
-- Case 7: pre-existing 078 payment-field protection is unaffected by 085's
-- changes (regression check).
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_traveler uuid := gen_random_uuid();
  v_booking uuid;
  v_amount_paid numeric;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (
    id, listing_id, guest_user_id, payment_status, status, currency, total_amount, amount_paid
  ) values (
    gen_random_uuid(), v_listing, v_traveler, 'paid', 'confirmed', 'EUR', 100, 100
  ) returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);

  update public.bookings set amount_paid = 1 where id = v_booking;

  reset session authorization;

  select amount_paid into v_amount_paid from public.bookings where id = v_booking;
  if v_amount_paid <> 100 then
    raise exception 'Case 7 FAILED: 078 payment-field protection regressed (amount_paid=%)', v_amount_paid;
  end if;
  raise notice 'Case 7 passed: pre-existing 078 payment-field protection unaffected';
end
$$;

do $$
begin
  raise notice 'ALL ASSERTIONS PASSED';
end
$$;
