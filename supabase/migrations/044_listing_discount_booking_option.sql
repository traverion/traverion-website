-- Optional scope: discount applies only to a specific booking option (listing_extras.bookingOptions[].id).
alter table public.listing_discounts
  add column if not exists booking_option_id text null;

comment on column public.listing_discounts.booking_option_id is
  'When set, discount applies only to this booking option id; null = all options (legacy listing-wide).';
