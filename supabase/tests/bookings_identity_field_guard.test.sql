-- Regression test for migration 087 (freeze booking identity/schedule
-- fields against direct client UPDATE at any payment status).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_087
--   sudo -u postgres psql -d traverion_test_087 -f supabase/tests/bookings_identity_field_guard.test.sql
--
-- Builds a minimal schema, stubs auth.uid()/auth.role()/auth.jwt(),
-- includes the REAL migration 037 (guest_user_id column + the two
-- ownership-only UPDATE policies this bug lives behind) and 085 (today's
-- committed trigger baseline -- the gap this phase closes) via \ir, then
-- 087 (this phase's fix). Proves:
--   (a) against 085 alone, an authenticated traveler can PATCH
--       hold_expires_at/booking_date/booking_option_id/guests on their
--       OWN unpaid booking -- a free, repeatable, effectively permanent
--       calendar-poisoning path even after migration 086 closed the same
--       class of bug on INSERT;
--   (b) after 087, the identical update is rejected (frozen back to OLD,
--       not merely erroring -- matches this trigger's established
--       silent-revert pattern for every other protected column);
--   (c) the legitimate "release an unpaid hold" status update
--       (updateBookingStatus's actual payload shape) still works;
--   (d) the legitimate start_time/pickup_time schedule update
--       (updateBookingSchedule's actual payload shape) still works;
--   (e) the real service-role resume-checkout sync path (guests/
--       booking_date/hold_expires_at) is completely unaffected;
--   (f) migration 085's own paid-booking cancellation-truth guard still
--       works after 087 -- confirms this phase didn't regress it.

\set ON_ERROR_STOP on

create schema if not exists auth;

create table auth.users (
  id uuid primary key
);

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

create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id),
  guest_email text,
  status text default 'pending',
  payment_status text default 'pending',
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
  hold_expires_at timestamptz,
  start_time time,
  pickup_time time,
  guest_name text,
  special_requests text,
  cancelled_at timestamptz,
  cancellation_reason text,
  refund_choice text
);

-- Needed only because 085's function body also defines
-- cancel_booking_as_traveler / respond_cancellation_request, which
-- reference these tables. Column shapes copied from the sibling
-- bookings_cancellation_truth_guard.test.sql so both tests describe the
-- same schema.
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

alter table public.listings enable row level security;
alter table public.bookings enable row level security;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end
$$;

grant usage on schema public, auth to authenticated, anon, service_role, test_actor;
grant all on all tables in schema public to authenticated, anon, service_role, test_actor;
grant execute on all functions in schema auth to authenticated, anon, service_role, test_actor;
grant authenticated to test_actor;

-- ---------------------------------------------------------------------
-- Real, currently-committed RLS: the two ownership-only UPDATE policies
-- this bug lives behind (037), plus the supplier-side one (003) for
-- completeness even though this test doesn't exercise the supplier path.
-- ---------------------------------------------------------------------
\ir ../migrations/037_bookings_guest_user_id_consumer_rls.sql

-- ---------------------------------------------------------------------
-- Pre-085 baseline (078): defines the trigger function body 085's own
-- CREATE OR REPLACE targets, and gives the trigger something to attach
-- to -- matches the sibling bookings_cancellation_truth_guard.test.sql's
-- own approach exactly, rather than reconstructing 078's body by hand.
-- ---------------------------------------------------------------------
\ir ../migrations/078_protect_paid_booking_commercial_truth.sql

create trigger tr_bookings_protect_payment_fields
  before update on public.bookings
  for each row execute function public.bookings_protect_payment_fields();

-- ---------------------------------------------------------------------
-- Apply the real, currently-committed baseline (085) -- the gap this
-- phase closes.
-- ---------------------------------------------------------------------
\ir ../migrations/085_bookings_cancellation_truth_server_side.sql

-- ============================================================================
-- Case 1 (pre-fix, proves the exploit is real against today's committed
-- code): an authenticated traveler PATCHes their own UNPAID booking's
-- hold_expires_at a year out, moves booking_date to a different date, and
-- bumps guests -- all fields that should only ever be server-derived.
-- ============================================================================
do $$
declare
  v_traveler uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_hold timestamptz;
  v_date date;
  v_guests integer;
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency,
     booking_date, guests, hold_expires_at)
  values
    (v_booking, v_listing, 'traveler@example.com', 'pending', 'pending', 20.00, 'EUR',
     '2027-01-01', 1, now() + interval '20 minutes');

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);
  perform set_config('test.email', 'traveler@example.com', false);

  update public.bookings
    set hold_expires_at = now() + interval '365 days',
        booking_date = '2027-06-15',
        guests = 50
    where id = v_booking;

  reset session authorization;

  select hold_expires_at, booking_date, guests into v_hold, v_date, v_guests
    from public.bookings where id = v_booking;

  if v_hold < now() + interval '300 days' or v_date <> date '2027-06-15' or v_guests <> 50 then
    raise exception 'Case 1 FAILED (unexpectedly): exploit update against 085-only baseline did not behave as expected (hold=%, date=%, guests=%)', v_hold, v_date, v_guests;
  end if;
  raise notice 'Case 1 confirmed: against 085 alone, an unpaid booking''s hold_expires_at/booking_date/guests were all freely rewritten by its own traveler (this is the bug 087 closes)';
end
$$;

-- ---------------------------------------------------------------------
-- Apply the real fix under test.
-- ---------------------------------------------------------------------
\ir ../migrations/087_freeze_booking_identity_fields.sql

