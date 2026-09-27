-- Phase 1021: adversarial coverage for migration 112
-- (wishlist prune when listing leaves published).
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_112
--   sudo -u postgres psql -d traverion_test_112 -f supabase/tests/wishlist_prune_on_unpublish.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text
);

create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id),
  status text
);

create table public.wishlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  primary key (user_id, listing_id)
);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'traveler@example.com');

insert into public.listings (id, supplier_id, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'published'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'draft');

insert into public.wishlist (user_id, listing_id) values
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Pre-fix: draft row still present (orphan from post-104 unpublish path).
do $$
begin
  if not exists (
    select 1 from public.wishlist
    where listing_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) then
    raise exception 'TEST SETUP INVALID: expected orphan draft wishlist row';
  end if;
  raise notice 'GAP CONFIRMED: wishlist still holds a draft listing row pre-fix';
end
$$;

\ir ../migrations/112_wishlist_prune_on_unpublish.sql

-- One-shot cleanup removed the draft orphan.
do $$
begin
  if exists (
    select 1 from public.wishlist
    where listing_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) then
    raise exception 'REGRESSION: one-shot cleanup left draft wishlist row';
  end if;
  if not exists (
    select 1 from public.wishlist
    where listing_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) then
    raise exception 'REGRESSION: one-shot cleanup wrongly deleted published wishlist row';
  end if;
  raise notice 'one-shot cleanup correctly pruned draft-only';
end
$$;

-- Trigger: unpublish published listing → wishlist row gone.
update public.listings
  set status = 'draft'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $$
begin
  if exists (
    select 1 from public.wishlist
    where listing_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) then
    raise exception 'REGRESSION: trigger did not prune wishlist on unpublish';
  end if;
  raise notice 'trigger correctly pruned wishlist on unpublish';
end
$$;

-- Re-publish + re-save then confirm republish does not wipe (no status leave).
insert into public.wishlist (user_id, listing_id) values
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

update public.listings
  set status = 'published'
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $$
begin
  if not exists (
    select 1 from public.wishlist
    where listing_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) then
    raise exception 'REGRESSION: republish path wiped wishlist incorrectly';
  end if;
  raise notice 'republish left wishlist intact';
end
$$;

select 'ALL ASSERTIONS PASSED (112)' as result;
