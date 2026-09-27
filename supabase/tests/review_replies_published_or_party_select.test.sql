-- Phase 1036: adversarial coverage for migration 120.
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_120
--   sudo -u postgres psql -d traverion_test_120 -f supabase/tests/review_replies_published_or_party_select.test.sql

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
  user_id uuid not null references auth.users(id)
);
create table public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id),
  supplier_id uuid not null references auth.users(id),
  reply_text text not null
);

alter table public.review_replies enable row level security;
create policy "Anyone can read review replies"
  on public.review_replies for select using (true);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select on public.listings, public.reviews, public.review_replies to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'author@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com');

insert into public.listings (id, supplier_id, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'published'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'draft');

insert into public.reviews (id, listing_id, user_id) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333');

insert into public.review_replies (id, review_id, supplier_id, reply_text) values
  ('f1111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '11111111-1111-1111-1111-111111111111', 'pub reply'),
  ('f2222222-2222-2222-2222-222222222222', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '11111111-1111-1111-1111-111111111111', 'draft reply');

begin;
set local role test_actor;
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
do $$
begin
  if not exists (select 1 from public.review_replies where reply_text = 'draft reply') then
    raise exception 'TEST SETUP INVALID: expected world-readable draft reply pre-fix';
  end if;
  raise notice 'GAP CONFIRMED: draft listing reply world-readable pre-fix';
end
$$;
rollback;

\ir ../migrations/120_review_replies_published_or_party_select.sql

begin;
set local role test_actor;
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
do $$
begin
  if not exists (select 1 from public.review_replies where reply_text = 'pub reply') then
    raise exception 'REGRESSION: published reply hidden from stranger';
  end if;
  if exists (select 1 from public.review_replies where reply_text = 'draft reply') then
    raise exception 'REGRESSION: draft reply still readable by stranger';
  end if;
end
$$;
rollback;

begin;
set local role test_actor;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  if not exists (select 1 from public.review_replies where reply_text = 'draft reply') then
    raise exception 'REGRESSION: supplier cannot read draft reply';
  end if;
end
$$;
rollback;

begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  if not exists (select 1 from public.review_replies where reply_text = 'draft reply') then
    raise exception 'REGRESSION: author cannot read reply on own draft-listing review';
  end if;
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (120)' as result;
