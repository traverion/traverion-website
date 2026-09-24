-- Regression test for migration 090 (review_replies reassignment guard).
--
-- Run manually against a scratch Postgres 16 database:
--   sudo -u postgres createdb traverion_test_090
--   sudo -u postgres psql -d traverion_test_090 -f supabase/tests/review_replies_reassignment_guard.test.sql
--
-- Builds minimal stub tables for everything migration 012's `alter table`
-- statements touch (supplier_profiles, bookings, listings,
-- supplier_earnings) so the REAL 012 file can be included verbatim via
-- \ir, plus a minimal reviews table for review_replies' own foreign key.
-- Includes 012 (the pre-090 baseline for review_replies), then 090.
-- Proves:
--   (a) against 012 alone, a supplier can reassign their own existing
--       reply's review_id onto an unreplied review on a DIFFERENT
--       supplier's listing;
--   (b) after 090, the identical reassignment is rejected;
--   (c) after 090, a legitimate reply insert for the supplier's own
--       listing's review still works (the INSERT policy is untouched by
--       this migration, but this closes the loop end to end);
--   (d) after 090, editing only reply_text (not review_id) on an
--       already-owned, already-correctly-scoped reply still works;
--   (e) after 090, reassigning onto a DIFFERENT review that IS on one of
--       the supplier's own listings still works (090 checks listing
--       ownership, not "the original review_id" -- this remains
--       legitimate).

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

-- Minimal stubs for everything 012's `alter table` statements touch.
create table public.supplier_profiles (
  id uuid primary key
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null
);

create table public.bookings (
  id uuid primary key default gen_random_uuid()
);

create table public.supplier_earnings (
  id uuid primary key default gen_random_uuid()
);

-- Minimal reviews table for review_replies' own foreign key (matches the
-- real 006 shape closely enough for this test's purposes).
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  user_id uuid not null,
  rating int not null default 5
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
-- Apply the real, currently-committed baseline (012) -- the gap this
-- phase closes.
-- ---------------------------------------------------------------------
\ir ../migrations/012_supplier_features.sql

grant all on public.review_replies to authenticated, test_actor;

-- ============================================================================
-- Case 1 (pre-fix, proves the exploit is real against today's committed
-- code): a supplier reassigns their own existing reply's review_id onto
-- an unreplied review on a DIFFERENT supplier's listing.
-- ============================================================================
do $$
declare
  v_attacker uuid := gen_random_uuid();
  v_victim_supplier uuid := gen_random_uuid();
  v_own_listing uuid;
  v_own_review uuid;
  v_victim_listing uuid;
  v_victim_review uuid;
  v_reply_id uuid;
  v_stored_review_id uuid;
begin
  insert into auth.users (id) values (v_attacker), (v_victim_supplier);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_attacker) returning id into v_own_listing;
  insert into public.reviews (id, listing_id, user_id) values (gen_random_uuid(), v_own_listing, gen_random_uuid()) returning id into v_own_review;
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_victim_supplier) returning id into v_victim_listing;
  insert into public.reviews (id, listing_id, user_id) values (gen_random_uuid(), v_victim_listing, gen_random_uuid()) returning id into v_victim_review;

  set session authorization test_actor;
  perform set_config('test.uid', v_attacker::text, false);

  insert into public.review_replies (review_id, supplier_id, reply_text)
  values (v_own_review, v_attacker, 'Thanks for the kind words!')
  returning id into v_reply_id;

  update public.review_replies set review_id = v_victim_review where id = v_reply_id;

  reset session authorization;

  select review_id into v_stored_review_id from public.review_replies where id = v_reply_id;
  if v_stored_review_id is distinct from v_victim_review then
    raise exception 'Case 1 FAILED (unexpectedly): reply reassignment onto a different supplier''s review did not behave as expected against 012-only baseline (review_id=%)', v_stored_review_id;
  end if;
  raise notice 'Case 1 confirmed: against 012 alone, a supplier can reassign their reply onto an unreplied review on a DIFFERENT supplier''s listing (this is the bug 090 closes)';
end
$$;

-- ---------------------------------------------------------------------
-- Apply the real fix under test.
-- ---------------------------------------------------------------------
\ir ../migrations/090_review_replies_reassignment_guard.sql

-- ============================================================================
-- Case 2: the identical reassignment is now rejected.
-- ============================================================================
do $$
declare
  v_attacker uuid := gen_random_uuid();
  v_victim_supplier uuid := gen_random_uuid();
  v_own_listing uuid;
  v_own_review uuid;
  v_victim_listing uuid;
  v_victim_review uuid;
  v_reply_id uuid;
  v_failed boolean;
  v_stored_review_id uuid;
