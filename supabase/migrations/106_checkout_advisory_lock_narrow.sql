-- Narrow checkout advisory locks:
-- Stays: listing-scoped (date ranges can overlap any night).
-- Tours with day-level listing_availability override: listing+date.
-- Tours with departure start_time and no day override: listing+date+slot.
-- Tours without start_time: listing+date.
-- Safety unchanged: still serializes competing claims for the same inventory unit.

CREATE OR REPLACE FUNCTION public.assert_checkout_inventory(
  p_listing_id uuid,
  p_check_in date,
  p_guests integer,
  p_check_out date DEFAULT NULL,
  p_exclude_booking_id uuid DEFAULT NULL,
  p_start_time time DEFAULT NULL
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
  v_slot_cap integer;
  v_occupied integer;
  v_remaining integer;
  v_slot_hm text;
  v_has_day_override boolean := false;
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

  PERFORM public.expire_stale_checkout_holds(p_listing_id);

  IF p_check_out IS NOT NULL AND p_check_out > p_check_in THEN
    v_lock_key := hashtext('stay|' || p_listing_id::text)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);

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

  v_slot_hm := public.normalize_tour_start_time_hm(p_start_time);

  SELECT la.capacity
    INTO v_capacity
  FROM public.listing_availability la
  WHERE la.listing_id = p_listing_id
    AND la.available_date = p_check_in;

  v_has_day_override := FOUND;

  IF v_has_day_override OR v_slot_hm IS NULL THEN
    v_lock_key := hashtext(
      'tour|' || p_listing_id::text || '|' || p_check_in::text
    )::bigint;
  ELSE
    v_lock_key := hashtext(
      'tour|' || p_listing_id::text || '|' || p_check_in::text || '|' || v_slot_hm
    )::bigint;
  END IF;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_has_day_override THEN
    SELECT coalesce(sum(b.guests), 0)
      INTO v_occupied
    FROM public.bookings b
    WHERE b.listing_id = p_listing_id
      AND b.booking_date = p_check_in
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
      AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at);
  ELSE
    IF v_slot_hm IS NOT NULL THEN
      SELECT max((sch->>'maxSpotsPerSlot')::int)
        INTO v_slot_cap
      FROM public.listings l
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(l.listing_extras->'bookingOptions', '[]'::jsonb)
      ) opt
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(opt->'schedules', '[]'::jsonb)
      ) sch
      WHERE l.id = p_listing_id
        AND jsonb_typeof(sch->'maxSpotsPerSlot') = 'number'
        AND (sch->>'status') IS DISTINCT FROM 'draft'
        AND public.normalize_tour_start_time_hm(sch->>'startTime') = v_slot_hm
        AND (
          coalesce(nullif(sch->>'availabilityDateFrom', ''), '0001-01-01')::date <= p_check_in
        )
        AND (
          coalesce(nullif(sch->>'availabilityDateTo', ''), '9999-12-31')::date >= p_check_in
        );

      IF v_slot_cap IS NULL THEN
        SELECT max((opt->>'maxSpotsPerSlot')::int)
          INTO v_slot_cap
        FROM public.listings l
        CROSS JOIN LATERAL jsonb_array_elements(
          coalesce(l.listing_extras->'bookingOptions', '[]'::jsonb)
        ) opt
        WHERE l.id = p_listing_id
          AND jsonb_typeof(opt->'maxSpotsPerSlot') = 'number'
          AND (
            opt->'schedules' IS NULL
            OR jsonb_typeof(opt->'schedules') <> 'array'
            OR jsonb_array_length(opt->'schedules') = 0
          );
      END IF;
      v_capacity := coalesce(v_slot_cap, 8);
    ELSE
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
        UNION ALL
        SELECT (sch->>'maxSpotsPerSlot')::int AS spots
        FROM public.listings l
        CROSS JOIN LATERAL jsonb_array_elements(
          coalesce(l.listing_extras->'bookingOptions', '[]'::jsonb)
        ) opt
        CROSS JOIN LATERAL jsonb_array_elements(
          coalesce(opt->'schedules', '[]'::jsonb)
        ) sch
        WHERE l.id = p_listing_id
          AND jsonb_typeof(sch->'maxSpotsPerSlot') = 'number'
          AND (sch->>'status') IS DISTINCT FROM 'draft'
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
      AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at)
      AND (
        v_slot_hm IS NULL
        OR public.normalize_tour_start_time_hm(b.start_time) = v_slot_hm
      );
  END IF;

  v_remaining := coalesce(v_capacity, 0) - coalesce(v_occupied, 0);
  IF v_remaining < p_guests THEN
    IF v_slot_hm IS NOT NULL THEN
      RAISE EXCEPTION 'Not enough capacity left for this departure.';
    END IF;
    RAISE EXCEPTION 'Not enough capacity left for this date.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid, time) TO service_role;

COMMENT ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid, time) IS
  'Stay nights: listing-scoped lock + paid/live-hold overlap. Tours: day override locks listing+date; otherwise optional p_start_time locks listing+date+slot. Capacity rules unchanged from 076.';
