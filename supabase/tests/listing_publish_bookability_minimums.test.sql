-- Regression for migration 101 (publish bookability floor).
-- Manual scratch Postgres:
--   createdb traverion_test_101
--   psql -d traverion_test_101 -f supabase/tests/listing_publish_bookability_minimums.test.sql
--   dropdb traverion_test_101

\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

drop table if exists public.listings cascade;
drop table if exists public.supplier_profiles cascade;

create table public.supplier_profiles (
  id uuid primary key,
  verification_status text,
  payout_verification_status text
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid,
  status text default 'draft' check (status in ('draft', 'published')),
  title text,
  image text,
  city text,
  country text,
  price_starting_from numeric not null default 0,
  listing_extras jsonb default '{}'::jsonb
);

-- Stub 082 so verified suppliers can attempt publish.
create or replace function public.enforce_listing_publish_verification()
returns trigger language plpgsql as $$
begin
  return new;
end;
$$;
create trigger listings_publish_verification_guard
  before insert or update on public.listings
  for each row execute function public.enforce_listing_publish_verification();

\ir ../migrations/095_listing_publish_content_minimums.sql

do $$
declare
  v_sid uuid := gen_random_uuid();
  v_id uuid;
begin
  insert into public.supplier_profiles values (v_sid, 'verified', 'verified');

  -- PRE-101: 095 alone allows publish with city/country/real image but no bookable surface.
  insert into public.listings (supplier_id, status, title, image, city, country, price_starting_from, listing_extras)
  values (
    v_sid,
    'published',
    'Hollow tour',
    'https://example.com/real-hero.jpg',
    'Rovaniemi',
    'Finland',
    0,
    '{"inventoryFamily":"tour","bookingOptions":[]}'::jsonb
  )
  returning id into v_id;

  if (select status from public.listings where id = v_id) <> 'published' then
    raise exception 'SETUP FAILED: expected 095-only hollow publish to succeed';
  end if;
  raise notice 'GAP CONFIRMED: 095 alone published a tour with no bookable surface';
end $$;

\ir ../migrations/101_listing_publish_bookability_minimums.sql

do $$
declare
  v_sid uuid := gen_random_uuid();
  v_ok boolean;
begin
  insert into public.supplier_profiles values (v_sid, 'verified', 'verified');

  begin
    insert into public.listings (supplier_id, status, title, image, city, country, price_starting_from, listing_extras)
    values (
      v_sid, 'published', 'Hollow tour 2', 'https://example.com/real-hero.jpg',
      'Rovaniemi', 'Finland', 0,
      '{"inventoryFamily":"tour","bookingOptions":[]}'::jsonb
    );
    raise exception 'EXPECTED FAIL: hollow tour should not publish after 101';
  exception when others then
    if sqlerrm not like '%bookable option%' then
      raise;
    end if;
  end;

  begin
    insert into public.listings (supplier_id, status, title, image, city, country, price_starting_from, listing_extras)
    values (
      v_sid, 'published', 'Draft-only schedules', 'https://example.com/real-hero.jpg',
      'Rovaniemi', 'Finland', 0,
      jsonb_build_object(
        'inventoryFamily', 'tour',
        'bookingOptions', jsonb_build_array(
          jsonb_build_object(
            'id', 'o1',
            'name', 'Shared',
            'priceUsd', 0,
            'schedules', jsonb_build_array(
              jsonb_build_object('id', 's1', 'status', 'draft', 'priceUsd', 99)
            )
          )
        )
      )
    );
    raise exception 'EXPECTED FAIL: draft-only schedules should not publish';
  exception when others then
    if sqlerrm not like '%bookable option%' then
      raise;
    end if;
  end;

  insert into public.listings (supplier_id, status, title, image, city, country, price_starting_from, listing_extras)
  values (
    v_sid, 'published', 'Ready schedule tour', 'https://example.com/real-hero.jpg',
    'Rovaniemi', 'Finland', 89,
    jsonb_build_object(
      'inventoryFamily', 'tour',
      'bookingOptions', jsonb_build_array(
        jsonb_build_object(
          'id', 'o1',
          'name', 'Shared',
          'priceUsd', 89,
          'schedules', jsonb_build_array(
            jsonb_build_object('id', 's1', 'status', 'ready', 'priceUsd', 89, 'startTime', '20:30')
          )
        )
      )
    )
  );

  begin
    insert into public.listings (supplier_id, status, title, image, city, country, price_starting_from, listing_extras)
    values (
      v_sid, 'published', 'Hollow stay', 'https://example.com/stay.jpg',
      'Rovaniemi', 'Finland', 0,
      '{"inventoryFamily":"stay","stay":{"nightlyPriceUsd":0,"maxGuests":0}}'::jsonb
    );
    raise exception 'EXPECTED FAIL: hollow stay should not publish';
  exception when others then
    if sqlerrm not like '%nightly price%' then
      raise;
    end if;
  end;

  insert into public.listings (supplier_id, status, title, image, city, country, price_starting_from, listing_extras)
  values (
    v_sid, 'published', 'Ready stay', 'https://example.com/stay.jpg',
    'Rovaniemi', 'Finland', 145,
    '{"inventoryFamily":"stay","stay":{"nightlyPriceUsd":145,"maxGuests":4}}'::jsonb
  );

  select public.listing_has_bookable_tour_surface(
    '{"bookingOptions":[{"schedules":[{"status":"ready","priceUsd":10}]}]}'::jsonb, 0
  ) into v_ok;
  if not v_ok then raise exception 'helper tour ready schedule should be bookable'; end if;

  raise notice 'ALL ASSERTIONS PASSED';
end $$;
