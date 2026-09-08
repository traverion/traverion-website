-- Public tour remaining capacity from paid bookings only.
-- Failed and unpaid checkouts must not make a departure look sold out.

CREATE OR REPLACE FUNCTION public.published_tour_paid_guests(p_listing_id uuid)
RETURNS TABLE(departure date, paid_guests integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.booking_date::date AS departure,
    coalesce(sum(b.guests), 0)::integer AS paid_guests
  FROM public.bookings b
  INNER JOIN public.listings l ON l.id = b.listing_id
  WHERE b.listing_id = p_listing_id
    AND l.status = 'published'
    AND b.booking_date IS NOT NULL
    AND b.status IS DISTINCT FROM 'cancelled'
    AND lower(coalesce(b.payment_status, '')) IN ('paid', 'complete', 'succeeded')
  GROUP BY b.booking_date::date;
$$;

REVOKE ALL ON FUNCTION public.published_tour_paid_guests(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_tour_paid_guests(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.published_tour_paid_guests(uuid) IS
  'Paid guest counts per tour departure for the public calendar. Failed checkouts are omitted.';
