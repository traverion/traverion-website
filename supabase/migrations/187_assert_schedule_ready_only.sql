-- Phase 1286: schedule slot caps only from status=ready rows (quote scheduleIsBookable parity).
-- Rebuilds assert_checkout_inventory from 186.


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
  v_option_min_persons integer;
  v_option_max_persons integer;
  v_group_size text;
  v_group_min integer;
  v_group_max integer;
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
        AND (sch->>'status') = 'ready'
        AND public.normalize_tour_start_time_hm(sch->>'startTime') = v_slot_hm
        AND nullif(trim(coalesce(sch->>'availabilityDateFrom', '')), '') IS NOT NULL
        AND (nullif(trim(sch->>'availabilityDateFrom'), ''))::date <= p_check_in
        AND (
          coalesce(nullif(sch->>'availabilityDateTo', ''), '9999-12-31')::date >= p_check_in
        )
        AND jsonb_typeof(sch->'weekdays') = 'array'
        AND jsonb_array_length(sch->'weekdays') >= 7
        AND (sch->'weekdays'->v_weekday_idx) = 'true'::jsonb
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
        AND (sch->>'status') = 'ready'
        AND nullif(trim(coalesce(sch->>'availabilityDateFrom', '')), '') IS NOT NULL
        AND (nullif(trim(sch->>'availabilityDateFrom'), ''))::date <= p_check_in
        AND (
          coalesce(nullif(sch->>'availabilityDateTo', ''), '9999-12-31')::date >= p_check_in
        )
        AND jsonb_typeof(sch->'weekdays') = 'array'
        AND jsonb_array_length(sch->'weekdays') >= 7
        AND (sch->'weekdays'->v_weekday_idx) = 'true'::jsonb
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

  -- Phase 1237: party min/max from matching schedule when option has schedules.
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

    IF coalesce(v_option_has_schedules, false) THEN
      SELECT
        CASE
          WHEN jsonb_typeof(sch->'minPersons') = 'number'
            AND (sch->>'minPersons')::numeric >= 1
          THEN floor((sch->>'minPersons')::numeric)::int
          ELSE 1
        END,
        CASE
          WHEN jsonb_typeof(sch->'maxPersons') = 'number'
            AND (sch->>'maxPersons')::numeric >= 1
          THEN floor((sch->>'maxPersons')::numeric)::int
          ELSE NULL
        END
      INTO v_option_min_persons, v_option_max_persons
      FROM public.listings l
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(l.listing_extras->'bookingOptions', '[]'::jsonb)
      ) opt
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(opt->'schedules', '[]'::jsonb)
      ) sch
      WHERE l.id = p_listing_id
        AND nullif(trim(coalesce(opt->>'id', '')), '') = v_option_id
        AND (sch->>'status') = 'ready'
        AND nullif(trim(coalesce(sch->>'availabilityDateFrom', '')), '') IS NOT NULL
        AND (nullif(trim(sch->>'availabilityDateFrom'), ''))::date <= p_check_in
        AND (
          coalesce(nullif(sch->>'availabilityDateTo', ''), '9999-12-31')::date >= p_check_in
        )
        AND jsonb_typeof(sch->'weekdays') = 'array'
        AND jsonb_array_length(sch->'weekdays') >= 7
        AND (sch->'weekdays'->v_weekday_idx) = 'true'::jsonb
        AND (
          v_slot_hm IS NULL
          OR public.normalize_tour_start_time_hm(sch->>'startTime') = v_slot_hm
        )
      ORDER BY
        CASE
          WHEN v_slot_hm IS NOT NULL
            AND public.normalize_tour_start_time_hm(sch->>'startTime') = v_slot_hm
          THEN 0
          ELSE 1
        END,
        CASE
          WHEN jsonb_typeof(sch->'maxPersons') = 'number'
            AND (sch->>'maxPersons')::numeric >= 1
          THEN floor((sch->>'maxPersons')::numeric)::int
          ELSE 2147483647
        END
      LIMIT 1;
    ELSE
      SELECT
        CASE
          WHEN jsonb_typeof(opt->'minPersons') = 'number'
            AND (opt->>'minPersons')::numeric >= 1
          THEN floor((opt->>'minPersons')::numeric)::int
          ELSE 1
        END,
        CASE
          WHEN jsonb_typeof(opt->'maxPersons') = 'number'
            AND (opt->>'maxPersons')::numeric >= 1
          THEN floor((opt->>'maxPersons')::numeric)::int
          ELSE NULL
        END
      INTO v_option_min_persons, v_option_max_persons
      FROM public.listings l
      CROSS JOIN LATERAL jsonb_array_elements(
        coalesce(l.listing_extras->'bookingOptions', '[]'::jsonb)
      ) opt
      WHERE l.id = p_listing_id
        AND nullif(trim(coalesce(opt->>'id', '')), '') = v_option_id
      LIMIT 1;
    END IF;

    IF v_option_max_persons IS NULL THEN
      RAISE EXCEPTION 'Guest capacity is unavailable for this tour.';
    END IF;
    IF p_guests < coalesce(v_option_min_persons, 1) THEN
      RAISE EXCEPTION 'At least % guests are required for this tour.', coalesce(v_option_min_persons, 1);
    END IF;
    IF p_guests > v_option_max_persons THEN
      RAISE EXCEPTION 'No more than % guests allowed for this tour.', v_option_max_persons;
    END IF;
  ELSE
    -- Phase 1242: no option id → party bounds from group_size (edge quote 1228 parity).
    SELECT nullif(trim(coalesce(l.group_size, '')), '')
      INTO v_group_size
    FROM public.listings l
    WHERE l.id = p_listing_id;

    IF v_group_size IS NULL OR NOT public.listing_group_size_is_parseable(v_group_size) THEN
      RAISE EXCEPTION 'Guest capacity is unavailable for this tour.';
    END IF;

    v_group_min := greatest(
      1,
      substring(v_group_size from '(\d+)\s*[-–]\s*\d+')::int
    );
    v_group_max := least(
      99,
      substring(v_group_size from '\d+\s*[-–]\s*(\d+)')::int
    );

    IF v_group_max < v_group_min THEN
      RAISE EXCEPTION 'Guest capacity is unavailable for this tour.';
    END IF;
    IF p_guests < v_group_min THEN
      RAISE EXCEPTION 'At least % guests are required for this tour.', v_group_min;
    END IF;
    IF p_guests > v_group_max THEN
      RAISE EXCEPTION 'No more than % guests allowed for this tour.', v_group_max;
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
  'Checkout inventory assert; schedule caps require availabilityDateFrom (Phase 1285).'
