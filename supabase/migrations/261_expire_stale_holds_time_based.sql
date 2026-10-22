-- Fix Instant Book × expire_stale_checkout_holds interaction after mig 257.
--
-- BEFORE: expire_stale marked pending rows where NOT booking_occupies_inventory.
-- After 257, Instant Book unpaid pending never occupies, so every
-- assert_checkout_inventory call (claim/promote) immediately flipped ALL live
-- Instant Book checkouts on the listing to payment_status=failed — including the
-- booking under assert and concurrent open Stripe sessions.
--
-- AFTER: expire only when the checkout hold window has actually ended
-- (hold_expires_at, or 30 minutes from created_at when hold_expires_at is null).
-- Authorized Request-to-Book (payment_status=authorized) is untouched.

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
    AND CASE
      WHEN b.hold_expires_at IS NOT NULL THEN b.hold_expires_at <= now()
      ELSE coalesce(b.created_at, now()) <= now() - interval '30 minutes'
    END;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_checkout_holds(uuid) IS
  'Mark Instant Book pending checkouts failed only after hold_expires_at (or 30m created_at fallback). Must not use booking_occupies_inventory — unpaid Instant Book never occupies (mig 257).';

REVOKE ALL ON FUNCTION public.expire_stale_checkout_holds(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_checkout_holds(uuid) TO service_role;
