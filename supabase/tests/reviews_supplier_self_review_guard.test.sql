-- Phase 586: proves and closes a supplier self-review / rating-manipulation
-- gap that migration 089 (fake-review / false-verified-badge fix) did not
-- cover -- it required a real, owned, confirmed booking for the SAME
-- listing, but never checked whether the reviewing user IS that listing's
-- own supplier. Nothing in create-booking-checkout-session (traced this
-- phase) stops a supplier from completing a real checkout on their own
-- listing, so a supplier can legitimately reach status='confirmed' on a
-- booking of their own tour/stay, then leave themselves a "Verified"
-- 5-star review -- a real rating-manipulation / fake-social-proof
-- vulnerability, distinct from (and not covered by) 089's fix.
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_093
--   sudo -u postgres psql -d traverion_test_093 -f this_file.sql
--
-- Mirrors supabase/tests/reviews_booking_ownership_guard.test.sql's scratch
-- schema exactly (same auth stubs, same bookings/listings/reviews shape,
-- same real migrations \ir'd verbatim) so this is testing against the
-- actual, currently-committed policies, not a hand-approximated copy.

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
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled'))
);

alter table public.bookings enable row level security;

create policy "Consumers can view own bookings by user id"
  on public.bookings for select
  using (auth.uid() is not null and guest_user_id = auth.uid());

create policy "Consumers can view own bookings"
  on public.bookings for select
  using (
    auth.jwt() ->> 'email' is not null
    and lower(trim(coalesce(guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end
$$;

grant usage on schema public, auth to authenticated, test_actor;
grant all on all tables in schema public to authenticated, test_actor;
grant execute on all functions in schema auth to authenticated, test_actor;
grant authenticated to test_actor;

-- Real, committed baseline: 006 (original reviews table) then 089 (the
-- booking-ownership fix this phase's gap survived).
\ir ../migrations/006_reviews.sql
\ir ../migrations/089_reviews_booking_ownership_guard.sql

grant all on public.reviews to authenticated, test_actor;

-- ============================================================================
-- Case 1 (pre-fix, proves the exploit is real against 089 alone): a
-- supplier books their OWN listing (a real, confirmed booking -- nothing in
-- create-booking-checkout-session stops this), then reviews it as
-- "Verified" using that very booking as proof.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_booking uuid;
  v_stored uuid;
begin
  insert into auth.users (id) values (v_supplier);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing, v_supplier, 'confirmed')
    returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
  values (v_listing, v_supplier, v_booking, 'Delighted Traveler', 5, 'Best tour ever!! (actually the supplier)');

  reset session authorization;

  select booking_id into v_stored from public.reviews where listing_id = v_listing and user_id = v_supplier;
  if v_stored is distinct from v_booking then
    raise exception 'Case 1 FAILED (unexpectedly): supplier self-review against 089-only baseline did not behave as expected (booking_id=%)', v_stored;
  end if;
  raise notice 'Case 1 confirmed: against 089 alone, a listing''s own supplier can complete a real booking on their own listing and leave themselves a "Verified" review (this is the gap this phase closes)';
end
$$;

-- ---------------------------------------------------------------------
-- Apply the real fix under test.
-- ---------------------------------------------------------------------
\ir ../migrations/093_reviews_block_supplier_self_review.sql

-- ============================================================================
-- Case 2: the identical supplier self-review attempt is now rejected, even
-- with a completely real, owned, confirmed booking on their own listing.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_booking uuid;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_supplier);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing, v_supplier, 'confirmed')
    returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  begin
    insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
    values (v_listing, v_supplier, v_booking, 'Delighted Traveler', 5, 'Best tour ever!! (actually the supplier)');
    v_failed := false;
  exception when others then
    v_failed := true;
  end;

  reset session authorization;

  if not v_failed then
    raise exception 'Case 2 FAILED: a supplier can still review their own listing (even with a real, owned, confirmed booking) after 093';
  end if;
  raise notice 'Case 2 passed: a supplier self-review is rejected after 093, even with a real owned+confirmed booking on their own listing';
end
$$;

-- ============================================================================
-- Case 3: an UNVERIFIED supplier self-review (booking_id null) is ALSO
-- rejected -- the fraud is impersonating an independent customer voice at
-- all, not merely the "Verified" badge specifically.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_supplier);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  begin
    insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
    values (v_listing, v_supplier, null, 'Delighted Traveler', 5, 'Amazing! (unverified self-review)');
    v_failed := false;
  exception when others then
    v_failed := true;
  end;

  reset session authorization;

  if not v_failed then
    raise exception 'Case 3 FAILED: an unverified supplier self-review still succeeds after 093';
  end if;
  raise notice 'Case 3 passed: an unverified supplier self-review is also rejected after 093';
end
$$;

-- ============================================================================
-- Case 4 (adjacent, must still work): a genuine, unrelated traveler can
-- still leave a verified review using their own real confirmed booking.
-- ============================================================================
do $$
declare
  v_traveler uuid := gen_random_uuid();
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_booking uuid;
  v_stored uuid;
begin
  insert into auth.users (id) values (v_traveler), (v_supplier);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing, v_traveler, 'confirmed')
    returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_traveler::text, false);

  insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
  values (v_listing, v_traveler, v_booking, 'Real Traveler', 5, 'Genuinely great tour!');

  reset session authorization;

  select booking_id into v_stored from public.reviews where listing_id = v_listing and user_id = v_traveler;
  if v_stored is distinct from v_booking then
    raise exception 'Case 4 FAILED: a genuine unrelated traveler''s verified review no longer works after 093 (booking_id=%)', v_stored;
  end if;
  raise notice 'Case 4 passed: a genuine unrelated traveler''s verified review still works after 093 (no regression)';
