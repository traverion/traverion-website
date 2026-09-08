-- Traverion product default currency is EUR.
-- Listings created while the app defaulted to USD are corrected in place.
-- Numeric amounts are not changed. Paid Stripe TEST charges remain USD inside Stripe;
-- booking.currency is aligned to the listing so catalog, confirmation, Trips, and Money agree.

ALTER TABLE public.supplier_profiles
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'EUR';

ALTER TABLE public.supplier_profiles
  DROP CONSTRAINT IF EXISTS supplier_profiles_default_currency_iso;
ALTER TABLE public.supplier_profiles
  ADD CONSTRAINT supplier_profiles_default_currency_iso
  CHECK (default_currency ~ '^[A-Z]{3}$');

UPDATE public.listings
SET price_currency = 'EUR'
WHERE upper(btrim(coalesce(price_currency, 'USD'))) = 'USD';

UPDATE public.bookings b
SET currency = l.price_currency
FROM public.listings l
WHERE b.listing_id = l.id
  AND upper(btrim(coalesce(b.currency, 'USD'))) = 'USD'
  AND upper(btrim(l.price_currency)) = 'EUR';

-- Occupied stay nights for public detail (no guest PII). Checkout night is exclusive.
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
    AND b.status IS DISTINCT FROM 'cancelled';
$$;

REVOKE ALL ON FUNCTION public.published_stay_occupied_ranges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.published_stay_occupied_ranges(uuid) TO anon, authenticated;
