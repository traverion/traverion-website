-- First-class stay nights on bookings.
-- Tours keep booking_date as the departure day and leave check_out null.

alter table public.bookings
  add column if not exists check_out date,
  add column if not exists nights integer,
  add column if not exists nightly_amount numeric,
  add column if not exists cleaning_fee numeric;

comment on column public.bookings.check_out is
  'Stay check-out date (exclusive of the night). Null for tour bookings.';
comment on column public.bookings.nights is
  'Stay length in nights. Null for tour bookings.';
comment on column public.bookings.nightly_amount is
  'Authoritative nightly rate used for the stay quote. Null for tours.';
comment on column public.bookings.cleaning_fee is
  'Stay cleaning fee included in total_amount. Null or 0 when none.';

alter table public.bookings
  drop constraint if exists bookings_stay_nights_positive;
alter table public.bookings
  add constraint bookings_stay_nights_positive
  check (nights is null or nights >= 1);

alter table public.bookings
  drop constraint if exists bookings_stay_check_out_after_in;
alter table public.bookings
  add constraint bookings_stay_check_out_after_in
  check (check_out is null or booking_date is null or check_out > booking_date);

-- Backfill from the transitional check_out: YYYY-MM-DD line in special_requests.
update public.bookings
set check_out = (regexp_match(special_requests, 'check_out:\s*(\d{4}-\d{2}-\d{2})'))[1]::date
where check_out is null
  and special_requests ~ 'check_out:\s*\d{4}-\d{2}-\d{2}';

update public.bookings
set nights = (check_out - booking_date)
where check_out is not null
  and booking_date is not null
  and check_out > booking_date
  and nights is null;

create index if not exists bookings_stay_range_idx
  on public.bookings (listing_id, booking_date, check_out)
  where check_out is not null and status is distinct from 'cancelled';