end
$$;

-- ============================================================================
-- Case 5 (adjacent, must still work): the supplier of a DIFFERENT,
-- unrelated listing can still review some OTHER listing they genuinely
-- booked as a traveler -- 093 must only block reviewing your OWN listing,
-- not being a supplier in general.
-- ============================================================================
do $$
declare
  v_supplier_a uuid := gen_random_uuid();
  v_listing_a uuid;
  v_listing_b uuid;
  v_booking uuid;
  v_stored uuid;
begin
  insert into auth.users (id) values (v_supplier_a);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier_a) returning id into v_listing_a;
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing_b;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing_b, v_supplier_a, 'confirmed')
    returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier_a::text, false);

  insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
  values (v_listing_b, v_supplier_a, v_booking, 'Supplier-as-traveler', 5, 'Booked a competitor''s tour as a genuine guest');

  reset session authorization;

  select booking_id into v_stored from public.reviews where listing_id = v_listing_b and user_id = v_supplier_a;
  if v_stored is distinct from v_booking then
    raise exception 'Case 5 FAILED: a supplier reviewing a DIFFERENT listing they genuinely booked no longer works after 093 (booking_id=%)', v_stored;
  end if;
  raise notice 'Case 5 passed: a supplier can still review a different listing they genuinely booked as a traveler (093 only blocks self-review)';
end
$$;

-- ============================================================================
-- Case 6: the same exploit attempted via UPDATE -- a supplier who already
-- has some other row in reviews for their own listing (e.g. an
-- already-existing unverified one, if one somehow predates this fix) tries
-- to attach their own booking_id to it retroactively.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_booking uuid;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_supplier);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing, v_supplier, 'confirmed')
    returning id into v_booking;

  -- Insert this row as service_role (bypassing RLS) to model a pre-existing
  -- row, then attempt the UPDATE exploit as the supplier themselves.
  insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
  values (v_listing, v_supplier, null, 'Pre-existing row', 5, 'Placeholder');

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_supplier::text, false);

  begin
    update public.reviews
      set booking_id = v_booking
      where listing_id = v_listing and user_id = v_supplier;
    v_failed := false;
  exception when others then
    v_failed := true;
  end;

  reset session authorization;

  if not v_failed then
    raise exception 'Case 6 FAILED: retroactively attaching a self-booking via UPDATE still succeeds after 093';
  end if;
  raise notice 'Case 6 passed: retroactively attaching a self-booking via UPDATE is rejected after 093';
end
$$;

do $$
begin
  raise notice 'All Phase 586 (migration 093) supplier-self-review regression cases passed.';
end
$$;
