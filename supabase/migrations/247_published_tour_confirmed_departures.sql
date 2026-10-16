-- Confirmed paid departures only. Live holds and unpaid checkout do not qualify.
CREATE OR REPLACE FUNCTION public.published_tour_confirmed_departures(p_listing_id uuid)
RETURNS TABLE(departure date, start_time_hm text, booking_option_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    b.booking_date::date AS departure,
    public.booking_inventory_start_time_hm(b.purchase_snapshot, b.start_time) AS start_time_hm,
    nullif(trim(coalesce(b.booking_option_id, '')), '') AS booking_option_id
  FROM public.bookings b
  INNER JOIN public.listings l ON l.id = b.listing_id
  WHERE b.listing_id = p_listing_id
    AND l.status = 'published'
    AND b.booking_date IS NOT NULL
    AND b.status IS DISTINCT FROM 'cancelled'
    AND lower(coalesce(b.payment_status, '')) IN ('paid', 'complete', 'succeeded');
$$;

REVOKE ALL ON FUNCTION public.published_tour_confirmed_departures(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_tour_confirmed_departures(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.published_tour_confirmed_departures(uuid) IS
  'Date, purchased start time, and option id for confirmed paid bookings. Does not include holds or unpaid checkout.';
