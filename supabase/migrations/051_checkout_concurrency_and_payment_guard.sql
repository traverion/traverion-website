-- Checkout concurrency + traveler cannot forge payment fields.
-- Idempotent. Does not reset data.

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

  IF p_check_out IS NOT NULL AND p_check_out > p_check_in THEN
    IF EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.listing_id = p_listing_id
        AND b.status IS DISTINCT FROM 'cancelled'
        AND coalesce(b.payment_status, 'pending') IS DISTINCT FROM 'failed'
        AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
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
    AND b.status IS DISTINCT FROM 'cancelled'
    AND coalesce(b.payment_status, 'pending') = 'pending'
    AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id);

  v_remaining := coalesce(v_capacity, 0) - coalesce(v_booked, 0) - coalesce(v_held, 0);
  IF v_remaining < p_guests THEN
    RAISE EXCEPTION 'Not enough capacity left for this date.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.bookings_protect_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text := coalesce(auth.role(), '');
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF v_role IN ('service_role', '') THEN
    RETURN NEW;
  END IF;
  NEW.payment_status := OLD.payment_status;
  NEW.amount_paid := OLD.amount_paid;
  NEW.checkout_session_id := OLD.checkout_session_id;
  NEW.payment_intent_id := OLD.payment_intent_id;
  NEW.paid_at := OLD.paid_at;
  NEW.total_amount := OLD.total_amount;
  NEW.currency := OLD.currency;
  NEW.listing_id := OLD.listing_id;
  NEW.guest_user_id := OLD.guest_user_id;
  NEW.guest_email := OLD.guest_email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_bookings_protect_payment_fields ON public.bookings;
CREATE TRIGGER tr_bookings_protect_payment_fields
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_protect_payment_fields();

DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated travelers can create own bookings" ON public.bookings;
CREATE POLICY "Authenticated travelers can create own bookings"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND guest_user_id = auth.uid()
    AND coalesce(payment_status, 'pending') IN ('pending', 'failed')
    AND coalesce(amount_paid, 0) = 0
  );

-- Public SELECT on supplier_profiles leaked IBAN, tax IDs, and document paths.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.supplier_profiles;
DROP POLICY IF EXISTS "Owners can read own supplier profile" ON public.supplier_profiles;
CREATE POLICY "Owners can read own supplier profile"
  ON public.supplier_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.supplier_public_legal(p_id uuid)
RETURNS TABLE (
  display_name text,
  company_legal_name text,
  business_address text,
  business_logo_url text,
  privacy_policy_text text,
  terms_conditions_text text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.display_name,
    p.company_legal_name,
    p.business_address,
    p.business_logo_url,
    p.privacy_policy_text,
    p.terms_conditions_text
  FROM public.supplier_profiles p
  WHERE p.id = p_id;
$$;

REVOKE ALL ON FUNCTION public.supplier_public_legal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_public_legal(uuid) TO anon, authenticated;
