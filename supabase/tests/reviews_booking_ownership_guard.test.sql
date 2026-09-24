-- Regression test for migration 089 (reviews booking-ownership guard).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_089
--   sudo -u postgres psql -d traverion_test_089 -f supabase/tests/reviews_booking_ownership_guard.test.sql
--
-- Builds a minimal listings/bookings/reviews schema (bookings carries the
-- real migration 037 consumer-ownership SELECT policy, since the new
-- reviews policy's EXISTS subquery against bookings is itself subject to
-- bookings' own RLS -- this must be modeled faithfully, per the
-- Phase 570/563 lesson, or the legitimate-ownership cases would fail for
-- the wrong reason), includes the REAL migration 006 file as the pre-089
-- baseline, then 089. Proves:
--   (a) against 006 alone, an attacker can post a review claiming a
--       victim's real booking_id (or any unrelated booking_id) as proof
--       of a "verified" purchase, on a listing they never booked;
--   (b) after 089, the identical insert is rejected;
--   (c) after 089, a legitimate review using the caller's own confirmed
--       booking for the SAME listing still succeeds;
--   (d) after 089, an unverified review (booking_id null) still succeeds;
--   (e) after 089, a booking for a DIFFERENT listing than the one being
--       reviewed is rejected even though it belongs to the caller;
--   (f) after 089, a booking that is the caller's own but not yet
--       status = 'confirmed' is rejected;
--   (g) after 089, email-matched ownership (guest_user_id null, guest_email
--       matches the JWT email) is accepted, mirroring the same
--       dual-identity ownership pattern used elsewhere for bookings;
--   (h) after 089, the same exploit via UPDATE (reassigning booking_id on
--       an already-owned review to someone else's booking) is rejected.

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

-- Real production consumer-ownership SELECT policies (migration 037),
-- since the reviews policy's EXISTS subquery on bookings is itself
-- subject to bookings' own RLS.
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

-- ---------------------------------------------------------------------
-- Apply the real, currently-committed baseline (006) -- the gap this
-- phase closes.
-- ---------------------------------------------------------------------
\ir ../migrations/006_reviews.sql

grant all on public.reviews to authenticated, test_actor;

-- ============================================================================
-- Case 1 (pre-fix, proves the exploit is real against today's committed
-- code): an attacker posts a review on a listing they never booked,
-- claiming a completely unrelated real booking (belonging to a different
-- user, for a different listing) as their "verified" proof of purchase.
-- ============================================================================
do $$
declare
  v_victim_user uuid := gen_random_uuid();
  v_attacker uuid := gen_random_uuid();
  v_listing_attacked uuid;
  v_listing_unrelated uuid;
  v_unrelated_booking uuid;
  v_review_booking uuid;
begin
  insert into auth.users (id) values (v_victim_user), (v_attacker);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing_attacked;
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing_unrelated;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing_unrelated, v_victim_user, 'confirmed')
    returning id into v_unrelated_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_attacker::text, false);

  insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
  values (v_listing_attacked, v_attacker, v_unrelated_booking, 'Totally Real Customer', 5, 'Amazing! (fabricated)');

  reset session authorization;

  select booking_id into v_review_booking from public.reviews where listing_id = v_listing_attacked and user_id = v_attacker;
  if v_review_booking is distinct from v_unrelated_booking then
    raise exception 'Case 1 FAILED (unexpectedly): fabricated verified review against 006-only baseline did not behave as expected (booking_id=%)', v_review_booking;
  end if;
  raise notice 'Case 1 confirmed: against 006 alone, an attacker can post a review on a listing they never booked and falsely claim a stranger''s real booking as verified proof (this is the bug 089 closes)';
end
$$;

-- ---------------------------------------------------------------------
-- Apply the real fix under test.
-- ---------------------------------------------------------------------
\ir ../migrations/089_reviews_booking_ownership_guard.sql

