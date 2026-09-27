-- Phase 1025: adversarial coverage for migration 115
-- (listing_availability SELECT published-or-owner).
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_115
--   sudo -u postgres psql -d traverion_test_115 -f supabase/tests/listing_availability_published_or_owner_select.test.sql

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

create table public.listing_availability (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  available_date date not null,
  capacity int,
  booked int default 0
);

alter table public.listing_availability enable row level security;
create policy "Listing availability is viewable by everyone"
  on public.listing_availability for select using (true);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select on public.listings, public.listing_availability to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com');

insert into public.listings (id, supplier_id, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'published'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'draft');

insert into public.listing_availability (id, listing_id, available_date, capacity, booked) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-10-01', 10, 2),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-10-02', 99, 0);

begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  if not exists (
    select 1 from public.listing_availability where capacity = 99
  ) then
    raise exception 'TEST SETUP INVALID: expected world-readable draft availability pre-fix';
  end if;
  raise notice 'GAP CONFIRMED: draft availability world-readable pre-fix';
end
$$;
rollback;

\ir ../migrations/115_listing_availability_published_or_owner_select.sql

begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  if not exists (select 1 from public.listing_availability where capacity = 10) then
    raise exception 'REGRESSION: published availability hidden from public reader';
  end if;
  if exists (select 1 from public.listing_availability where capacity = 99) then
    raise exception 'REGRESSION: draft availability still readable by stranger';
  end if;
  raise notice 'stranger correctly sees published availability only';
end
$$;
rollback;

begin;
set local role test_actor;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  if not exists (select 1 from public.listing_availability where capacity = 99) then
    raise exception 'REGRESSION: owner cannot read own draft availability';
  end if;
  raise notice 'owner correctly sees draft availability';
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (115)' as result;
