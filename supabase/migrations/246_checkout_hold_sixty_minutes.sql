-- Fallback occupancy window when a pending row has no hold_expires_at.
-- New checkout sessions always set hold_expires_at (60 minutes, matching
-- Stripe Checkout expires_at). This fallback only covers legacy rows.

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
      WHEN 'complete' THEN true
      WHEN 'succeeded' THEN true
      WHEN 'pending' THEN
        CASE
          WHEN p_hold_expires_at IS NOT NULL THEN p_hold_expires_at > now()
          ELSE coalesce(p_created_at, now()) > now() - interval '60 minutes'
        END
      ELSE false
    END;
$$;
