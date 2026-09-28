-- Phase 1513: promote paid under the same advisory lock as assert_checkout_inventory.
-- Previously webhook/reconcile called assert in one transaction then UPDATE paid in
-- another. After hold expiry, Traveler B could claim_pending between those calls and
-- both rows would occupy inventory (oversell). claim_pending already asserts+inserts
-- atomically; paid promotion must match.

CREATE OR REPLACE FUNCTION public.promote_paid_checkout_booking(
  p_booking_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_paid numeric,
  p_currency text,
  p_paid_at timestamptz,
  p_purchase_snapshot jsonb DEFAULT NULL,
  p_assert_start_time time DEFAULT NULL,
  p_assert_booking_option_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%rowtype;
  v_updated uuid;
  v_session text := nullif(trim(coalesce(p_checkout_session_id, '')), '');
  v_option text := nullif(trim(coalesce(p_assert_booking_option_id, '')), '');
  v_check_out date;
BEGIN
  IF p_booking_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'booking_required');
  END IF;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_required');
  END IF;

  SELECT * INTO v_row
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF lower(coalesce(v_row.payment_status, '')) = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_paid');
  END IF;

  IF lower(coalesce(v_row.payment_status, '')) = 'refunded' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_refunded');
  END IF;

  IF lower(coalesce(v_row.status, '')) = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cancelled');
  END IF;

  IF lower(coalesce(v_row.payment_status, '')) NOT IN ('pending', 'failed') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_promotable',
      'payment_status', v_row.payment_status
    );
  END IF;

  IF nullif(trim(coalesce(v_row.checkout_session_id, '')), '') IS NOT NULL
     AND trim(v_row.checkout_session_id) <> v_session THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_mismatch');
  END IF;

  -- Inventory assert + paid UPDATE share this transaction's advisory xact lock.
  IF v_row.listing_id IS NOT NULL
     AND v_row.booking_date IS NOT NULL
     AND coalesce(v_row.guests, 0) >= 1 THEN
    v_check_out := CASE
      WHEN v_row.check_out IS NOT NULL AND v_row.check_out > v_row.booking_date THEN v_row.check_out
      ELSE NULL
    END;
    PERFORM public.assert_checkout_inventory(
      v_row.listing_id,
      v_row.booking_date,
      v_row.guests,
      v_check_out,
      v_row.id,
      coalesce(p_assert_start_time, v_row.start_time),
      coalesce(v_option, v_row.booking_option_id)
    );
  END IF;

  UPDATE public.bookings
  SET
    status = 'confirmed',
    payment_status = 'paid',
    payment_provider = 'stripe',
    checkout_session_id = v_session,
    payment_intent_id = nullif(trim(coalesce(p_payment_intent_id, '')), ''),
    amount_paid = p_amount_paid,
    currency = upper(nullif(trim(coalesce(p_currency, '')), '')),
    paid_at = coalesce(p_paid_at, now()),
    purchase_snapshot = coalesce(p_purchase_snapshot, purchase_snapshot)
  WHERE id = p_booking_id
    AND payment_status IN ('pending', 'failed')
    AND coalesce(status, '') IS DISTINCT FROM 'cancelled'
    AND (
      nullif(trim(coalesce(checkout_session_id, '')), '') IS NULL
      OR trim(checkout_session_id) = v_session
    )
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'update_race');
  END IF;

  RETURN jsonb_build_object('ok', true, 'booking_id', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_paid_checkout_booking(
  uuid, text, text, numeric, text, timestamptz, jsonb, time, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_paid_checkout_booking(
  uuid, text, text, numeric, text, timestamptz, jsonb, time, text
) TO service_role;

COMMENT ON FUNCTION public.promote_paid_checkout_booking(
  uuid, text, text, numeric, text, timestamptz, jsonb, time, text
) IS
  'Phase 1513: assert_checkout_inventory + paid UPDATE in one transaction so expired-hold races cannot oversell between assert and promote.';
