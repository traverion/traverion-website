-- Phase 583: adversarial regression coverage proving the listings.status
-- NULL bypass (see migration 092's own comment for the full writeup) is
-- real against the pre-fix schema, and closed by the fix.
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_092
--   sudo -u postgres psql -d traverion_test_092 -f this_file.sql
--
-- Builds a minimal listings/supplier_profiles schema matching the real
-- column set migrations 001+003+012 establish, then applies the real,
-- committed migrations 052, 082, 091 and 092 verbatim via \ir. Two halves:
--   PART A (\before-092): proves the exploit against the schema as it
--     stood immediately before this phase's fix -- an unverified
--     supplier can create a status: null listing that (a) the
--     publish-verification trigger does not block and (b) is publicly
--     SELECT-able.
--   PART B (after 092 applies): the same attempt is now rejected outright
--     by the NOT NULL constraint, and ordinary published/draft/ownership
--     visibility rules still work correctly (adjacent-behavior check).

\set ON_ERROR_STOP on

create schema if not exists auth;
create table auth.users (id uuid primary key);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated');
$$;

create extension if not exists pgcrypto;

-- Matches public.listings as of migration 001 (relevant columns only) +
-- migration 003's `alter table ... add column status text default
-- 'published' check (status in ('draft','published'))`, applied here as
-- part of the initial create table since 003 itself also touches an
-- unrelated bookings table this test does not need.
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Test listing',
  status text default 'published' check (status in ('draft', 'published'))
);

-- Matches public.supplier_profiles (migration 001) + the verification
-- columns migration 012 adds (relevant columns only).
create table public.supplier_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  verification_status text,
  payout_verification_status text
);

alter table public.listings enable row level security;
alter table public.supplier_profiles enable row level security;

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

-- Real, committed migration 052: the listings SELECT policy as it stood
-- before this phase.
\ir ../migrations/052_listings_select_published_or_own.sql

-- Real, committed migration 082: the publish-verification trigger.
\ir ../migrations/082_listing_publish_verification_guard.sql

-- Real, committed migration 091: explicit WITH CHECK hardening on the
-- UPDATE policy (does not touch status).
\ir ../migrations/091_listings_supplier_id_immutable.sql

-- Need an INSERT policy too (migration 001) since this scratch schema
-- didn't \ir migration 001 wholesale -- replicated verbatim from it.
drop policy if exists "Suppliers can insert own listings" on public.listings;
create policy "Suppliers can insert own listings"
  on public.listings for insert
  with check (auth.uid() = supplier_id);

grant all on public.listings, public.supplier_profiles to authenticated, test_actor;

-- ============================================================================
-- Fixture: one authenticated supplier with ZERO verification.
-- ============================================================================
do $$
declare
  v_unverified_supplier uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_other_user uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
begin
  insert into auth.users (id) values (v_unverified_supplier), (v_other_user);
  insert into public.supplier_profiles (id, verification_status, payout_verification_status)
    values (v_unverified_supplier, null, null);
end $$;

\set unverified_supplier '''aaaaaaaa-0000-0000-0000-000000000001'''
\set other_user '''aaaaaaaa-0000-0000-0000-000000000002'''

-- ============================================================================
-- PART A: prove the exploit against the pre-fix schema (052 + 082 + 091,
-- no 092 applied yet).
-- ============================================================================

-- Case 1: sanity -- the unverified supplier trying to insert status =
-- 'published' directly IS correctly blocked by the 082 trigger. Isolates
-- that the trigger itself works for the literal value; NULL is the gap.
do $$
declare
  v_failed boolean := false;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  begin
    insert into public.listings (supplier_id, title, status)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'Attempt: explicit published', 'published');
  exception when others then
    v_failed := true;
  end;
  reset session authorization;
  if not v_failed then
    raise exception 'Case 1 FAILED: an unverified supplier inserting status=''published'' directly should be blocked by the 082 trigger, but it succeeded';
  end if;
  raise notice 'Case 1 passed: explicit status=''published'' by an unverified supplier is correctly blocked (082 trigger works)';
end $$;

-- Case 2 (the exploit): the SAME unverified supplier inserting
-- status = NULL is NOT blocked by the trigger (NULL = 'published' is not
-- TRUE), and the resulting row IS publicly SELECT-able by a totally
-- unrelated user. This is the real, provable bug this phase closes.
do $$
declare
  v_new_id uuid;
  v_n int;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);

  insert into public.listings (supplier_id, title, status)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Exploit: null status', null)
    returning id into v_new_id;

  reset session authorization;

  if v_new_id is null then
    raise exception 'Case 2 setup FAILED: the status=null insert should have succeeded (that is the exploit) but did not return an id';
  end if;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false);
  select count(*) into v_n from public.listings where id = v_new_id;
  reset session authorization;

  if v_n <> 1 then
    raise exception 'Case 2 FAILED: expected the null-status listing to be publicly visible (proving the exploit), but an unrelated user saw % rows', v_n;
  end if;
  raise notice 'Case 2 passed (exploit proven against pre-fix schema): an unverified supplier''s status=null listing bypassed the 082 trigger AND was publicly SELECT-able to an unrelated user';
end $$;

-- ============================================================================
-- Apply the fix: real, committed migration 092.
-- ============================================================================
\ir ../migrations/092_listings_status_not_null_close_null_bypass.sql

-- ============================================================================
-- PART B: the exploit is now closed, and ordinary behavior is unaffected.
-- ============================================================================

-- Case 3: the row created in Case 2 was backfilled to 'draft' by the
-- migration's UPDATE, and is no longer visible to the unrelated user.
do $$
declare
  v_status text;
  v_n int;
begin
  select status into v_status from public.listings where title = 'Exploit: null status';
  if v_status is distinct from 'draft' then
    raise exception 'Case 3 FAILED: the pre-existing null-status row should have been backfilled to ''draft'', got %', coalesce(v_status, 'NULL');
  end if;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false);
  select count(*) into v_n from public.listings where title = 'Exploit: null status';
  reset session authorization;

  if v_n <> 0 then
    raise exception 'Case 3 FAILED: the backfilled-to-draft row should no longer be visible to an unrelated user, saw %', v_n;
  end if;
  raise notice 'Case 3 passed: the pre-existing null-status row was backfilled to draft and is no longer publicly visible';
end $$;

-- Case 4 (the fix, proven directly): the same status=null insert attempt
-- now fails outright at the database level (NOT NULL violation) --
-- structurally impossible, not just application-gated.
do $$
declare
  v_failed boolean := false;
  v_sqlstate text;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  begin
    insert into public.listings (supplier_id, title, status)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'Second exploit attempt post-fix', null);
  exception when others then
    v_failed := true;
    get stacked diagnostics v_sqlstate = returned_sqlstate;
  end;
  reset session authorization;
  if not v_failed then
    raise exception 'Case 4 FAILED (critical): status=null insert should now be rejected outright by the NOT NULL constraint, but it succeeded';
  end if;
  if v_sqlstate <> '23502' then
    raise exception 'Case 4 FAILED: expected a NOT NULL violation (23502), got sqlstate %', v_sqlstate;
  end if;
  raise notice 'Case 4 passed: status=null is now rejected outright at the schema level (NOT NULL, sqlstate 23502)';
end $$;

-- Case 5 (adjacent behavior, must still work): a verified supplier can
-- still publish normally, and the published listing is publicly visible.
do $$
declare
  v_verified_supplier uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_new_id uuid;
  v_n int;
begin
  insert into auth.users (id) values (v_verified_supplier);
  insert into public.supplier_profiles (id, verification_status, payout_verification_status)
    values (v_verified_supplier, 'verified', 'verified');

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000003', false);
  insert into public.listings (supplier_id, title, status)
    values ('aaaaaaaa-0000-0000-0000-000000000003', 'Legit published listing', 'published')
    returning id into v_new_id;
  reset session authorization;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false);
  select count(*) into v_n from public.listings where id = v_new_id;
  reset session authorization;

  if v_n <> 1 then
    raise exception 'Case 5 FAILED: a verified supplier''s real published listing should still be publicly visible, saw %', v_n;
  end if;
  raise notice 'Case 5 passed: a verified supplier can still publish normally and the listing is publicly visible (no regression)';
end $$;

-- Case 6 (adjacent behavior): a draft listing (explicit, non-null) is
-- still correctly hidden from everyone except its owner.
do $$
declare
  v_n int;
begin
  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  select count(*) into v_n from public.listings where title = 'Second exploit attempt post-fix';
  -- that insert failed in Case 4, so nothing to find; check the owner CAN
  -- see their own pre-existing draft row from Case 3's backfill instead.
  select count(*) into v_n from public.listings where title = 'Exploit: null status' and status = 'draft';
  if v_n <> 1 then
    raise exception 'Case 6 FAILED: the owning supplier should still see their own draft listing, saw %', v_n;
  end if;
  reset session authorization;

  set session authorization test_actor;
  perform set_config('test.role', 'authenticated', false);
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000002', false);
  select count(*) into v_n from public.listings where title = 'Exploit: null status' and status = 'draft';
  reset session authorization;
  if v_n <> 0 then
    raise exception 'Case 6 FAILED: an unrelated user should not see the owner''s draft listing, saw %', v_n;
  end if;
  raise notice 'Case 6 passed: draft visibility (owner yes, everyone else no) is unaffected by the fix';
end $$;

do $$ begin raise notice 'ALL CASES PASSED'; end $$;
