-- Phase 1279: Pickup window columns must allow unset (NULL).
-- Migration 025 used NOT NULL DEFAULT 0/30, so every insert looked “configured”
-- even when partners never chose a window (client 1253 writes null; DB coerced).
-- Drop NOT NULL / defaults first, then clear the legacy invent pair.
-- Disable publish content guard for the data backfill only (published stays
-- missing private address would otherwise block the UPDATE).

alter table public.listings
  alter column pickup_window_minutes_before_min drop not null,
  alter column pickup_window_minutes_before_min drop default,
  alter column pickup_window_minutes_before_max drop not null,
  alter column pickup_window_minutes_before_max drop default;

alter table public.listings disable trigger listings_publish_content_minimums_guard;

update public.listings
set
  pickup_window_minutes_before_min = null,
  pickup_window_minutes_before_max = null
where pickup_window_minutes_before_min = 0
  and pickup_window_minutes_before_max = 30;

alter table public.listings enable trigger listings_publish_content_minimums_guard;

comment on column public.listings.pickup_window_minutes_before_min is
  'Pickup may be from this many minutes before start (inclusive). NULL = unset (Phase 1279).';
comment on column public.listings.pickup_window_minutes_before_max is
  'Pickup may be up to this many minutes before start (inclusive). NULL = unset (Phase 1279).';
