-- Regression test for migration 086 (close client-authenticated direct
-- INSERT into public.bookings).
--
-- Run manually against a scratch Postgres 16 database (no Deno/pgTAP/local
-- Supabase test infra exists in this repo):
--   sudo -u postgres createdb traverion_test_086
--   sudo -u postgres psql -d traverion_test_086 -f supabase/tests/bookings_client_insert_guard.test.sql
--
-- Builds a minimal schema, stubs auth.uid()/auth.role(), includes the REAL
-- migration 051 file (today's committed baseline -- the policy this phase
-- closes) and then the REAL migration 086 file (this phase's fix), so this
-- always tests currently-committed code, not a paraphrase of it. Proves:
--   (a) against 051 alone, an ordinary authenticated traveler can insert a
--       fabricated status='confirmed' booking, with a made-up
--       total_amount/currency/guests and hold_expires_at a year in the
--       future -- a free, repeatable, permanent block on a listing's
--       public availability calendar;
--   (b) after 086, the identical insert is rejected;
--   (c) after 086, the service-role path (what
--       create-booking-checkout-session actually uses) is completely
--       unaffected.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- Stubs: auth.uid() / auth.role(), configurable per-session via GUCs.
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

-- ---------------------------------------------------------------------
-- Minimal schema. Migration 051 also touches listing_availability and
-- supplier_profiles, so both exist here (empty, unused by this test) so
-- \ir can include the real file unmodified.
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null
);

create table public.listing_availability (
  listing_id uuid not null,
  available_date date not null,
  capacity integer,
  booked integer
);

create table public.supplier_profiles (
  id uuid primary key,
  display_name text,
  company_legal_name text,
  business_address text,
  business_logo_url text,
  privacy_policy_text text,
  terms_conditions_text text
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id),
  guest_user_id uuid,
  guest_email text,
  status text not null default 'pending',
  payment_status text default 'pending',
  amount_paid numeric(12,2) default 0,
  total_amount numeric(12,2),
  currency text default 'EUR',
  hold_expires_at timestamptz,
  guests integer,
  booking_date date,
  check_out date,
  checkout_session_id text,
  payment_intent_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.listings enable row level security;
alter table public.listing_availability enable row level security;
alter table public.supplier_profiles enable row level security;
alter table public.bookings enable row level security;

grant select, insert, update, delete on public.bookings, public.listings, public.listing_availability, public.supplier_profiles
  to authenticated, anon, service_role;

-- Real production SELECT policy (037, still live, never dropped) so a
-- RETURNING clause on the exploit insert behaves exactly as it would for a
-- real client using supabase-js's default `.insert().select()`.
create policy "Consumers can view own bookings by user id"
  on public.bookings for select
  using (auth.uid() is not null and guest_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Apply the real, currently-committed baseline (051) -- the policy this
-- phase closes.
-- ---------------------------------------------------------------------
\ir ../migrations/051_checkout_concurrency_and_payment_guard.sql

-- ---------------------------------------------------------------------
-- Non-superuser actor, so RLS is genuinely enforced rather than bypassed
-- by a postgres-role superuser shortcut.
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
grant authenticated to test_actor;

-- ============================================================================
-- Case 1 (pre-fix, proves the exploit is real against today's committed
-- code): an ordinary authenticated traveler inserts a fabricated
-- "confirmed" booking on someone else's listing with a made-up
-- total_amount and a year-long hold_expires_at. Must succeed against 051
-- alone -- if it doesn't, this test isn't proving anything.
-- ============================================================================
do $$
declare
  v_attacker uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_booking uuid;
  v_status text;
  v_hold timestamptz;
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_attacker::text, false);

  insert into public.bookings
    (listing_id, guest_user_id, guest_email, status, payment_status, amount_paid,
     total_amount, currency, hold_expires_at, guests, booking_date)
  values
    (v_listing, v_attacker, 'attacker@example.com', 'confirmed', 'pending', 0,
     999999.00, 'EUR', now() + interval '365 days', 50, '2027-06-01')
  returning id into v_booking;

  reset session authorization;

  select status, hold_expires_at into v_status, v_hold from public.bookings where id = v_booking;
  if v_status is distinct from 'confirmed' or v_hold is null then
    raise exception 'Case 1 FAILED (unexpectedly): exploit insert against 051-only baseline did not behave as expected (status=%, hold=%)', v_status, v_hold;
  end if;
  raise notice 'Case 1 confirmed: against 051 alone, a fabricated confirmed booking with a 365-day hold was inserted successfully (this is the bug 086 closes)';

  delete from public.bookings where id = v_booking;
end
$$;

-- ---------------------------------------------------------------------
-- Apply the real fix under test.
-- ---------------------------------------------------------------------
\ir ../migrations/086_close_client_bookings_insert.sql

-- ============================================================================
-- Case 2: the identical exploit attempt must now be rejected.
-- ============================================================================
do $$
declare
  v_attacker uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_failed boolean := false;
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_attacker::text, false);

  begin
    insert into public.bookings
      (listing_id, guest_user_id, guest_email, status, payment_status, amount_paid,
       total_amount, currency, hold_expires_at, guests, booking_date)
    values
      (v_listing, v_attacker, 'attacker@example.com', 'confirmed', 'pending', 0,
       999999.00, 'EUR', now() + interval '365 days', 50, '2027-06-01');
  exception when insufficient_privilege then
    v_failed := true;
  end;

  reset session authorization;

  if not v_failed then
    raise exception 'Case 2 FAILED: the fabricated-booking exploit insert succeeded even after migration 086';
  end if;
  raise notice 'Case 2 passed: the exploit insert is rejected after 086';
end
$$;

-- ============================================================================
-- Case 3: even a minimal, entirely benign-shaped authenticated insert
-- (matching src/data/supabase-bookings.ts's submitBooking(), which is
-- unreachable from the live UI but exists in the codebase) is rejected too
-- -- 086 removes the policy outright rather than partially patching it, so
-- there is no authenticated-role INSERT path left at all.
-- ============================================================================
do $$
declare
  v_traveler uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_failed boolean := false;
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);

  begin
    insert into public.bookings (listing_id, guest_user_id) values (v_listing, v_traveler);
  exception when insufficient_privilege then
    v_failed := true;
  end;

  reset session authorization;

  if not v_failed then
    raise exception 'Case 3 FAILED: a minimal benign-shaped authenticated insert still succeeded after 086';
  end if;
  raise notice 'Case 3 passed: no authenticated-role INSERT path remains on bookings';
end
$$;

-- ============================================================================
-- Case 4: the real, live product path is unaffected -- a service-role
-- (RLS-bypassing) insert, exactly what create-booking-checkout-session
-- does, still works after 086.
-- ============================================================================
do $$
declare
  v_traveler uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_booking uuid;
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());

  insert into public.bookings (listing_id, guest_user_id, status, payment_status, total_amount, currency)
  values (v_listing, v_traveler, 'pending', 'pending', 42.50, 'EUR')
  returning id into v_booking;

  if v_booking is null then
    raise exception 'Case 4 FAILED: the service-role-equivalent insert path (real product flow) was unexpectedly blocked';
  end if;
  raise notice 'Case 4 passed: service-role insert path (the real booking flow) still works after 086';
end
$$;

do $$
begin
  raise notice 'All migration-086 regression cases passed.';
end
$$;
