-- Per-departure (slot) tour inventory for multi-time same-day schedules.
-- Extends assert_checkout_inventory + claim_pending with optional start_time.
-- Adds public paid-guest counts keyed by date + start time.

CREATE OR REPLACE FUNCTION public.normalize_tour_start_time_hm(p_time time)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_time IS NULL THEN NULL
    ELSE to_char(p_time, 'HH24:MI')
  END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_tour_start_time_hm(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN NULL
    WHEN btrim(p_text) ~ '^\d{1,2}:\d{2}' THEN
      lpad(split_part(btrim(p_text), ':', 1), 2, '0')
      || ':'
      || substring(split_part(btrim(p_text), ':', 2) from 1 for 2)
    ELSE NULL
  END;
$$;

DROP FUNCTION IF EXISTS public.assert_checkout_inventory(uuid, date, integer, date, uuid);

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

  v_slot_hm := public.normalize_tour_start_time_hm(p_start_time);

  SELECT la.capacity
    INTO v_capacity
  FROM public.listing_availability la
  WHERE la.listing_id = p_listing_id
    AND la.available_date = p_check_in;

  IF FOUND THEN
    -- Day-level override remains day-wide occupancy.
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
  'Stay nights: paid/live-hold overlap. Tours: day-level listing_availability stays day-wide; otherwise optional p_start_time scopes capacity and occupancy to that departure slot.';

-- Rebuild claim to pass start_time into assert + insert.
DROP FUNCTION IF EXISTS public.claim_pending_checkout_booking(
  uuid, text, text, integer, date, date, text, numeric, text, uuid, text, integer, numeric, numeric, timestamptz
);

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
    p_start_time
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

REVOKE ALL ON FUNCTION public.claim_pending_checkout_booking(
  uuid, text, text, integer, date, date, text, numeric, text, uuid, text, integer, numeric, numeric, timestamptz, time
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_checkout_booking(
  uuid, text, text, integer, date, date, text, numeric, text, uuid, text, integer, numeric, numeric, timestamptz, time
) TO service_role;

CREATE OR REPLACE FUNCTION public.published_tour_paid_guests_by_slot(p_listing_id uuid)
RETURNS TABLE(departure date, start_time_hm text, paid_guests integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.booking_date::date AS departure,
    public.normalize_tour_start_time_hm(b.start_time) AS start_time_hm,
    coalesce(sum(b.guests), 0)::integer AS paid_guests
  FROM public.bookings b
  INNER JOIN public.listings l ON l.id = b.listing_id
  WHERE b.listing_id = p_listing_id
    AND l.status = 'published'
    AND b.booking_date IS NOT NULL
    AND b.status IS DISTINCT FROM 'cancelled'
    AND lower(coalesce(b.payment_status, '')) IN ('paid', 'complete', 'succeeded')
  GROUP BY b.booking_date::date, public.normalize_tour_start_time_hm(b.start_time);
$$;

REVOKE ALL ON FUNCTION public.published_tour_paid_guests_by_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_tour_paid_guests_by_slot(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.published_tour_paid_guests_by_slot(uuid) IS
  'Paid guest counts per tour date + start time for public remaining-spot display. Null start_time groups as NULL.';
