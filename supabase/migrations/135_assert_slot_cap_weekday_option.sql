-- Phase 1121: Assert tour slot caps from date-applicable schedules (weekdays + option).
--
-- Prior assert took MAX(maxSpotsPerSlot) across all non-draft schedules matching
-- startTime + date range only — ignoring weekdays and booking_option_id. Quote /
-- checkout edge use tourDepartureSlotCapacity (weekday + option), so claim and
-- Stripe promote could authorize more seats than the marketed departure.
--
-- After: optional p_booking_option_id scopes the option; weekday filter mirrors
-- scheduleAppliesOnDate (Mon-first boolean[7]); with schedules present, fail
-- closed when none apply; without option id, use MIN of applicable caps (safer
-- than MAX). claim_pending passes its p_booking_option_id through.

DROP FUNCTION IF EXISTS public.assert_checkout_inventory(uuid, date, integer, date, uuid, time);

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
  v_weekday_idx integer := (EXTRACT(ISODOW FROM p_check_in)::int) - 1; -- 0=Mon .. 6=Sun
  v_option_has_schedules boolean := false;
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

    -- Applicable schedule caps: weekday + date range + startTime (+ option when known).
    -- With option id: take that option's matching schedule maxSpots (MIN if duplicates).
    -- Without option id: MIN across applicable schedules (never MAX — that oversold).
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

    IF v_slot_cap IS NULL THEN
      IF v_option_id IS NOT NULL OR coalesce(v_option_has_schedules, false) THEN
        RAISE EXCEPTION 'No bookable capacity for this departure.';
      END IF;
      v_capacity := 8;
    ELSE
      v_capacity := v_slot_cap;
    END IF;

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

    IF v_option_cap IS NULL AND v_option_id IS NOT NULL THEN
      RAISE EXCEPTION 'No bookable capacity for this departure.';
    END IF;
    v_capacity := coalesce(v_option_cap, 8);

    SELECT coalesce(sum(b.guests), 0)
      INTO v_occupied
    FROM public.bookings b
    WHERE b.listing_id = p_listing_id
      AND b.booking_date = p_check_in
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
      AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at);
    v_remaining := coalesce(v_capacity, 0) - coalesce(v_occupied, 0);
  END IF;

  IF v_remaining < p_guests THEN
    IF v_slot_hm IS NOT NULL THEN
      RAISE EXCEPTION 'Not enough capacity left for this departure.';
    END IF;
    RAISE EXCEPTION 'Not enough capacity left for this date.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid, time, text) TO service_role;

COMMENT ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid, time, text) IS
  'Stay: blocked nights + overlap (1115). Tours: slot cap from weekday+option-applicable schedules (Phase 1121); day-override dual budget (1113). Occupancy remains shared by purchased startTimeHm.';

-- Thread booking_option_id into assert from claim_pending.
CREATE OR REPLACE FUNCTION public.claim_pending_checkout_booking(
  p_listing_id uuid,
  p_guest_email text,
  p_guest_name text,
  p_guests integer,
  p_booking_date date,
  p_check_out date,
  p_special_requests text,
  p_total_amount numeric,
  p_currency text,
  p_guest_user_id uuid,
  p_booking_option_id text,
  p_nights integer,
  p_nightly_amount numeric,
  p_cleaning_fee numeric,
  p_hold_expires_at timestamptz,
  p_start_time time DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  PERFORM public.assert_checkout_inventory(
    p_listing_id,
    p_booking_date,
    p_guests,
    p_check_out,
    NULL,
    p_start_time,
    p_booking_option_id
  );

  INSERT INTO public.bookings (
    listing_id,
    guest_email,
    guest_name,
    guests,
    booking_date,
    check_out,
    nights,
    nightly_amount,
    cleaning_fee,
    status,
    special_requests,
    total_amount,
    currency,
    guest_user_id,
    payment_status,
    payment_provider,
    booking_option_id,
    hold_expires_at,
    start_time
  ) VALUES (
    p_listing_id,
    p_guest_email,
    p_guest_name,
    p_guests,
    p_booking_date,
    p_check_out,
    p_nights,
    p_nightly_amount,
    p_cleaning_fee,
    'pending',
    p_special_requests,
    p_total_amount,
    p_currency,
    p_guest_user_id,
    'pending',
    'stripe',
    p_booking_option_id,
    p_hold_expires_at,
    p_start_time
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

COMMENT ON FUNCTION public.claim_pending_checkout_booking(
  uuid, text, text, integer, date, date, text, numeric, text, uuid, text, integer, numeric, numeric, timestamptz, time
) IS
  'Creates unpaid pending booking under assert_checkout_inventory (Phase 1121 passes booking_option_id for weekday/option slot caps).';
