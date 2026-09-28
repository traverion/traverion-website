-- Phase 1523: booking_is_stay_night must not trust notes-only check_out:.
--
-- BEFORE: special_requests ~* 'check_out:\s*\d{4}-\d{2}-\d{2}' classified a tour as a
-- stay, so cancel_booking_as_traveler used stay check-in (default 16:00) instead of
-- purchased tour startTimeHm — wrong 24h free-refund window after client-planted keys
-- (Phase 1522 blocks new claims; existing/resume rows can still carry planted lines).
--
-- AFTER: stay = check_out column OR nights >= 1 OR purchase_snapshot.checkOut ISO date.
-- Notes alone never flip tour→stay cancel/refund math.

create or replace function public.booking_is_stay_night(p_booking public.bookings)
returns boolean
language sql
immutable
as $$
  select
    p_booking.check_out is not null
    or (p_booking.nights is not null and p_booking.nights >= 1)
    or coalesce(nullif(trim(p_booking.purchase_snapshot->>'checkOut'), ''), '')
      ~ '^\d{4}-\d{2}-\d{2}$';
$$;

comment on function public.booking_is_stay_night(public.bookings) is
  'Phase 1523: stay = check_out column OR nights >= 1 OR purchase_snapshot.checkOut ISO — never notes-only check_out: (client bookingIsStayNight parity).';
