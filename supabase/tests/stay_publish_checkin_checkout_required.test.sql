-- Scratch verification for migration 102 (stay check-in/out on publish).
-- Run against a throwaway schema that already has 095/101 stubs when available.

begin;

create schema if not exists test_102;
set search_path to test_102, public;

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  status text,
  city text,
  country text,
  image text,
  price_starting_from numeric,
  listing_extras jsonb
);

-- Apply function body from 102 (simplified harness assumes 101 helpers exist remotely).
-- Local harness: redefine stay surface only.
create or replace function listing_has_bookable_stay_surface(p_extras jsonb, p_starting numeric)
returns boolean
language sql
immutable
as $$
  select
    coalesce(nullif(p_extras->'stay'->>'nightlyPriceUsd', '')::numeric, coalesce(p_starting, 0)) > 0
    and coalesce(nullif(p_extras->'stay'->>'maxGuests', '')::int, 0) >= 1
    and coalesce(p_extras->'stay'->>'checkInTime', '') ~ '^\d{2}:\d{2}$'
    and coalesce(p_extras->'stay'->>'checkOutTime', '') ~ '^\d{2}:\d{2}$';
$$;

do $$
begin
  if listing_has_bookable_stay_surface(
    '{"stay":{"nightlyPriceUsd":120,"maxGuests":4}}'::jsonb,
    120
  ) then
    raise exception 'expected false without check-in/out';
  end if;
  if not listing_has_bookable_stay_surface(
    '{"stay":{"nightlyPriceUsd":120,"maxGuests":4,"checkInTime":"16:00","checkOutTime":"11:00"}}'::jsonb,
    120
  ) then
    raise exception 'expected true with check-in/out';
  end if;
end $$;

rollback;
