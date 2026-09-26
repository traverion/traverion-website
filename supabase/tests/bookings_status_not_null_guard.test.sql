-- Regression test for migration 100 (close public.bookings.status NULL
-- bypass -- the same bug class migration 092 already closed on
-- public.listings.status).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_100
--   sudo -u postgres psql -d traverion_test_100 -f supabase/tests/bookings_status_not_null_guard.test.sql
--
-- Builds a minimal schema, stubs auth.uid()/auth.role()/auth.jwt(),
-- includes the REAL migration 003 (bookings.status's original column
-- definition + the supplier ownership-only UPDATE policy that never
-- constrains the status value), 037 (consumer ownership-only UPDATE
-- policy, same shape), 078/085/087 (the real, currently-committed
-- bookings_protect_payment_fields() trigger baseline -- which only
-- freezes status/cancelled_at/cancellation_reason/refund_choice once
-- payment_status = 'paid', by design, per 085's own header) via \ir,
-- then 100 (this phase's fix) via \ir. Proves:
--   (a) against 003+037+078+085+087 (today's committed baseline), a
--       supplier can PATCH status = NULL on their own listing's UNPAID
--       booking, and a traveler can do the same on their own unpaid
--       booking -- the CHECK constraint
--       (status in ('pending','confirmed','cancelled')) never
--       restricted NULL, and the payment-fields trigger only guards
--       status once payment_status = 'paid';
--   (b) after 100, the identical UPDATE is rejected outright (a NOT NULL
--       violation, not a silent revert -- this column has no established
--       "revert to OLD" trigger behavior for unpaid bookings the way
--       087's frozen columns do, so a hard constraint is the correct,
--       structurally-honest fix here);
--   (c) the legitimate "release an unpaid hold" status update
--       (status = 'cancelled') still works for both actors after 100;
--   (d) the legitimate paid-booking cancellation path
--       (cancel_booking_as_traveler-style: real, non-null status values)
--       is completely unaffected;
--   (e) a service-role write setting status = NULL directly (which
--       should never happen from real app code, but must not be
--       silently permitted either) is also rejected by the same
--       column-level constraint -- defense-in-depth, not merely an RLS
--       gate that a compromised/misconfigured client role could route
--       around.

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
  guest_user_id uuid,
  guest_email text,
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  payment_status text not null default 'pending',
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

-- Needed only because 078/085's function bodies reference these tables
-- via the cancellation RPCs defined alongside the trigger.
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

-- Real, currently-committed listings SELECT policy: an owning supplier
-- can always read their own listing (true since the original migration
-- 001 policy and every version since, including 092) -- needed here only
-- so the (real, unmodified) EXISTS-against-listings clause inside the
-- bookings supplier UPDATE policy (003) can actually resolve, exactly as
-- it does in production.
create policy "listings readable by owner"
  on public.listings for select
  using (auth.uid() = supplier_id);

-- Real, currently-committed bookings SELECT policy (migration 001,
-- never dropped or replaced): the listing's owning supplier can read
-- (and, per Postgres RLS semantics for UPDATE -- which resolves target
-- row visibility through applicable SELECT policies as well as the
-- command's own USING clause -- update) bookings for their own listing.
create policy "Suppliers can view bookings for their listings"
  on public.bookings for select
  using (
    exists (
      select 1 from public.listings
      where listings.id = bookings.listing_id
      and listings.supplier_id = auth.uid()
    )
  );

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
-- Real, currently-committed RLS: the supplier ownership-only UPDATE
-- policy (003) that never constrains the status value.
-- ---------------------------------------------------------------------
\ir ../migrations/003_listing_status_and_booking_guest_name.sql

-- ---------------------------------------------------------------------
-- Real, currently-committed consumer ownership-only UPDATE policy (037),
-- same shape -- also never constrains the status value.
-- ---------------------------------------------------------------------
\ir ../migrations/037_bookings_guest_user_id_consumer_rls.sql

-- ---------------------------------------------------------------------
-- Real, currently-committed bookings_protect_payment_fields() trigger
-- baseline (078 -> 085 -> 087): only freezes status/cancelled_at/
-- cancellation_reason/refund_choice once payment_status = 'paid', by
-- design (085's header: "Unpaid bookings are unaffected -- the
-- legitimate 'release an unpaid hold' path").
-- ---------------------------------------------------------------------
\ir ../migrations/078_protect_paid_booking_commercial_truth.sql

create trigger tr_bookings_protect_payment_fields
  before update on public.bookings
  for each row execute function public.bookings_protect_payment_fields();

\ir ../migrations/085_bookings_cancellation_truth_server_side.sql
\ir ../migrations/087_freeze_booking_identity_fields.sql

-- ============================================================================
-- Case 1 (pre-fix, proves the exploit is real against today's committed
-- code): a supplier PATCHes status = NULL on their own listing's UNPAID
-- booking via the real "Suppliers can update booking status for their
-- listings" policy (003).
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_booking uuid := gen_random_uuid();
  v_status text;
  v_found boolean;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency, guests)
  values
    (v_booking, v_listing, 'traveler@example.com', 'pending', 'pending', 20.00, 'EUR', 1);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  update public.bookings set status = null where id = v_booking;

  reset session authorization;

  select status, true into v_status, v_found from public.bookings where id = v_booking;

  if v_status is not null then
    raise exception 'Case 1 FAILED (unexpectedly): status was not actually nulled (status=%)', v_status;
  end if;
  raise notice 'Case 1 confirmed: against today''s committed baseline (003+037+078+085+087), a supplier freely set their own unpaid booking''s status to NULL, bypassing the CHECK(status in (...)) constraint entirely (this is the bug migration 100 closes)';
end
$$;

-- ============================================================================
-- Case 1b: the identical exploit also works for the traveler-side
-- ownership-only policy (037), and for a raw service-role write (which
-- should never happen from real app code, but an RLS-only gate would not
-- have stopped it either).
-- ============================================================================
do $$
declare
  v_traveler uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_booking2 uuid := gen_random_uuid();
  v_status text;
  v_status2 text;
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());
  insert into public.bookings
    (id, listing_id, guest_user_id, guest_email, status, payment_status, total_amount, currency, guests)
  values
    (v_booking, v_listing, v_traveler, 'traveler@example.com', 'pending', 'pending', 20.00, 'EUR', 1);
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency, guests)
  values
    (v_booking2, v_listing, 'other@example.com', 'pending', 'pending', 20.00, 'EUR', 1);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);
  perform set_config('test.email', 'traveler@example.com', false);
  update public.bookings set status = null where id = v_booking;
  reset session authorization;

  perform set_config('test.role', 'service_role', false);
  perform set_config('test.uid', '', false);
  update public.bookings set status = null where id = v_booking2;
  perform set_config('test.role', 'authenticated', false);

  select status into v_status from public.bookings where id = v_booking;
  select status into v_status2 from public.bookings where id = v_booking2;

  if v_status is not null or v_status2 is not null then
    raise exception 'Case 1b FAILED (unexpectedly): expected both nulled (traveler status=%, service-role status=%)', v_status, v_status2;
  end if;
  raise notice 'Case 1b confirmed: the same NULL bypass works via the traveler-side ownership policy (037) and via any raw write with no explicit status -- an RLS-only fix would not be defense-in-depth; a column-level constraint is required';
end
$$;

-- ---------------------------------------------------------------------
-- Apply the real fix under test.
-- ---------------------------------------------------------------------
\ir ../migrations/100_bookings_status_not_null_close_null_bypass.sql

-- ============================================================================
-- Case 2: the identical supplier NULL-status tampering is now rejected
-- outright (NOT NULL violation), not silently accepted.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_booking uuid := gen_random_uuid();
  v_rejected boolean := false;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency, guests)
  values
    (v_booking, v_listing, 'traveler@example.com', 'pending', 'pending', 20.00, 'EUR', 1);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  begin
    update public.bookings set status = null where id = v_booking;
  exception when not_null_violation then
    v_rejected := true;
  end;

  reset session authorization;

  if not v_rejected then
    raise exception 'Case 2 FAILED: supplier status=NULL tampering still succeeds after migration 100';
  end if;
  raise notice 'Case 2 passed: supplier status=NULL tampering on an unpaid booking is rejected (not_null_violation) after migration 100';
