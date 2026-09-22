-- Align public stay calendar blocking with checkout inventory:
-- paid + live checkout holds occupy nights; refunded/failed/expired do not.

CREATE OR REPLACE FUNCTION public.published_stay_occupied_ranges(p_listing_id uuid)
RETURNS TABLE(check_in date, check_out date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.booking_date::date AS check_in,
    public.stay_booking_check_out(b) AS check_out
  FROM public.bookings b
  INNER JOIN public.listings l ON l.id = b.listing_id
  WHERE b.listing_id = p_listing_id
    AND l.status = 'published'
    AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at);
$$;

REVOKE ALL ON FUNCTION public.published_stay_occupied_ranges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_stay_occupied_ranges(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.published_stay_occupied_ranges(uuid) IS
  'Stay nights blocked on the public calendar: paid bookings and live checkout holds (no guest PII). Matches assert_checkout_inventory occupancy.';
