-- Phase 1040: adversarial coverage for migration 122.
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_122
--   sudo -u postgres psql -d traverion_test_122 -f supabase/tests/listings_block_client_rating_reviews.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb
$$;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id),
  title text not null default 'T',
  rating numeric default 0,
  reviews int default 0,
  status text not null default 'draft'
);

alter table public.listings enable row level security;
create policy "own write" on public.listings for insert with check (supplier_id = auth.uid());
create policy "own update" on public.listings for update using (supplier_id = auth.uid()) with check (supplier_id = auth.uid());
create policy "own read" on public.listings for select using (supplier_id = auth.uid());

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select, insert, update on public.listings to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier@example.com');

\ir ../migrations/122_listings_block_client_rating_reviews.sql

begin;
set local role test_actor;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
select set_config('test.jwt', '{"role":"authenticated"}', true);

insert into public.listings (id, supplier_id, title, rating, reviews)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Forged',
  4.9,
  999
);

do $$
declare
  r numeric;
  n int;
begin
  select rating, reviews into r, n from public.listings where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if r <> 0 or n <> 0 then
    raise exception 'REGRESSION: client insert kept forged rating/reviews (% / %)', r, n;
  end if;
  raise notice 'insert forced rating/reviews to 0';
end
$$;

update public.listings set rating = 5, reviews = 42
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $$
declare
  r numeric;
  n int;
begin
  select rating, reviews into r, n from public.listings where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if r <> 0 or n <> 0 then
    raise exception 'REGRESSION: client update kept forged rating/reviews (% / %)', r, n;
  end if;
  raise notice 'update forced rating/reviews to 0';
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (122)' as result;