-- ============================================================================
-- Case 2: the identical fabricated-verified-review attempt is now rejected.
-- ============================================================================
do $$
declare
  v_victim_user uuid := gen_random_uuid();
  v_attacker uuid := gen_random_uuid();
  v_listing_attacked uuid;
  v_listing_unrelated uuid;
  v_unrelated_booking uuid;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_victim_user), (v_attacker);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing_attacked;
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing_unrelated;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing_unrelated, v_victim_user, 'confirmed')
    returning id into v_unrelated_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_attacker::text, false);

  begin
    insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
    values (v_listing_attacked, v_attacker, v_unrelated_booking, 'Totally Real Customer', 5, 'Amazing! (fabricated)');
    v_failed := false;
  exception when others then
    v_failed := true;
  end;

  reset session authorization;

  if not v_failed then
    raise exception 'Case 2 FAILED: fabricated verified review still succeeds after 089';
  end if;
  raise notice 'Case 2 passed: fabricated verified review is rejected after 089';
end
$$;

-- ============================================================================
-- Case 3: a legitimate review using the caller's OWN confirmed booking for
-- the SAME listing still succeeds after 089.
-- ============================================================================
do $$
declare
  v_user uuid := gen_random_uuid();
  v_listing uuid;
  v_booking uuid;
  v_stored uuid;
begin
  insert into auth.users (id) values (v_user);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing, v_user, 'confirmed')
    returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_user::text, false);

  insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
  values (v_listing, v_user, v_booking, 'Real Customer', 5, 'Great stay!');

  reset session authorization;

  select booking_id into v_stored from public.reviews where listing_id = v_listing and user_id = v_user;
  if v_stored is distinct from v_booking then
    raise exception 'Case 3 FAILED: a legitimate own-booking verified review no longer works after 089 (booking_id=%)', v_stored;
  end if;
  raise notice 'Case 3 passed: a legitimate own-booking verified review still works after 089';
end
$$;

-- ============================================================================
-- Case 4: an unverified review (booking_id null) still succeeds after 089.
-- ============================================================================
do $$
declare
  v_user uuid := gen_random_uuid();
  v_listing uuid;
  v_count int;
begin
  insert into auth.users (id) values (v_user);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_user::text, false);

  insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
  values (v_listing, v_user, null, 'Anonymous-ish Customer', 4, 'Pretty good.');

  reset session authorization;

  select count(*) into v_count from public.reviews where listing_id = v_listing and user_id = v_user and booking_id is null;
  if v_count <> 1 then
    raise exception 'Case 4 FAILED: an unverified (booking_id null) review no longer works after 089';
  end if;
  raise notice 'Case 4 passed: an unverified review still works after 089';
end
$$;

-- ============================================================================
-- Case 5: a booking that IS the caller's own, but for a DIFFERENT listing
-- than the one being reviewed, is rejected.
-- ============================================================================
do $$
declare
  v_user uuid := gen_random_uuid();
  v_listing_reviewed uuid;
  v_listing_actually_booked uuid;
  v_booking uuid;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_user);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing_reviewed;
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing_actually_booked;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing_actually_booked, v_user, 'confirmed')
    returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_user::text, false);

  begin
    insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
    values (v_listing_reviewed, v_user, v_booking, 'Real Customer', 5, 'Great! (wrong listing)');
    v_failed := false;
  exception when others then
    v_failed := true;
  end;

  reset session authorization;

  if not v_failed then
    raise exception 'Case 5 FAILED: a same-user booking for a DIFFERENT listing is still accepted as verified proof after 089';
  end if;
  raise notice 'Case 5 passed: a booking for a different listing than the one reviewed is rejected after 089';
end
$$;

-- ============================================================================
-- Case 6: a booking that is the caller's own and for the right listing,
-- but not yet status = 'confirmed', is rejected (matches the app's own
-- client-side eligibility bar).
-- ============================================================================
do $$
declare
  v_user uuid := gen_random_uuid();
  v_listing uuid;
  v_booking uuid;
  v_failed boolean;
