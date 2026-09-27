-- Phase 1279: Pickup window columns must allow unset (NULL).
-- Migration 025 used NOT NULL DEFAULT 0/30, so every insert looked “configured”
-- even when partners never chose a window (client 1253 writes null; DB coerced).
-- Clear the legacy invent pair, then drop NOT NULL / defaults.

update public.listings
set
  pickup_window_minutes_before_min = null,
  pickup_window_minutes_before_max = null
where pickup_window_minutes_before_min = 0
  and pickup_window_minutes_before_max = 30;

alter table public.listings
  alter column pickup_window_minutes_before_min drop not null,
  alter column pickup_window_minutes_before_min drop default,
  alter column pickup_window_minutes_before_max drop not null,
  alter column pickup_window_minutes_before_max drop default;

comment on column public.listings.pickup_window_minutes_before_min is
  'Pickup may be from this many minutes before start (inclusive). NULL = unset (Phase 1279).';
comment on column public.listings.pickup_window_minutes_before_max is
  'Pickup may be up to this many minutes before start (inclusive). NULL = unset (Phase 1279).';
