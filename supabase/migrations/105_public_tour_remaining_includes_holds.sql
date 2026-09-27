-- Align public tour remaining/sold-out with checkout inventory occupancy.
-- Paid + live checkout holds occupy seats; failed/expired/refunded/cancelled do not.
-- Matches published_stay_occupied_ranges (079) and assert_checkout_inventory.
-- Keep RPC names for client compatibility; column alias paid_guests retained.

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
    AND public.booking_occupies_inventory(
      b.status,
      b.payment_status,
      b.hold_expires_at,
      b.created_at
    )
  GROUP BY b.booking_date::date;
$$;

REVOKE ALL ON FUNCTION public.published_tour_paid_guests(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_tour_paid_guests(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.published_tour_paid_guests(uuid) IS
  'Inventory-occupying guest counts per tour departure for the public calendar (paid + live checkout holds). Failed, expired, cancelled, and refunded bookings are omitted. Matches assert_checkout_inventory.';

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
    AND public.booking_occupies_inventory(
      b.status,
      b.payment_status,
      b.hold_expires_at,
      b.created_at
    )
  GROUP BY b.booking_date::date, public.normalize_tour_start_time_hm(b.start_time);
$$;

REVOKE ALL ON FUNCTION public.published_tour_paid_guests_by_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_tour_paid_guests_by_slot(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.published_tour_paid_guests_by_slot(uuid) IS
  'Inventory-occupying guest counts per tour date + start time for public remaining-spot display (paid + live holds). Null start_time groups as NULL. Matches assert_checkout_inventory.';