begin
  insert into auth.users (id) values (v_user);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing, v_user, 'pending')
    returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_user::text, false);

  begin
    insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
    values (v_listing, v_user, v_booking, 'Real Customer', 5, 'Great! (not actually confirmed yet)');
    v_failed := false;
  exception when others then
    v_failed := true;
  end;

  reset session authorization;

  if not v_failed then
    raise exception 'Case 6 FAILED: a not-yet-confirmed booking is still accepted as verified proof after 089';
  end if;
  raise notice 'Case 6 passed: an own booking that is not status=confirmed is rejected as verified proof after 089';
end
$$;

-- ============================================================================
-- Case 7: email-matched ownership (guest_user_id null, guest_email matches
-- the JWT email) is accepted -- the same dual-identity pattern used
-- elsewhere in this codebase for consumer booking ownership.
-- ============================================================================
do $$
declare
  v_user uuid := gen_random_uuid();
  v_listing uuid;
  v_booking uuid;
  v_stored uuid;
begin
  insert into auth.users (id) values (v_user);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing;
  insert into public.bookings (id, listing_id, guest_user_id, guest_email, status)
    values (gen_random_uuid(), v_listing, null, 'Traveler@Example.com', 'confirmed')
    returning id into v_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_user::text, false);
  perform set_config('test.email', 'traveler@example.com', false);

  insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
  values (v_listing, v_user, v_booking, 'Real Customer', 5, 'Great stay! (legacy email-only booking)');

  reset session authorization;

  select booking_id into v_stored from public.reviews where listing_id = v_listing and user_id = v_user;
  if v_stored is distinct from v_booking then
    raise exception 'Case 7 FAILED: email-matched booking ownership is not accepted as verified proof after 089';
  end if;
  raise notice 'Case 7 passed: email-matched booking ownership is accepted as verified proof after 089';
end
$$;

-- ============================================================================
-- Case 8: the same exploit attempted via UPDATE -- a user reassigns
-- booking_id on their own existing (unverified) review to someone else's
-- real booking, trying to retroactively acquire a false verified badge.
-- ============================================================================
do $$
declare
  v_victim_user uuid := gen_random_uuid();
  v_attacker uuid := gen_random_uuid();
  v_listing_attacked uuid;
  v_listing_unrelated uuid;
  v_unrelated_booking uuid;
  v_failed boolean;
  v_stored uuid;
begin
  insert into auth.users (id) values (v_victim_user), (v_attacker);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing_attacked;
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), gen_random_uuid()) returning id into v_listing_unrelated;
  insert into public.bookings (id, listing_id, guest_user_id, status)
    values (gen_random_uuid(), v_listing_unrelated, v_victim_user, 'confirmed')
    returning id into v_unrelated_booking;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', v_attacker::text, false);

  insert into public.reviews (listing_id, user_id, booking_id, guest_name, rating, comment)
  values (v_listing_attacked, v_attacker, null, 'Attacker', 5, 'Initially unverified');

  begin
    update public.reviews
      set booking_id = v_unrelated_booking
      where listing_id = v_listing_attacked and user_id = v_attacker;
    v_failed := false;
  exception when others then
    v_failed := true;
  end;

  reset session authorization;

  if not v_failed then
    raise exception 'Case 8 FAILED: reassigning booking_id via UPDATE to a stranger''s booking still succeeds after 089';
  end if;

  select booking_id into v_stored from public.reviews where listing_id = v_listing_attacked and user_id = v_attacker;
  if v_stored is not null then
    raise exception 'Case 8 FAILED: booking_id was changed despite the UPDATE being expected to fail (booking_id=%)', v_stored;
  end if;
  raise notice 'Case 8 passed: reassigning booking_id via UPDATE to a stranger''s booking is rejected after 089';
end
$$;

do $$
begin
  raise notice 'All migration-089 regression cases passed.';
end
$$;