begin
  insert into auth.users (id) values (v_attacker), (v_victim_supplier);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_attacker) returning id into v_own_listing;
  insert into public.reviews (id, listing_id, user_id) values (gen_random_uuid(), v_own_listing, gen_random_uuid()) returning id into v_own_review;
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_victim_supplier) returning id into v_victim_listing;
  insert into public.reviews (id, listing_id, user_id) values (gen_random_uuid(), v_victim_listing, gen_random_uuid()) returning id into v_victim_review;

  set session authorization test_actor;
  perform set_config('test.uid', v_attacker::text, false);

  insert into public.review_replies (review_id, supplier_id, reply_text)
  values (v_own_review, v_attacker, 'Thanks for the kind words!')
  returning id into v_reply_id;

  begin
    update public.review_replies set review_id = v_victim_review where id = v_reply_id;
    v_failed := false;
  exception when others then
    v_failed := true;
  end;

  reset session authorization;

  if not v_failed then
    raise exception 'Case 2 FAILED: reply reassignment onto a different supplier''s review still succeeds after 090';
  end if;

  select review_id into v_stored_review_id from public.review_replies where id = v_reply_id;
  if v_stored_review_id is distinct from v_own_review then
    raise exception 'Case 2 FAILED: review_id was changed despite the UPDATE being expected to fail (review_id=%)', v_stored_review_id;
  end if;
  raise notice 'Case 2 passed: reply reassignment onto a different supplier''s review is rejected after 090';
end
$$;

-- ============================================================================
-- Case 3: a legitimate reply insert for the supplier's own listing's
-- review still works after 090 (INSERT policy untouched, sanity check).
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_review uuid;
  v_count int;
begin
  insert into auth.users (id) values (v_supplier);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.reviews (id, listing_id, user_id) values (gen_random_uuid(), v_listing, gen_random_uuid()) returning id into v_review;

  set session authorization test_actor;
  perform set_config('test.uid', v_supplier::text, false);

  insert into public.review_replies (review_id, supplier_id, reply_text)
  values (v_review, v_supplier, 'Thank you for staying with us!');

  reset session authorization;

  select count(*) into v_count from public.review_replies where review_id = v_review and supplier_id = v_supplier;
  if v_count <> 1 then
    raise exception 'Case 3 FAILED: a legitimate reply insert no longer works after 090';
  end if;
  raise notice 'Case 3 passed: a legitimate reply insert for the supplier''s own listing still works after 090';
end
$$;

-- ============================================================================
-- Case 4: editing only reply_text (review_id unchanged) on an
-- already-owned, already-correctly-scoped reply still works after 090.
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing uuid;
  v_review uuid;
  v_reply_id uuid;
  v_text text;
begin
  insert into auth.users (id) values (v_supplier);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing;
  insert into public.reviews (id, listing_id, user_id) values (gen_random_uuid(), v_listing, gen_random_uuid()) returning id into v_review;

  set session authorization test_actor;
  perform set_config('test.uid', v_supplier::text, false);

  insert into public.review_replies (review_id, supplier_id, reply_text)
  values (v_review, v_supplier, 'Draft reply')
  returning id into v_reply_id;

  update public.review_replies set reply_text = 'Edited: thank you so much!' where id = v_reply_id;

  reset session authorization;

  select reply_text into v_text from public.review_replies where id = v_reply_id;
  if v_text is distinct from 'Edited: thank you so much!' then
    raise exception 'Case 4 FAILED: editing reply_text on an already-owned, correctly-scoped reply no longer works after 090 (text=%)', v_text;
  end if;
  raise notice 'Case 4 passed: editing reply_text without changing review_id still works after 090';
end
$$;

-- ============================================================================
-- Case 5: reassigning onto a DIFFERENT review that IS on one of the
-- supplier's own OTHER listings still works after 090 -- this remains a
-- legitimate operation (090 checks listing ownership, not "the original
-- review_id").
-- ============================================================================
do $$
declare
  v_supplier uuid := gen_random_uuid();
  v_listing_a uuid;
  v_listing_b uuid;
  v_review_a uuid;
  v_review_b uuid;
  v_reply_id uuid;
  v_stored_review_id uuid;
begin
  insert into auth.users (id) values (v_supplier);
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing_a;
  insert into public.listings (id, supplier_id) values (gen_random_uuid(), v_supplier) returning id into v_listing_b;
  insert into public.reviews (id, listing_id, user_id) values (gen_random_uuid(), v_listing_a, gen_random_uuid()) returning id into v_review_a;
  insert into public.reviews (id, listing_id, user_id) values (gen_random_uuid(), v_listing_b, gen_random_uuid()) returning id into v_review_b;

  set session authorization test_actor;
  perform set_config('test.uid', v_supplier::text, false);

  insert into public.review_replies (review_id, supplier_id, reply_text)
  values (v_review_a, v_supplier, 'Wrong review, fixing it')
  returning id into v_reply_id;

  update public.review_replies set review_id = v_review_b where id = v_reply_id;

  reset session authorization;

  select review_id into v_stored_review_id from public.review_replies where id = v_reply_id;
  if v_stored_review_id is distinct from v_review_b then
    raise exception 'Case 5 FAILED: reassigning a reply between two of the supplier''s OWN listings'' reviews no longer works after 090 (review_id=%)', v_stored_review_id;
  end if;
  raise notice 'Case 5 passed: reassigning between the supplier''s own listings'' reviews still works after 090';
end
$$;

do $$
begin
  raise notice 'All migration-090 regression cases passed.';
end
$$;
