-- Phase 1524: stay_booking_check_out uses purchase_snapshot.checkOut before +1 fallback.
--
-- BEFORE: column → nights → booking_date+1. Paid stays with only snapshot.checkOut (no
-- column/nights) under-counted occupancy vs TS that previously read notes.
-- AFTER: column → nights → snapshot.checkOut ISO → +1. Notes never expand range
-- (parity with stayRangeFromBooking Phase 1524 / booking_is_stay_night Phase 1523).

create or replace function public.stay_booking_check_out(p_booking public.bookings)
returns date
language sql
immutable
as $$
  select case
    when p_booking.check_out is not null and p_booking.check_out > p_booking.booking_date
      then p_booking.check_out::date
    when p_booking.nights is not null and p_booking.nights >= 1
      then (p_booking.booking_date + p_booking.nights)::date
    when coalesce(nullif(trim(p_booking.purchase_snapshot->>'checkOut'), ''), '')
      ~ '^\d{4}-\d{2}-\d{2}$'
      and (p_booking.purchase_snapshot->>'checkOut')::date > p_booking.booking_date
      then (p_booking.purchase_snapshot->>'checkOut')::date
    else (p_booking.booking_date + 1)::date
  end;
$$;

comment on function public.stay_booking_check_out(public.bookings) is
  'Phase 1524: exclusive stay check-out = column → nights → purchase_snapshot.checkOut → +1 (never notes).';
