-- Regression test for the listings_publish_content_minimums_guard trigger
-- (migration 095). Same manual, self-contained-script approach as
-- supabase/tests/listing_publish_verification_guard.test.sql (082) --
-- this repo has no Deno/pgTAP runner wired into CI.
--
-- Run against a throwaway database, never against a real project:
--   createdb traverion_rpc_test
--   psql -d traverion_rpc_test -f supabase/tests/listing_publish_content_minimums.test.sql
--   dropdb traverion_rpc_test
--
-- Prints "ALL ASSERTIONS PASSED" and exits 0 on success; raises an
-- exception (non-zero exit) on the first failed assertion.
--
-- Structure: first proves the GAP exists against the current, unmodified
-- schema (082's supplier-verification guard alone, no content guard) --
-- a verified supplier can publish a listing with no city/country and a
-- placeholder image. Then loads migration 095 and re-runs the same
-- exploit, now expecting it to be rejected, plus the full case suite.

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

-- Trimmed stub mirroring the real public.listings columns this trigger
-- touches (see migration 001_initial.sql: image/city/country are plain
-- nullable text columns with no server-side length/emptiness checks).
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid,
  status text default 'draft' check (status in ('draft', 'published')),
  title text,
  image text,
  city text,
  country text
);

\ir ../migrations/082_listing_publish_verification_guard.sql

do $$
declare
  v_verified uuid := gen_random_uuid();
  v_listing_gap uuid;
begin
  insert into public.supplier_profiles (id, verification_status, payout_verification_status)
  values (v_verified, 'verified', 'verified');

  -- PRE-FIX: with only 082 applied, a verified supplier can publish a
  -- listing with no city/country and the app's own placeholder photo --
  -- this is the gap migration 095 exists to close. This must SUCCEED
  -- here (proving the gap), before 095 is loaded below.
  insert into public.listings (supplier_id, status, title, image, city, country)
  values (
    v_verified,
    'published',
    'Gap listing',
    'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
    null,
    null
  )
  returning id into v_listing_gap;

  if (select status from public.listings where id = v_listing_gap) <> 'published' then
    raise exception 'SETUP FAILED: expected the pre-fix gap insert to succeed so the fix can be proven against it';
  end if;

  raise notice 'GAP CONFIRMED: verified supplier published with no city/country and a placeholder image (082 alone does not catch this)';
end $$;

\ir ../migrations/095_listing_publish_content_minimums.sql

do $$
declare
  v_verified uuid;
  v_failed boolean;
  v_listing_a uuid;
  v_listing_b uuid;
  v_listing_c uuid;
  v_listing_d uuid;
  v_listing_e uuid;
