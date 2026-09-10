-- Stay occupancy: when check_out is missing, use nights before falling back to +1 day.
-- Aligns SQL assert/public calendar with stayRangeFromBooking (Phase 121/122).

CREATE OR REPLACE FUNCTION public.stay_booking_check_out(p_booking public.bookings)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_booking.check_out IS NOT NULL AND p_booking.check_out > p_booking.booking_date
      THEN p_booking.check_out::date
    WHEN p_booking.nights IS NOT NULL AND p_booking.nights >= 1
      THEN (p_booking.booking_date + p_booking.nights)::date
    ELSE (p_booking.booking_date + 1)::date
  END;
$$;

COMMENT ON FUNCTION public.stay_booking_check_out(public.bookings) IS
  'Exclusive stay check-out: check_out column, else booking_date + nights, else +1 day.';

CREATE OR REPLACE FUNCTION public.assert_checkout_inventory(
  p_listing_id uuid,
  p_check_in date,
  p_guests integer,
  p_check_out date DEFAULT NULL,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key bigint;
  v_capacity integer;
  v_option_cap integer;
  v_occupied integer;
  v_remaining integer;
BEGIN
  IF p_listing_id IS NULL THEN
    RAISE EXCEPTION 'Listing is required.';
  END IF;
  IF p_check_in IS NULL THEN
    RAISE EXCEPTION 'Check-in date is required.';
  END IF;
  IF p_guests IS NULL OR p_guests < 1 THEN
    RAISE EXCEPTION 'Guest count is invalid.';
  END IF;

  v_lock_key := hashtext(p_listing_id::text)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);
  PERFORM public.expire_stale_checkout_holds(p_listing_id);

  IF p_check_out IS NOT NULL AND p_check_out > p_check_in THEN
    IF EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.listing_id = p_listing_id
        AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
        AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at)
        AND b.booking_date < p_check_out
        AND public.stay_booking_check_out(b) > p_check_in
    ) THEN
      RAISE EXCEPTION 'Those nights are already booked.';
    END IF;
    RETURN;
  END IF;

  SELECT la.capacity
    INTO v_capacity
  FROM public.listing_availability la
  WHERE la.listing_id = p_listing_id
    AND la.available_date = p_check_in;

  IF NOT FOUND THEN
    SELECT max(spots)
      INTO v_option_cap
    FROM (
      SELECT (opt->>'maxSpotsPerSlot')::int AS spots
      FROM public.listings l
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(l.listing_extras->'bookingOptions', '[]'::jsonb)
      ) opt
      WHERE l.id = p_listing_id
        AND jsonb_typeof(opt->'maxSpotsPerSlot') = 'number'
    ) s
    WHERE spots >= 1;
    v_capacity := coalesce(v_option_cap, 8);
  END IF;

  SELECT coalesce(sum(b.guests), 0)
    INTO v_occupied
  FROM public.bookings b
  WHERE b.listing_id = p_listing_id
    AND b.booking_date = p_check_in
    AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
    AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at);

  v_remaining := coalesce(v_capacity, 0) - coalesce(v_occupied, 0);
  IF v_remaining < p_guests THEN
    RAISE EXCEPTION 'Not enough capacity left for this date.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid) TO service_role;

COMMENT ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid) IS
  'Stay nights: paid/live-hold overlap (check_out or nights). Tour departures: capacity minus occupying guests (paid + live holds).';

CREATE OR REPLACE FUNCTION public.published_stay_occupied_ranges(p_listing_id uuid)
RETURNS TABLE(check_in date, check_out date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.booking_date::date AS check_in,
    public.stay_booking_check_out(b) AS check_out
  FROM public.bookings b
  INNER JOIN public.listings l ON l.id = b.listing_id
  WHERE b.listing_id = p_listing_id
    AND l.status = 'published'
    AND lower(trim(coalesce(b.payment_status, ''))) IN ('paid', 'complete', 'succeeded')
    AND lower(trim(coalesce(b.status, ''))) <> 'cancelled';
$$;

REVOKE ALL ON FUNCTION public.published_stay_occupied_ranges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_stay_occupied_ranges(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.published_stay_occupied_ranges(uuid) IS
  'Paid stay nights for the public calendar. Uses check_out or nights. Unpaid, failed, and refunded bookings are omitted.';
