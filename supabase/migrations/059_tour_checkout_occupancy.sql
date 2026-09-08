-- Tour checkout must count paid guests + live pending holds even when
-- listing_availability has no row for the departure. Failed checkouts
-- still do not occupy. Stay nights keep the overlap path.

CREATE OR REPLACE FUNCTION public.booking_occupies_inventory(
  p_status text,
  p_payment_status text,
  p_hold_expires_at timestamptz,
  p_created_at timestamptz
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    coalesce(p_status, '') IS DISTINCT FROM 'cancelled'
    AND CASE lower(coalesce(p_payment_status, 'pending'))
      WHEN 'paid' THEN true
      WHEN 'complete' THEN true
      WHEN 'succeeded' THEN true
      WHEN 'pending' THEN
        CASE
          WHEN p_hold_expires_at IS NOT NULL THEN p_hold_expires_at > now()
          ELSE coalesce(p_created_at, now()) > now() - interval '30 minutes'
        END
      ELSE false
    END;
$$;

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
  v_capacity integer;
  v_option_cap integer;
  v_occupied integer;
  v_remaining integer;
  v_lock_key bigint;
BEGIN
  IF p_listing_id IS NULL OR p_check_in IS NULL THEN
    RAISE EXCEPTION 'Listing and date are required.';
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
        AND coalesce(b.check_out, (b.booking_date + 1)) > p_check_in
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
  'Stay nights: paid/live-hold overlap. Tour departures: capacity minus occupying guests (paid + live holds), using listing_availability.capacity or option maxSpotsPerSlot.';
