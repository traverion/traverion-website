-- Booking: total amount and currency (for display before payment; filled when payment is added)
-- Run after 010

alter table public.bookings
  add column if not exists total_amount numeric,
  add column if not exists currency text default 'USD';

comment on column public.bookings.total_amount is 'Total charged or to be paid; set when payment is integrated';
comment on column public.bookings.currency is 'Currency for total_amount';
