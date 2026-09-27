-- Phase 1024: adversarial coverage for migration 114
-- (listing_discounts SELECT published-or-owner).
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_114
--   sudo -u postgres psql -d traverion_test_114 -f supabase/tests/listing_discounts_published_or_owner_select.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id),
  status text not null
);

create table public.listing_discounts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  type text not null,
  value numeric not null,
  code text
);

alter table public.listing_discounts enable row level security;
create policy "Listings discounts: public read"
  on public.listing_discounts for select using (true);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select on public.listings, public.listing_discounts to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com');

insert into public.listings (id, supplier_id, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'published'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'draft');

insert into public.listing_discounts (id, listing_id, type, value, code) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'percent', 10, 'PUB10'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'percent', 50, 'DRAFT50');

-- GAP: stranger reads draft promo code
begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  if not exists (
    select 1 from public.listing_discounts where code = 'DRAFT50'
  ) then
    raise exception 'TEST SETUP INVALID: expected world-readable draft discount pre-fix';
  end if;
  raise notice 'GAP CONFIRMED: draft promo code world-readable pre-fix';
end
$$;
rollback;

\ir ../migrations/114_listing_discounts_published_or_owner_select.sql

-- Stranger: published OK, draft hidden
begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  if not exists (select 1 from public.listing_discounts where code = 'PUB10') then
    raise exception 'REGRESSION: published discount hidden from public reader';
  end if;
  if exists (select 1 from public.listing_discounts where code = 'DRAFT50') then
    raise exception 'REGRESSION: draft promo still readable by stranger';
  end if;
  raise notice 'stranger correctly sees published only';
end
$$;
rollback;

-- Owner sees draft
begin;
set local role test_actor;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  if not exists (select 1 from public.listing_discounts where code = 'DRAFT50') then
    raise exception 'REGRESSION: owner cannot read own draft discount';
  end if;
  raise notice 'owner correctly sees draft discount';
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (114)' as result;
