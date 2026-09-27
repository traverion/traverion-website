-- Phase 1035: adversarial coverage for migration 119
-- (reviews SELECT published / supplier / author).
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_119
--   sudo -u postgres psql -d traverion_test_119 -f supabase/tests/reviews_published_or_party_select.test.sql

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
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  user_id uuid not null references auth.users(id),
  rating int not null,
  comment text not null default '',
  guest_name text not null default 'Guest'
);

alter table public.reviews enable row level security;
create policy "Reviews are viewable by everyone"
  on public.reviews for select using (true);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select on public.listings, public.reviews to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'author@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com');

insert into public.listings (id, supplier_id, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'published'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'draft');

insert into public.reviews (id, listing_id, user_id, rating, comment, guest_name) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333', 5, 'pub review', 'A'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '33333333-3333-3333-3333-333333333333', 4, 'draft review', 'A');

begin;
set local role test_actor;
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
do $$
begin
  if not exists (select 1 from public.reviews where comment = 'draft review') then
    raise exception 'TEST SETUP INVALID: expected world-readable draft review pre-fix';
  end if;
  raise notice 'GAP CONFIRMED: draft listing review world-readable pre-fix';
end
$$;
rollback;

\ir ../migrations/119_reviews_published_or_party_select.sql

begin;
set local role test_actor;
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
do $$
begin
  if not exists (select 1 from public.reviews where comment = 'pub review') then
    raise exception 'REGRESSION: published review hidden from stranger';
  end if;
  if exists (select 1 from public.reviews where comment = 'draft review') then
    raise exception 'REGRESSION: draft review still readable by stranger';
  end if;
  raise notice 'stranger sees published only';
end
$$;
rollback;

begin;
set local role test_actor;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  if not exists (select 1 from public.reviews where comment = 'draft review') then
    raise exception 'REGRESSION: supplier cannot read draft listing review';
  end if;
end
$$;
rollback;

begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  if not exists (select 1 from public.reviews where comment = 'draft review') then
    raise exception 'REGRESSION: author cannot read own draft-listing review';
  end if;
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (119)' as result;
