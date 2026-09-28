-- Phase 1554: stay_booking_check_out prefers later of nights vs snapshot when column null.
--
-- BEFORE: column → nights → snapshot → +1. Stale short nights (e.g. 2) beat a longer
-- purchase_snapshot.checkOut (e.g. 2026-12-05), under-counting occupancy vs paid truth.
--
-- AFTER: column → greatest(nights-derived, snapshot) when both set → nights → snap → +1.

create or replace function public.stay_booking_check_out(p_booking public.bookings)
returns date
language sql
immutable
as $$
  select case
    when p_booking.check_out is not null and p_booking.check_out > p_booking.booking_date
      then p_booking.check_out::date
    when p_booking.nights is not null and p_booking.nights >= 1
         and coalesce(nullif(trim(p_booking.purchase_snapshot->>'checkOut'), ''), '')
           ~ '^\d{4}-\d{2}-\d{2}$'
         and (p_booking.purchase_snapshot->>'checkOut')::date > p_booking.booking_date
      then greatest(
        (p_booking.booking_date + p_booking.nights)::date,
        (p_booking.purchase_snapshot->>'checkOut')::date
      )
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
  'Phase 1554: exclusive stay check-out = column → max(nights, snapshot) → nights → snapshot → +1 (never notes).';
