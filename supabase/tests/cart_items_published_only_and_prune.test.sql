-- Phase 1023: adversarial coverage for migration 113
-- (cart_items published-only + prune on unpublish).
--
-- Run manually:
--   sudo -u postgres createdb traverion_test_113
--   sudo -u postgres psql -d traverion_test_113 -f supabase/tests/cart_items_published_only_and_prune.test.sql

\set ON_ERROR_STOP on

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create extension if not exists pgcrypto;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references auth.users(id),
  status text
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  booking_date date not null,
  guests int not null default 1,
  created_at timestamptz default now() not null
);

alter table public.cart_items enable row level security;

create policy "Users can view own cart"
  on public.cart_items for select using (auth.uid() = user_id);

create policy "Users can add to own cart"
  on public.cart_items for insert with check (auth.uid() = user_id);

create policy "Users can update own cart items"
  on public.cart_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own cart items"
  on public.cart_items for delete using (auth.uid() = user_id);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'test_actor') then
    create role test_actor login;
  end if;
end
$$;

grant usage on schema public to test_actor;
grant select, insert, update, delete on public.listings, public.cart_items to test_actor;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'supplier@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'traveler@example.com');

insert into public.listings (id, supplier_id, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'published'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'draft');

-- GAP: traveler can plant cart row on draft pre-fix
begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);

do $$
begin
  insert into public.cart_items (user_id, listing_id, booking_date, guests)
  values (
    '33333333-3333-3333-3333-333333333333',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '2026-10-01',
    2
  );
  raise notice 'GAP CONFIRMED: pre-fix policy let traveler plant cart row on draft listing';
exception
  when others then
    raise exception 'TEST SETUP INVALID: pre-fix draft insert unexpectedly blocked (%)', sqlerrm;
end
$$;
rollback;

\ir ../migrations/113_cart_items_published_only_and_prune.sql

-- POST-FIX draft insert blocked
begin;
set local role test_actor;
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', true);

do $$
begin
  begin
    insert into public.cart_items (user_id, listing_id, booking_date, guests)
    values (
      '33333333-3333-3333-3333-333333333333',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      '2026-10-01',
      2
    );
    raise exception 'REGRESSION: post-fix still allowed draft cart insert';
  exception
    when sqlstate 'P0001' then raise;
    when others then raise notice 'post-fix draft insert correctly blocked: %', sqlerrm;
  end;
end
$$;

-- Genuine published insert OK
insert into public.cart_items (id, user_id, listing_id, booking_date, guests)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '2026-10-02',
  1
);

do $$
begin
  if not exists (
    select 1 from public.cart_items where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ) then
    raise exception 'REGRESSION: genuine published cart insert wrongly rejected';
  end if;
end
$$;
rollback;

-- Trigger prune (as table owner / migration role)
insert into public.cart_items (user_id, listing_id, booking_date, guests)
values (
  '33333333-3333-3333-3333-333333333333',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '2026-10-03',
  1
);

update public.listings set status = 'draft'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $$
begin
  if exists (
    select 1 from public.cart_items
    where listing_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) then
    raise exception 'REGRESSION: trigger did not prune cart_items on unpublish';
  end if;
  raise notice 'trigger correctly pruned cart_items on unpublish';
end
$$;

select 'ALL ASSERTIONS PASSED (113)' as result;
