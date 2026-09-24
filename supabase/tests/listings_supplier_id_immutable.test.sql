-- Regression test for migration 091 (listings supplier_id -- explicit
-- WITH CHECK hardening; NOT a vulnerability fix, see 091's own header).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_091
--   sudo -u postgres psql -d traverion_test_091 -f supabase/tests/listings_supplier_id_immutable.test.sql
--
-- Builds a minimal listings/bookings schema (bookings carries the real
-- migration 001 supplier-select policy, and listings carries the real
-- migration 001 public-read-all select policy, since the bookings
-- policy's own EXISTS subquery needs to be able to see listings rows at
-- all -- the same RLS-needs-a-SELECT-policy lesson learned repeatedly
-- elsewhere in this test suite), includes the REAL migration 001
-- insert/update policies as the pre-091 baseline, then 091. Proves:
--   (a) against 001 alone, a supplier attempting to reassign their own
--       listing's supplier_id to a different user is ALREADY rejected --
--       PostgreSQL's own documented RLS semantics reuse an UPDATE
--       policy's USING clause as the check against the new row when no
--       WITH CHECK is given, so this was never actually exploitable;
--   (b) after 091, the identical (already-rejected) attempt behaves
--       identically -- still rejected, now via an explicit check instead
--       of the implicit default;
--   (c) after 091, an ordinary field edit (title) on a listing the
--       caller owns still succeeds, unchanged;
--   (d) after 091, a caller cannot update a listing they do not own at
--       all (unchanged);
--   (e) after 091, a service-role write of supplier_id is unaffected
--       (RLS does not apply to service_role).

\set ON_ERROR_STOP on

create schema if not exists auth;

create table auth.users (
  id uuid primary key
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id),
  title text
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id),
  guest_email text,
  guest_name text
);

alter table public.listings enable row level security;
alter table public.bookings enable row level security;

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

-- Real production SELECT policy on listings (migration 001): public
-- read-all. Required so the bookings policy's own EXISTS subquery below
-- can see listings rows at all.
create policy "Listings are viewable by everyone"
  on public.listings for select
  using (true);

