-- Pending Stripe checkouts hold inventory only until hold_expires_at.
-- Abandoned sessions must not occupy Tour spots or Stay nights indefinitely.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS bookings_hold_expires_at_pending_idx
  ON public.bookings (listing_id, hold_expires_at)
  WHERE payment_status = 'pending' AND status IS DISTINCT FROM 'cancelled';

COMMENT ON COLUMN public.bookings.hold_expires_at IS
  'When a pending Stripe checkout stop occupying inventory. Paid/refunded/failed ignore this.';

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
      WHEN 'pending' THEN
        CASE
          WHEN p_hold_expires_at IS NOT NULL THEN p_hold_expires_at > now()
          ELSE coalesce(p_created_at, now()) > now() - interval '30 minutes'
        END
      ELSE false
    END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_checkout_holds(p_listing_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.bookings b
  SET payment_status = 'failed'
  WHERE b.payment_status = 'pending'
    AND b.status IS DISTINCT FROM 'cancelled'
    AND (p_listing_id IS NULL OR b.listing_id = p_listing_id)
    AND NOT public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_checkout_holds(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_checkout_holds(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid) TO service_role;

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
  v_booked integer;
  v_held integer;
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

  SELECT la.capacity, la.booked
    INTO v_capacity, v_booked
  FROM public.listing_availability la
  WHERE la.listing_id = p_listing_id
    AND la.available_date = p_check_in;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(b.guests), 0)
    INTO v_held
  FROM public.bookings b
  WHERE b.listing_id = p_listing_id
    AND b.booking_date = p_check_in
    AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
    AND b.payment_status = 'pending'
    AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at);

  v_remaining := coalesce(v_capacity, 0) - coalesce(v_booked, 0) - coalesce(v_held, 0);
  IF v_remaining < p_guests THEN
    RAISE EXCEPTION 'Not enough capacity left for this date.';
  END IF;
END;
$$;

-- Claim inventory and insert the pending row in one locked transaction.
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
  p_hold_expires_at timestamptz
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
    NULL
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
    hold_expires_at
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
    p_hold_expires_at
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_checkout_booking(
  uuid, text, text, integer, date, date, text, numeric, text, uuid, text, integer, numeric, numeric, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_checkout_booking(
  uuid, text, text, integer, date, date, text, numeric, text, uuid, text, integer, numeric, numeric, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.published_stay_occupied_ranges(p_listing_id uuid)
RETURNS TABLE(check_in date, check_out date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.booking_date::date AS check_in,
    COALESCE(b.check_out, (b.booking_date + 1))::date AS check_out
  FROM public.bookings b
  INNER JOIN public.listings l ON l.id = b.listing_id
  WHERE b.listing_id = p_listing_id
    AND l.status = 'published'
    AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at);
$$;