-- ============================================================================
-- Case 2: the identical tampering attempt is now silently reverted
-- (matching this trigger's established pattern for every other protected
-- column -- NEW is overwritten back to OLD, not a hard error).
-- ============================================================================
do $$
declare
  v_traveler uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_hold timestamptz;
  v_date date;
  v_guests integer;
  v_orig_hold timestamptz := now() + interval '20 minutes';
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency,
     booking_date, guests, hold_expires_at)
  values
    (v_booking, v_listing, 'traveler@example.com', 'pending', 'pending', 20.00, 'EUR',
     '2027-01-01', 1, v_orig_hold);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);
  perform set_config('test.email', 'traveler@example.com', false);

  update public.bookings
    set hold_expires_at = now() + interval '365 days',
        booking_date = '2027-06-15',
        guests = 50
    where id = v_booking;

  reset session authorization;

  select hold_expires_at, booking_date, guests into v_hold, v_date, v_guests
    from public.bookings where id = v_booking;

  if v_hold > now() + interval '1 day' or v_date <> date '2027-01-01' or v_guests <> 1 then
    raise exception 'Case 2 FAILED: unpaid-booking tampering still succeeds after 087 (hold=%, date=%, guests=%)', v_hold, v_date, v_guests;
  end if;
  raise notice 'Case 2 passed: hold_expires_at/booking_date/guests tampering on an unpaid booking is rejected after 087';
end
$$;

-- ============================================================================
-- Case 3: the legitimate "release an unpaid hold" status update
-- (updateBookingStatus's real payload shape) still works after 087.
-- ============================================================================
do $$
declare
  v_traveler uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_status text;
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency, guests)
  values
    (v_booking, v_listing, 'traveler@example.com', 'pending', 'pending', 20.00, 'EUR', 1);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);
  perform set_config('test.email', 'traveler@example.com', false);

  update public.bookings
    set status = 'cancelled', cancelled_at = now()
    where id = v_booking;

  reset session authorization;

  select status into v_status from public.bookings where id = v_booking;
  if v_status <> 'cancelled' then
    raise exception 'Case 3 FAILED: releasing an unpaid hold (status update) no longer works after 087 (status=%)', v_status;
  end if;
  raise notice 'Case 3 passed: the legitimate unpaid-hold-release status update still works after 087';
end
$$;

-- ============================================================================
-- Case 4: the legitimate start_time/pickup_time schedule update
-- (updateBookingSchedule's real payload shape) still works after 087.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_booking uuid := gen_random_uuid();
  v_start time;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency, guests)
  values
    (v_booking, v_listing, 'traveler@example.com', 'confirmed', 'paid', 20.00, 'EUR', 1);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  update public.bookings set start_time = '09:30' where id = v_booking;

  reset session authorization;

  select start_time into v_start from public.bookings where id = v_booking;
  if v_start is distinct from time '09:30' then
    raise exception 'Case 4 FAILED: the legitimate start_time schedule update no longer works after 087 (start_time=%)', v_start;
  end if;
  raise notice 'Case 4 passed: the legitimate start_time/pickup_time schedule update still works after 087';
end
$$;

-- ============================================================================
-- Case 5: the real service-role resume-checkout sync path (guests/
-- booking_date/hold_expires_at) is completely unaffected by 087.
-- ============================================================================
do $$
declare
  v_listing uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_guests integer;
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency,
     booking_date, guests, hold_expires_at)
  values
    (v_booking, v_listing, 'traveler@example.com', 'pending', 'pending', 20.00, 'EUR',
     '2027-01-01', 1, now() + interval '20 minutes');

  -- Simulates the real edge function's service-role client: explicitly
  -- clear any actor impersonation left over from earlier cases so
  -- auth.role() reports the service-role/empty-role bypass this trigger
  -- actually checks for, matching a genuine service-role connection.
  perform set_config('test.role', 'service_role', false);
  perform set_config('test.uid', '', false);

  update public.bookings
    set guests = 2, booking_date = '2027-01-02', hold_expires_at = now() + interval '25 minutes'
    where id = v_booking;

  perform set_config('test.role', 'authenticated', false);

  select guests into v_guests from public.bookings where id = v_booking;
  if v_guests <> 2 then
    raise exception 'Case 5 FAILED: the service-role resume-checkout sync path was unexpectedly blocked after 087';
  end if;
  raise notice 'Case 5 passed: the real service-role resume-checkout sync path is unaffected by 087';
end
$$;

-- ============================================================================
-- Case 6: migration 085's own paid-booking cancellation-truth guard still
-- works after 087 (no regression on the fix from two phases ago).
-- ============================================================================
do $$
declare
  v_traveler uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_status text;
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency, guests)
  values
    (v_booking, v_listing, 'traveler@example.com', 'confirmed', 'paid', 100.00, 'EUR', 2);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);
  perform set_config('test.email', 'traveler@example.com', false);

  update public.bookings
    set status = 'cancelled', cancelled_at = now(), refund_choice = 'full_refund'
    where id = v_booking;

  reset session authorization;

  select status into v_status from public.bookings where id = v_booking;
  if v_status = 'cancelled' then
    raise exception 'Case 6 FAILED: migration 085''s paid-booking cancellation-truth guard regressed after 087 (status=%)', v_status;
  end if;
  raise notice 'Case 6 passed: migration 085''s paid-booking cancellation-truth guard is unaffected by 087 (status=%)', v_status;
end
$$;

do $$
begin
  raise notice 'All migration-087 regression cases passed.';
end
$$;
