-- Optional special requests on bookings (for supplier view)
-- Run after 003

alter table public.bookings
  add column if not exists special_requests text;

comment on column public.bookings.special_requests is 'Optional message from guest at booking time';