-- Real production supplier-select policy on bookings (migration 001):
-- a LIVE join back to listings.supplier_id -- the property that made this
-- worth investigating in the first place, even though it turned out to
-- already be safe.
create policy "Suppliers can view bookings for their listings"
  on public.bookings for select
  using (
    exists (
      select 1 from public.listings
      where listings.id = bookings.listing_id
      and listings.supplier_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Apply the real, currently-committed baseline (001's listings insert +
-- update policies).
-- ---------------------------------------------------------------------
drop policy if exists "Suppliers can insert own listings" on public.listings;
create policy "Suppliers can insert own listings"
  on public.listings for insert
  with check (auth.uid() = supplier_id);

drop policy if exists "Suppliers can update own listings" on public.listings;
create policy "Suppliers can update own listings"
  on public.listings for update
  using (auth.uid() = supplier_id);

-- ============================================================================
-- Case 1 (pre-091, against the real committed 001 baseline): an attempted
-- supplier_id reassignment is ALREADY rejected -- proves this was never
-- actually exploitable, before any fix is applied.
-- ============================================================================
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_third_party uuid := gen_random_uuid();
  v_listing uuid;
  v_stored_supplier uuid;
  v_visible_count int;
begin
  insert into auth.users (id) values (v_owner), (v_third_party);
  insert into public.listings (id, supplier_id, title) values (gen_random_uuid(), v_owner, 'Fjord Kayak Tour') returning id into v_listing;
  insert into public.bookings (listing_id, guest_email, guest_name) values (v_listing, 'traveler@example.com', 'Real Traveler');

  set session authorization test_actor;
  perform set_config('test.uid', v_owner::text, false);

  begin
    update public.listings set supplier_id = v_third_party where id = v_listing;
  exception when others then
    -- Expected: PostgreSQL reuses USING as the implicit WITH CHECK here.
    null;
  end;

  reset session authorization;

  select supplier_id into v_stored_supplier from public.listings where id = v_listing;
  if v_stored_supplier is distinct from v_owner then
    raise exception 'Case 1 FAILED (unexpectedly): supplier_id reassignment against 001-only baseline succeeded -- this WOULD be a real, exploitable vulnerability (supplier_id=%)', v_stored_supplier;
  end if;

  set session authorization test_actor;
  perform set_config('test.uid', v_third_party::text, false);
  select count(*) into v_visible_count from public.bookings where listing_id = v_listing;
  reset session authorization;

  if v_visible_count <> 0 then
    raise exception 'Case 1 FAILED (unexpectedly): the third party can see the listing''s bookings despite the reassignment having been rejected (visible=%)', v_visible_count;
  end if;
  raise notice 'Case 1 confirmed: against 001 alone (no explicit WITH CHECK), a supplier_id reassignment attempt is ALREADY rejected -- PostgreSQL reuses the UPDATE policy''s USING clause as the check against the new row when WITH CHECK is omitted. This was never exploitable; 091 hardens it explicitly rather than fixing a live bug.';
end
$$;

-- ---------------------------------------------------------------------
-- Apply the hardening under test.
-- ---------------------------------------------------------------------
\ir ../migrations/091_listings_supplier_id_immutable.sql

-- ============================================================================
-- Case 2: the identical reassignment attempt behaves identically after
-- 091 -- still rejected, now via an explicit check.
-- ============================================================================
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_third_party uuid := gen_random_uuid();
  v_listing uuid;
  v_stored_supplier uuid;
  v_visible_count int;
begin
  insert into auth.users (id) values (v_owner), (v_third_party);
  insert into public.listings (id, supplier_id, title) values (gen_random_uuid(), v_owner, 'Fjord Kayak Tour') returning id into v_listing;
  insert into public.bookings (listing_id, guest_email, guest_name) values (v_listing, 'traveler@example.com', 'Real Traveler');

  set session authorization test_actor;
  perform set_config('test.uid', v_owner::text, false);

  begin
    update public.listings set supplier_id = v_third_party where id = v_listing;
  exception when others then
    null;
  end;

  reset session authorization;

  select supplier_id into v_stored_supplier from public.listings where id = v_listing;
  if v_stored_supplier is distinct from v_owner then
    raise exception 'Case 2 FAILED: supplier_id reassignment succeeds after 091 (supplier_id=%)', v_stored_supplier;
  end if;

  set session authorization test_actor;
  perform set_config('test.uid', v_third_party::text, false);
  select count(*) into v_visible_count from public.bookings where listing_id = v_listing;
  reset session authorization;

  if v_visible_count <> 0 then
    raise exception 'Case 2 FAILED: the third party can see the listing''s bookings after 091 (visible=%)', v_visible_count;
  end if;
  raise notice 'Case 2 passed: supplier_id reassignment remains rejected after 091, now via the explicit check';
end
$$;

-- ============================================================================
-- Case 3: an ordinary field edit (title) on a listing the caller owns
-- still succeeds, unchanged, after 091.
-- ============================================================================
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_listing uuid;
  v_title text;
begin
  insert into auth.users (id) values (v_owner);
  insert into public.listings (id, supplier_id, title) values (gen_random_uuid(), v_owner, 'Old Title') returning id into v_listing;

  set session authorization test_actor;
  perform set_config('test.uid', v_owner::text, false);

  update public.listings set title = 'New Title' where id = v_listing;

  reset session authorization;

  select title into v_title from public.listings where id = v_listing;
  if v_title is distinct from 'New Title' then
    raise exception 'Case 3 FAILED: an ordinary field edit no longer works after 091 (title=%)', v_title;
  end if;
  raise notice 'Case 3 passed: an ordinary field edit on an owned listing still works after 091';
end
$$;

-- ============================================================================
-- Case 4: a caller cannot update a listing they do not own at all --
-- unaffected by 091.
-- ============================================================================
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_listing uuid;
  v_title text;
begin
  insert into auth.users (id) values (v_owner), (v_other);
  insert into public.listings (id, supplier_id, title) values (gen_random_uuid(), v_owner, 'Owner''s Listing') returning id into v_listing;

  set session authorization test_actor;
  perform set_config('test.uid', v_other::text, false);

  update public.listings set title = 'Hijacked Title' where id = v_listing;

  reset session authorization;

  select title into v_title from public.listings where id = v_listing;
  if v_title is distinct from 'Owner''s Listing' then
    raise exception 'Case 4 FAILED: a non-owner could update a listing they do not own after 091 (title=%)', v_title;
  end if;
  raise notice 'Case 4 passed: a non-owner still cannot touch a listing they do not own after 091';
end
$$;

-- ============================================================================
-- Case 5: a service-role write of supplier_id is unaffected by 091
-- (RLS does not apply to service_role / the table owner).
-- ============================================================================
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_new_owner uuid := gen_random_uuid();
  v_listing uuid;
  v_stored uuid;
begin
  insert into auth.users (id) values (v_owner), (v_new_owner);
  insert into public.listings (id, supplier_id, title) values (gen_random_uuid(), v_owner, 'Admin-transferred listing') returning id into v_listing;

  update public.listings set supplier_id = v_new_owner where id = v_listing;

  select supplier_id into v_stored from public.listings where id = v_listing;
  if v_stored is distinct from v_new_owner then
    raise exception 'Case 5 FAILED: the service-role write path was unexpectedly blocked after 091';
  end if;
  raise notice 'Case 5 passed: the service-role write path is unaffected by 091';
end
$$;

do $$
begin
  raise notice 'All migration-091 regression cases passed.';
end
$$;