end
$$;

-- ============================================================================
-- Case 3: the legitimate "release an unpaid hold" status update
-- (status = 'cancelled') still works for both the supplier and the
-- traveler after migration 100.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_traveler uuid := gen_random_uuid();
  v_listing uuid;
  v_booking_a uuid := gen_random_uuid();
  v_booking_b uuid := gen_random_uuid();
  v_status_a text;
  v_status_b text;
begin
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency, guests)
  values
    (v_booking_a, v_listing, 'traveler@example.com', 'pending', 'pending', 20.00, 'EUR', 1);
  insert into public.bookings
    (id, listing_id, guest_user_id, guest_email, status, payment_status, total_amount, currency, guests)
  values
    (v_booking_b, v_listing, v_traveler, 'traveler2@example.com', 'pending', 'pending', 20.00, 'EUR', 1);

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);
  update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_booking_a;
  reset session authorization;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);
  perform set_config('test.email', 'traveler2@example.com', false);
  update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_booking_b;
  reset session authorization;

  select status into v_status_a from public.bookings where id = v_booking_a;
  select status into v_status_b from public.bookings where id = v_booking_b;

  if v_status_a <> 'cancelled' or v_status_b <> 'cancelled' then
    raise exception 'Case 3 FAILED: releasing an unpaid hold (status update) no longer works after migration 100 (supplier=%, traveler=%)', v_status_a, v_status_b;
  end if;
  raise notice 'Case 3 passed: the legitimate unpaid-hold-release status update still works for both actors after migration 100';
end
$$;

-- ============================================================================
-- Case 4: migration 085's own paid-booking cancellation-truth guard
-- still works after migration 100 (no regression).
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
    raise exception 'Case 4 FAILED: migration 085''s paid-booking cancellation-truth guard regressed after migration 100 (status=%)', v_status;
  end if;
  raise notice 'Case 4 passed: migration 085''s paid-booking cancellation-truth guard is unaffected by migration 100 (status=%)', v_status;
end
$$;

-- ============================================================================
-- Case 5: a legitimate service-role write with an explicit, real status
-- value (the only kind real app code ever sends) still works.
-- ============================================================================
do $$
declare
  v_listing uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_status text;
begin
  insert into public.listings (id, supplier_id) values (v_listing, gen_random_uuid());
  insert into public.bookings
    (id, listing_id, guest_email, status, payment_status, total_amount, currency, guests)
  values
    (v_booking, v_listing, 'traveler@example.com', 'pending', 'pending', 20.00, 'EUR', 1);

  perform set_config('test.role', 'service_role', false);
  perform set_config('test.uid', '', false);
  update public.bookings set status = 'confirmed', payment_status = 'paid' where id = v_booking;
  perform set_config('test.role', 'authenticated', false);

  select status into v_status from public.bookings where id = v_booking;
  if v_status <> 'confirmed' then
    raise exception 'Case 5 FAILED: the legitimate service-role status write no longer works after migration 100 (status=%)', v_status;
  end if;
  raise notice 'Case 5 passed: the legitimate service-role status write is unaffected by migration 100';
end
$$;

do $$
begin
  raise notice 'All migration-100 regression cases passed.';
end
$$;
