-- Phase 1029: adversarial coverage for migration 117
-- (reviews require non-null owned booking_id).
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_117
--   sudo -u postgres psql -d traverion_test_117 -f supabase/tests/reviews_require_booking_id.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(current_setting('test.jwt', true), '{}')::jsonb
$$;
create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id)
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  guest_user_id uuid,
  guest_email text,
  status text not null default 'confirmed'
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  user_id uuid not null references auth.users(id),
  booking_id uuid references public.bookings(id),
  rating int not null,
  comment text,
  guest_name text
);

alter table public.reviews enable row level security;

-- Pre-117 policy shape (093): null booking_id allowed
create policy "Users can insert own review"
  on public.reviews for insert
  with check (
    auth.uid() = reviews.user_id
    and not exists (
      select 1 from public.listings l
      where l.id = reviews.listing_id and l.supplier_id = reviews.user_id
    )
    and (
      reviews.booking_id is null
      or exists (
        select 1 from public.bookings b
        where b.id = reviews.booking_id
          and b.listing_id = reviews.listing_id
          and b.status = 'confirmed'
          and b.guest_user_id = auth.uid()
      )
    )
  );

create policy "Users can update own review"
  on public.reviews for update
  using (auth.uid() = reviews.user_id)
  with check (
    auth.uid() = reviews.user_id
    and not exists (
      select 1 from public.listings l
      where l.id = reviews.listing_id and l.supplier_id = reviews.user_id
    )
    and (
      reviews.booking_id is null
      or exists (
        select 1 from public.bookings b
        where b.id = reviews.booking_id
          and b.listing_id = reviews.listing_id
          and b.status = 'confirmed'
          and b.guest_user_id = auth.uid()
      )
    )
  );

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end $$;
grant usage on schema public to test_actor;
grant select, insert, update on public.listings, public.bookings, public.reviews to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'traveler@example.com');

insert into public.listings (id, supplier_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111');

insert into public.bookings (id, listing_id, guest_user_id, guest_email, status) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333', 'traveler@example.com', 'confirmed');

-- GAP: null booking_id insert succeeds pre-fix
begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  insert into public.reviews (listing_id, user_id, booking_id, rating, comment)
  values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '33333333-3333-3333-3333-333333333333',
    null,
    5,
    'spam unverified'
  );
  raise notice 'GAP CONFIRMED: null booking_id review insert allowed pre-fix';
exception when others then
  raise exception 'TEST SETUP INVALID: pre-fix null insert unexpectedly blocked (%)', sqlerrm;
end
$$;
rollback;

\ir ../migrations/117_reviews_require_booking_id.sql

begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  begin
    insert into public.reviews (listing_id, user_id, booking_id, rating, comment)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '33333333-3333-3333-3333-333333333333',
      null,
      5,
      'spam'
    );
    raise exception 'REGRESSION: null booking_id review still allowed';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'null booking_id correctly blocked: %', sqlerrm;
  end;

  insert into public.reviews (listing_id, user_id, booking_id, rating, comment)
  values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '33333333-3333-3333-3333-333333333333',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    5,
    'genuine'
  );
  raise notice 'genuine owned booking review insert OK';
end
$$;
rollback;

select 'ALL ASSERTIONS PASSED (117)' as result;
