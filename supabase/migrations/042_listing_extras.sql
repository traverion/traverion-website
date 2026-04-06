-- Structured optional fields for supplier listings (good-to-know, gallery URLs, schedule hints, cancellation preset metadata).
alter table public.listings
  add column if not exists listing_extras jsonb default '{}'::jsonb;

comment on column public.listings.listing_extras is 'App-defined JSON: gallery URLs, accessibility, schedule style, cancellation preset, capacity note, etc.';
