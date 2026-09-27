-- Phase 1152: claim_pending_checkout_booking rejects listing owner/team self-holds
-- (defense-in-depth for 1146 edge + 1147 PDP guards).

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
  v_supplier uuid;
BEGIN
  SELECT l.supplier_id INTO v_supplier
  FROM public.listings l
  WHERE l.id = p_listing_id;

  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF p_guest_user_id IS NOT NULL AND (
    p_guest_user_id = v_supplier
    OR EXISTS (
      SELECT 1
      FROM public.supplier_team_members stm
      WHERE stm.supplier_id = v_supplier::text
        AND stm.user_id = p_guest_user_id::text
    )
  ) THEN
    RAISE EXCEPTION 'You cannot book your own listing.';
  END IF;

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
  'Creates unpaid pending booking under assert_checkout_inventory; rejects owner/team self-book (Phase 1152).';
