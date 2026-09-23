-- Regression test for the listings_publish_verification_guard trigger
-- (migration 082). This repo has no Deno/pgTAP runner wired into CI (see
-- supabase/tests/cancel_booking_as_traveler.test.sql for the same caveat),
-- so this is a manual, self-contained script.
--
-- Run against a throwaway database, never against a real project:
--   createdb traverion_rpc_test
--   psql -d traverion_rpc_test -f supabase/tests/listing_publish_verification_guard.test.sql
--   dropdb traverion_rpc_test
--
-- Prints "ALL ASSERTIONS PASSED" and exits 0 on success; raises an exception
-- (non-zero exit) on the first failed assertion.

create extension if not exists pgcrypto;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select current_setting('test.uid', true)::uuid;
$$;

drop table if exists public.listings cascade;
drop table if exists public.supplier_profiles cascade;

create table public.supplier_profiles (
  id uuid primary key,
  verification_status text,
  payout_verification_status text
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid,
  status text default 'draft' check (status in ('draft', 'published')),
  title text
);

\ir ../migrations/082_listing_publish_verification_guard.sql

do $$
declare
  v_unverified uuid := gen_random_uuid();
  v_verified uuid := gen_random_uuid();
  v_listing_a uuid;
  v_listing_b uuid;
  v_listing_c uuid;
  v_failed boolean;
begin
  insert into public.supplier_profiles (id, verification_status, payout_verification_status)
  values (v_unverified, 'pending', 'pending'),
         (v_verified, 'verified', 'verified');

  -- Case 1: unverified supplier tries INSERT directly as published -> must fail.
  v_failed := false;
  begin
    insert into public.listings (supplier_id, status, title) values (v_unverified, 'published', 'Sneaky insert');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 1 FAILED: unverified supplier could INSERT a published listing directly';
  end if;

  -- Case 2: unverified supplier creates a draft, then tries to flip it to published -> must fail.
  insert into public.listings (supplier_id, status, title) values (v_unverified, 'draft', 'Draft one')
  returning id into v_listing_a;
  v_failed := false;
  begin
    update public.listings set status = 'published' where id = v_listing_a;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 2 FAILED: unverified supplier could UPDATE a draft to published';
  end if;

  -- Case 3: verified supplier publishes a draft -> must succeed.
  insert into public.listings (supplier_id, status, title) values (v_verified, 'draft', 'Draft two')
  returning id into v_listing_b;
  update public.listings set status = 'published' where id = v_listing_b;
  if (select status from public.listings where id = v_listing_b) <> 'published' then
    raise exception 'Case 3 FAILED: verified supplier could not publish';
  end if;

  -- Case 4: verification later lapses; an ordinary edit to the ALREADY-published
  -- listing must still work (only the transition into published is gated).
  update public.supplier_profiles set verification_status = 'pending' where id = v_verified;
  update public.listings set title = 'Renamed while unverified' where id = v_listing_b;
  if (select title from public.listings where id = v_listing_b) <> 'Renamed while unverified' then
    raise exception 'Case 4 FAILED: ordinary edit to an already-published listing was wrongly blocked';
  end if;

  -- Case 5: that now-unverified supplier still cannot newly-publish a DIFFERENT draft.
  insert into public.listings (supplier_id, status, title) values (v_verified, 'draft', 'Draft three')
  returning id into v_listing_c;
  v_failed := false;
  begin
    update public.listings set status = 'published' where id = v_listing_c;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 5 FAILED: lapsed verification still allowed a new publish';
  end if;

  raise notice 'ALL ASSERTIONS PASSED';
end $$;
