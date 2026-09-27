-- Phase 1233: Tour option maxPersons required (parity with stay maxGuests in 161).
-- Rebuilds assert_checkout_inventory from 163: when p_booking_option_id is set,
-- missing/invalid option maxPersons fails closed (no silent skip).

CREATE OR REPLACE FUNCTION public.assert_checkout_inventory(
  p_listing_id uuid,
  p_check_in date,
  p_guests integer,
  p_check_out date DEFAULT NULL,
  p_exclude_booking_id uuid DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_booking_option_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key bigint;
  v_capacity integer;
  v_day_cap integer;
  v_option_cap integer;
  v_slot_cap integer;
  v_occupied integer;
  v_day_occupied integer;
  v_remaining integer;
  v_slot_hm text;
  v_has_day_override boolean := false;
  v_option_id text := nullif(trim(coalesce(p_booking_option_id, '')), '');
  v_weekday_idx integer := (EXTRACT(ISODOW FROM p_check_in)::int) - 1;
  v_option_has_schedules boolean := false;
  v_max_guests integer;
  v_option_max_persons integer;
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
      FROM public.listing_availability la
      WHERE la.listing_id = p_listing_id
        AND la.available_date >= p_check_in
        AND la.available_date < p_check_out
        AND coalesce(la.capacity, 0) <= 0
    ) THEN
      RAISE EXCEPTION 'Those nights are blocked.';
    END IF;

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

    -- Phase 1221: stay party cap (no invent-99).
    SELECT
      CASE
        WHEN jsonb_typeof(l.listing_extras->'stay'->'maxGuests') = 'number'
          AND (l.listing_extras->'stay'->>'maxGuests')::numeric >= 1
        THEN floor((l.listing_extras->'stay'->>'maxGuests')::numeric)::int
        ELSE NULL
      END
    INTO v_max_guests
    FROM public.listings l
    WHERE l.id = p_listing_id;

    IF v_max_guests IS NULL THEN
      RAISE EXCEPTION 'Guest capacity is unavailable for this stay.';
    END IF;
    IF p_guests > v_max_guests THEN
      RAISE EXCEPTION 'This stay allows up to % guests.', v_max_guests;
    END IF;
    RETURN;
  END IF;

  v_slot_hm := public.normalize_tour_start_time_hm(p_start_time);

  SELECT la.capacity
    INTO v_day_cap
  FROM public.listing_availability la
  WHERE la.listing_id = p_listing_id
    AND la.available_date = p_check_in;

  v_has_day_override := FOUND;

  IF v_has_day_override THEN
    v_lock_key := hashtext(
      'tour|' || p_listing_id::text || '|' || p_check_in::text
    )::bigint;
  ELSIF v_slot_hm IS NOT NULL THEN
    v_lock_key := hashtext(
      'tour|' || p_listing_id::text || '|' || p_check_in::text || '|' || v_slot_hm
    )::bigint;
  ELSE
    v_lock_key := hashtext(
      'tour|' || p_listing_id::text || '|' || p_check_in::text
    )::bigint;
  END IF;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_slot_hm IS NOT NULL THEN
    IF v_option_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.listings l
        CROSS JOIN LATERAL jsonb_array_elements(
          coalesce(l.listing_extras->'bookingOptions', '[]'::jsonb)
        ) opt
        WHERE l.id = p_listing_id
          AND nullif(trim(coalesce(opt->>'id', '')), '') = v_option_id
          AND jsonb_typeof(opt->'schedules') = 'array'
          AND jsonb_array_length(opt->'schedules') > 0
      )
      INTO v_option_has_schedules;
    END IF;

    SELECT min(spots)
      INTO v_slot_cap
    FROM (
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
        AND (sch->>'maxSpotsPerSlot')::int >= 1
        AND (sch->>'status') IS DISTINCT FROM 'draft'
        AND public.normalize_tour_start_time_hm(sch->>'startTime') = v_slot_hm
        AND (
          coalesce(nullif(sch->>'availabilityDateFrom', ''), '0001-01-01')::date <= p_check_in
        )
        AND (
          coalesce(nullif(sch->>'availabilityDateTo', ''), '9999-12-31')::date >= p_check_in
        )
        AND (
          jsonb_typeof(sch->'weekdays') IS DISTINCT FROM 'array'
          OR jsonb_array_length(sch->'weekdays') < 7
          OR (sch->'weekdays'->v_weekday_idx) IS DISTINCT FROM 'false'::jsonb
        )
        AND (
          v_option_id IS NULL
          OR nullif(trim(coalesce(opt->>'id', '')), '') = v_option_id
        )
    ) s;

    IF v_slot_cap IS NULL AND NOT coalesce(v_option_has_schedules, false) THEN
      SELECT min(spots)
        INTO v_slot_cap
      FROM (
        SELECT (opt->>'maxSpotsPerSlot')::int AS spots
        FROM public.listings l
        CROSS JOIN LATERAL jsonb_array_elements(
          coalesce(l.listing_extras->'bookingOptions', '[]'::jsonb)
        ) opt
        WHERE l.id = p_listing_id
          AND jsonb_typeof(opt->'maxSpotsPerSlot') = 'number'
          AND (opt->>'maxSpotsPerSlot')::int >= 1
          AND (
            opt->'schedules' IS NULL
            OR jsonb_typeof(opt->'schedules') <> 'array'
            OR jsonb_array_length(opt->'schedules') = 0
          )
          AND (
            v_option_id IS NULL
            OR nullif(trim(coalesce(opt->>'id', '')), '') = v_option_id
          )
      ) o;
    END IF;

    -- Phase 1124: unresolved slot/option cap → fail closed (no invent-8).
    IF v_slot_cap IS NULL THEN
      RAISE EXCEPTION 'No bookable capacity for this departure.';
    END IF;
    v_capacity := v_slot_cap;

    SELECT coalesce(sum(b.guests), 0)
      INTO v_occupied
    FROM public.bookings b
    WHERE b.listing_id = p_listing_id
      AND b.booking_date = p_check_in
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
      AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at)
      AND public.booking_inventory_start_time_hm(b.purchase_snapshot, b.start_time) = v_slot_hm;

    v_remaining := coalesce(v_capacity, 0) - coalesce(v_occupied, 0);

    IF v_has_day_override THEN
      SELECT coalesce(sum(b.guests), 0)
        INTO v_day_occupied
      FROM public.bookings b
      WHERE b.listing_id = p_listing_id
        AND b.booking_date = p_check_in
        AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
        AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at);
      v_remaining := LEAST(
        v_remaining,
        coalesce(v_day_cap, 0) - coalesce(v_day_occupied, 0)
      );
    END IF;
  ELSIF v_has_day_override THEN
    v_capacity := v_day_cap;
    SELECT coalesce(sum(b.guests), 0)
      INTO v_occupied
    FROM public.bookings b
    WHERE b.listing_id = p_listing_id
      AND b.booking_date = p_check_in
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
      AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at);
    v_remaining := coalesce(v_capacity, 0) - coalesce(v_occupied, 0);
  ELSE
    SELECT min(spots)
      INTO v_option_cap
    FROM (
      SELECT (opt->>'maxSpotsPerSlot')::int AS spots
      FROM public.listings l
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(l.listing_extras->'bookingOptions', '[]'::jsonb)
      ) opt
      WHERE l.id = p_listing_id
        AND jsonb_typeof(opt->'maxSpotsPerSlot') = 'number'
        AND (opt->>'maxSpotsPerSlot')::int >= 1
        AND (
          v_option_id IS NULL
          OR nullif(trim(coalesce(opt->>'id', '')), '') = v_option_id
        )
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
        AND (sch->>'maxSpotsPerSlot')::int >= 1
        AND (sch->>'status') IS DISTINCT FROM 'draft'
        AND (
          coalesce(nullif(sch->>'availabilityDateFrom', ''), '0001-01-01')::date <= p_check_in
        )
        AND (
          coalesce(nullif(sch->>'availabilityDateTo', ''), '9999-12-31')::date >= p_check_in
        )
        AND (
          jsonb_typeof(sch->'weekdays') IS DISTINCT FROM 'array'
          OR jsonb_array_length(sch->'weekdays') < 7
          OR (sch->'weekdays'->v_weekday_idx) IS DISTINCT FROM 'false'::jsonb
        )
        AND (
          v_option_id IS NULL
          OR nullif(trim(coalesce(opt->>'id', '')), '') = v_option_id
        )
    ) s
    WHERE spots >= 1;

    -- Phase 1124: unresolved day-wide option cap → fail closed (no invent-8).
    IF v_option_cap IS NULL THEN
      RAISE EXCEPTION 'No bookable capacity for this departure.';
    END IF;
    v_capacity := v_option_cap;

    SELECT coalesce(sum(b.guests), 0)
      INTO v_occupied
    FROM public.bookings b
    WHERE b.listing_id = p_listing_id
      AND b.booking_date = p_check_in
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
      AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at);
    v_remaining := coalesce(v_capacity, 0) - coalesce(v_occupied, 0);
  END IF;

  -- Phase 1233: option party max required when option id is known (stay 161 parity).
  IF v_option_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN jsonb_typeof(opt->'maxPersons') = 'number'
          AND (opt->>'maxPersons')::numeric >= 1
        THEN floor((opt->>'maxPersons')::numeric)::int
        ELSE NULL
      END
    INTO v_option_max_persons
    FROM public.listings l
    CROSS JOIN LATERAL jsonb_array_elements(
      coalesce(l.listing_extras->'bookingOptions', '[]'::jsonb)
    ) opt
    WHERE l.id = p_listing_id
      AND nullif(trim(coalesce(opt->>'id', '')), '') = v_option_id
    LIMIT 1;

    IF v_option_max_persons IS NULL THEN
      RAISE EXCEPTION 'Guest capacity is unavailable for this tour.';
    END IF;
    IF p_guests > v_option_max_persons THEN
      RAISE EXCEPTION 'No more than % guests allowed for this tour.', v_option_max_persons;
    END IF;
  END IF;

  IF v_remaining < p_guests THEN
    IF v_slot_hm IS NOT NULL THEN
      RAISE EXCEPTION 'Not enough capacity left for this departure.';
    END IF;
    RAISE EXCEPTION 'Not enough capacity left for this date.';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid, time, text) IS
  'Stay: blocked nights + overlap (1115) + maxGuests (1221). Tours: weekday+option slot caps (1121); unresolved caps fail closed — no invent-8 (1124); option maxPersons required (1233). Day-override dual budget (1113).';
