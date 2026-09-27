-- Phase 1195/1196: adversarial coverage for migrations 148 + 149.
-- Team JWT must SELECT draft-listing reviews/replies; stranger must not.
--
-- Run manually when a local Postgres is available:
--   sudo -u postgres createdb traverion_test_148
--   sudo -u postgres psql -d traverion_test_148 -f supabase/tests/reviews_team_select.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create extension if not exists pgcrypto;

create table public.supplier_team_members (
  supplier_id text not null,
  user_id text not null,
  primary key (supplier_id, user_id)
);

create or replace function public.is_supplier_account_side(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and p_supplier_id is not null
    and (
      p_supplier_id = auth.uid()
      or exists (
        select 1
        from public.supplier_team_members stm
        where stm.supplier_id = p_supplier_id::text
          and stm.user_id = auth.uid()::text
      )
    );
$$;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id),
  status text not null
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  user_id uuid not null references auth.users(id),
  comment text
);
create table public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id),
  supplier_id uuid not null references auth.users(id),
  reply_text text not null
);

alter table public.reviews enable row level security;
alter table public.review_replies enable row level security;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select on public.listings, public.reviews, public.review_replies, public.supplier_team_members to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'team@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'author@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com');

insert into public.supplier_team_members (supplier_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into public.listings (id, supplier_id, status) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'draft');

insert into public.reviews (id, listing_id, user_id, comment) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '33333333-3333-3333-3333-333333333333', 'draft review');

insert into public.review_replies (id, review_id, supplier_id, reply_text) values
  ('f2222222-2222-2222-2222-222222222222', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '11111111-1111-1111-1111-111111111111', 'draft reply');

\ir ../migrations/148_reviews_team_select.sql
\ir ../migrations/149_review_replies_team_select.sql

begin;
set local role test_actor;
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if not exists (select 1 from public.reviews where comment = 'draft review') then
    raise exception 'FAIL: team JWT cannot SELECT draft listing review';
  end if;
  if not exists (select 1 from public.review_replies where reply_text = 'draft reply') then
    raise exception 'FAIL: team JWT cannot SELECT draft listing reply';
  end if;
  raise notice 'PASS: team JWT can SELECT draft reviews and replies';
end
$$;
rollback;

begin;
set local role test_actor;
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', true);
do $$
begin
  if exists (select 1 from public.reviews where comment = 'draft review') then
    raise exception 'FAIL: stranger can SELECT draft listing review';
  end if;
  if exists (select 1 from public.review_replies where reply_text = 'draft reply') then
    raise exception 'FAIL: stranger can SELECT draft listing reply';
  end if;
  raise notice 'PASS: stranger cannot SELECT draft reviews or replies';
end
$$;
rollback;
