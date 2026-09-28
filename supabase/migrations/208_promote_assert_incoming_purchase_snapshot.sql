-- Phase 1568: promote asserts stay inventory after merging p_purchase_snapshot.
--
-- BEFORE: stay_booking_check_out(v_row) used the locked row only; assert could pass
-- a short column while the same UPDATE wrote a longer webhook snapshot checkOut.
--
-- AFTER: coalesce incoming snapshot onto v_row before stay detect / check-out / assert.

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
  v_stay_check_out date := NULL;
  v_stay_nights integer := NULL;
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

  -- Phase 1568: fold webhook snapshot before stay range / inventory assert.
  IF p_purchase_snapshot IS NOT NULL THEN
    v_row.purchase_snapshot := p_purchase_snapshot;
  END IF;

  IF public.booking_is_stay_night(v_row) THEN
    v_stay_check_out := public.stay_booking_check_out(v_row);
    IF v_stay_check_out IS NOT NULL
       AND v_row.booking_date IS NOT NULL
       AND v_stay_check_out > v_row.booking_date THEN
      v_stay_nights := (v_stay_check_out - v_row.booking_date);
    END IF;
  END IF;

  IF lower(coalesce(v_row.payment_status, '')) = 'paid' THEN
    IF v_stay_check_out IS NOT NULL
       AND (
         v_row.check_out IS NULL
         OR v_row.nights IS NULL
         OR (v_stay_nights IS NOT NULL AND v_row.nights IS DISTINCT FROM v_stay_nights)
         OR (v_row.check_out IS DISTINCT FROM v_stay_check_out)
       ) THEN
      UPDATE public.bookings
      SET
        check_out = v_stay_check_out,
        nights = CASE
          WHEN v_stay_nights IS NOT NULL THEN v_stay_nights
          ELSE nights
        END,
        purchase_snapshot = coalesce(p_purchase_snapshot, purchase_snapshot)
      WHERE id = p_booking_id;
    ELSIF p_purchase_snapshot IS NOT NULL THEN
      UPDATE public.bookings
      SET purchase_snapshot = coalesce(p_purchase_snapshot, purchase_snapshot)
      WHERE id = p_booking_id;
    END IF;
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

  IF v_row.listing_id IS NOT NULL
     AND v_row.booking_date IS NOT NULL
     AND coalesce(v_row.guests, 0) >= 1 THEN
    IF public.booking_is_stay_night(v_row) THEN
      v_check_out := coalesce(v_stay_check_out, public.stay_booking_check_out(v_row));
    ELSE
      v_check_out := CASE
        WHEN v_row.check_out IS NOT NULL AND v_row.check_out > v_row.booking_date THEN v_row.check_out
        ELSE NULL
      END;
    END IF;
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
    purchase_snapshot = coalesce(p_purchase_snapshot, purchase_snapshot),
    check_out = coalesce(v_stay_check_out, check_out),
    nights = CASE
      WHEN v_stay_nights IS NOT NULL THEN v_stay_nights
      ELSE nights
    END
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

COMMENT ON FUNCTION public.promote_paid_checkout_booking(
  uuid, text, text, numeric, text, timestamptz, jsonb, time, text
) IS
  'Phase 1568: merge p_purchase_snapshot before stay_booking_check_out + assert; then paid UPDATE.';