begin
  select id into v_verified from public.supplier_profiles where verification_status = 'verified' limit 1;

  -- Case 1: missing city -> INSERT as published must fail.
  v_failed := false;
  begin
    insert into public.listings (supplier_id, status, title, image, city, country)
    values (v_verified, 'published', 'No city', 'https://example.com/real-photo.jpg', null, 'Finland');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 1 FAILED: listing with no city could be published';
  end if;

  -- Case 2: missing country -> must fail.
  v_failed := false;
  begin
    insert into public.listings (supplier_id, status, title, image, city, country)
    values (v_verified, 'published', 'No country', 'https://example.com/real-photo.jpg', 'Helsinki', null);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 2 FAILED: listing with no country could be published';
  end if;

  -- Case 3: blank (whitespace-only) city/country -> must fail (trim check).
  v_failed := false;
  begin
    insert into public.listings (supplier_id, status, title, image, city, country)
    values (v_verified, 'published', 'Blank city', 'https://example.com/real-photo.jpg', '   ', 'Finland');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 3 FAILED: listing with whitespace-only city could be published';
  end if;

  -- Case 4: exact placeholder image URL, real city/country -> must fail.
  v_failed := false;
  begin
    insert into public.listings (supplier_id, status, title, image, city, country)
    values (v_verified, 'published', 'Placeholder image', 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg', 'Helsinki', 'Finland');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 4 FAILED: listing with the exact placeholder image URL could be published';
  end if;

  -- Case 5: placeholder-substring match (e.g. a resized/query-string
  -- variant of the same Pexels photo, same check the client gate uses) -> must fail.
  v_failed := false;
  begin
    insert into public.listings (supplier_id, status, title, image, city, country)
    values (v_verified, 'published', 'Placeholder variant', 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Helsinki', 'Finland');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 5 FAILED: listing with a placeholder-URL variant could be published';
  end if;

  -- Case 6: empty-string image -> must fail.
  v_failed := false;
  begin
    insert into public.listings (supplier_id, status, title, image, city, country)
    values (v_verified, 'published', 'Empty image', '', 'Helsinki', 'Finland');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 6 FAILED: listing with an empty-string image could be published';
  end if;

  -- Case 7: null image -> must fail.
  v_failed := false;
  begin
    insert into public.listings (supplier_id, status, title, image, city, country)
    values (v_verified, 'published', 'Null image', null, 'Helsinki', 'Finland');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 7 FAILED: listing with a null image could be published';
  end if;

  -- Case 8: happy path -- real city, real country, real (non-placeholder)
  -- image -> must succeed. Also proves composition with 082: the same
  -- verified supplier who already passed 082's check is not additionally
  -- blocked by 095 once their content is real.
  insert into public.listings (supplier_id, status, title, image, city, country)
  values (v_verified, 'published', 'Real listing', 'https://example.com/real-photo.jpg', 'Helsinki', 'Finland')
  returning id into v_listing_a;
  if (select status from public.listings where id = v_listing_a) <> 'published' then
    raise exception 'Case 8 FAILED: a fully real listing could not be published';
  end if;

  -- Case 9: draft -> published UPDATE path (not just INSERT) is gated too.
  insert into public.listings (supplier_id, status, title, image, city, country)
  values (v_verified, 'draft', 'Draft, missing country', 'https://example.com/real-photo.jpg', 'Helsinki', null)
  returning id into v_listing_b;
  v_failed := false;
  begin
    update public.listings set status = 'published' where id = v_listing_b;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 9 FAILED: draft->published UPDATE with no country was not blocked';
  end if;

  -- Case 10: fix the draft's content, then publish -> must succeed.
  update public.listings set country = 'Finland' where id = v_listing_b;
  update public.listings set status = 'published' where id = v_listing_b;
  if (select status from public.listings where id = v_listing_b) <> 'published' then
    raise exception 'Case 10 FAILED: a corrected draft could not be published';
  end if;

  -- Case 11: an already-published listing having its image cleared during
  -- an unrelated edit is NOT newly blocked -- only the transition into
  -- published is gated, matching 082's behavior.
  update public.listings set image = null where id = v_listing_a;
  update public.listings set title = 'Real listing (renamed)' where id = v_listing_a;
  if (select title from public.listings where id = v_listing_a) <> 'Real listing (renamed)' then
    raise exception 'Case 11 FAILED: an ordinary edit to an already-published listing was wrongly blocked';
  end if;

  -- Case 12: that same listing, now with a cleared image, still cannot be
  -- newly re-published from a non-published status.
  update public.listings set status = 'draft' where id = v_listing_a;
  v_failed := false;
  begin
    update public.listings set status = 'published' where id = v_listing_a;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 12 FAILED: re-publishing a listing whose image was since cleared was not blocked';
  end if;

  -- Case 13: composition with 082 -- an UNVERIFIED supplier with perfectly
  -- real content is still blocked by 082, proving the two triggers compose
  -- (095 does not accidentally bypass 082's check).
  declare
    v_unverified uuid := gen_random_uuid();
  begin
    insert into public.supplier_profiles (id, verification_status, payout_verification_status)
    values (v_unverified, 'pending', 'pending');
    v_failed := false;
    begin
      insert into public.listings (supplier_id, status, title, image, city, country)
      values (v_unverified, 'published', 'Real content, unverified supplier', 'https://example.com/real-photo.jpg', 'Helsinki', 'Finland');
    exception when others then
      v_failed := true;
    end;
    if not v_failed then
      raise exception 'Case 13 FAILED: an unverified supplier with real content bypassed 082 via 095''s presence';
    end if;
  end;

  raise notice 'ALL ASSERTIONS PASSED';
end $$;
