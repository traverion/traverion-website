-- Public stay calendar shows nights travelers actually booked (paid).
-- Pending/failed Stripe checkouts still hold inventory at checkout via assert_checkout_inventory,
-- but must not paint the listing calendar as occupied.

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
    AND b.status IS DISTINCT FROM 'cancelled'
    AND lower(coalesce(b.payment_status, '')) IN ('paid', 'complete', 'succeeded');
$$;

REVOKE ALL ON FUNCTION public.published_stay_occupied_ranges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_stay_occupied_ranges(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.published_stay_occupied_ranges(uuid) IS
  'Paid stay nights for the public calendar. Unpaid and failed checkouts are omitted.';
