-- Optional option id for authoritative checkout quotes (nullable for legacy rows).
alter table public.bookings
  add column if not exists booking_option_id text;

comment on column public.bookings.booking_option_id is
  'listing_extras.bookingOptions[].id used to price this booking; null = listing-wide / legacy.';
