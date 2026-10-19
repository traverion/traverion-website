-- Stay Request to Book: authorize after checkout, capture on host accept, expire after 24h.

-- Promote checkout with manual capture (PaymentIntent requires_capture) → authorized pending approval.
CREATE OR REPLACE FUNCTION public.promote_authorized_checkout_booking(
  p_booking_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_authorized numeric,
  p_currency text,
  p_approval_expires_at timestamptz,
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
  v_row public.bookings%ROWTYPE;
  v_session text := trim(coalesce(p_checkout_session_id, ''));
  v_pi text := nullif(trim(coalesce(p_payment_intent_id, '')), '');
  v_option text := nullif(trim(coalesce(p_assert_booking_option_id, '')), '');
  v_check_out date;
  v_updated uuid;
  v_expires timestamptz := coalesce(p_approval_expires_at, now() + interval '24 hours');
BEGIN
  IF p_booking_id IS NULL OR v_session = '' OR v_pi IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_args');
  END IF;

  SELECT * INTO v_row FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF lower(coalesce(v_row.payment_status, '')) = 'authorized'
     AND lower(coalesce(v_row.approval_status, '')) = 'pending' THEN
    IF p_purchase_snapshot IS NOT NULL THEN
      UPDATE public.bookings
      SET purchase_snapshot = coalesce(p_purchase_snapshot, purchase_snapshot),
          payment_intent_id = coalesce(v_pi, payment_intent_id)
      WHERE id = p_booking_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'reason', 'already_authorized', 'booking_id', p_booking_id);
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

  IF v_row.listing_id IS NOT NULL
     AND v_row.booking_date IS NOT NULL
     AND coalesce(v_row.guests, 0) >= 1 THEN
    IF public.booking_is_stay_night(v_row) THEN
      v_check_out := public.stay_booking_check_out(v_row);
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
    status = 'pending',
    payment_status = 'authorized',
    payment_provider = 'stripe',
    checkout_session_id = v_session,
    payment_intent_id = v_pi,
    total_amount = coalesce(p_amount_authorized, total_amount),
    currency = upper(nullif(trim(coalesce(p_currency, '')), '')),
    approval_status = 'pending',
    approval_expires_at = v_expires,
    hold_expires_at = v_expires,
    approval_decided_at = NULL,
    approval_decided_by = NULL,
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

REVOKE ALL ON FUNCTION public.promote_authorized_checkout_booking(
  uuid, text, text, numeric, text, timestamptz, jsonb, time, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_authorized_checkout_booking(
  uuid, text, text, numeric, text, timestamptz, jsonb, time, text
) TO service_role;

COMMENT ON FUNCTION public.promote_authorized_checkout_booking(
  uuid, text, text, numeric, text, timestamptz, jsonb, time, text
) IS
  'Request-to-Book: after Stripe manual-capture auth, mark booking authorized with 24h approval window.';

-- Capture path: authorized + accepted → paid (used after PaymentIntent.capture succeeds).
CREATE OR REPLACE FUNCTION public.capture_stay_booking_request(
  p_booking_id uuid,
  p_actor_id uuid,
  p_amount_paid numeric,
  p_currency text,
  p_paid_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
  v_listing_supplier uuid;
  v_team boolean := false;
  v_updated uuid;
  v_check_out date;
BEGIN
  IF p_booking_id IS NULL OR p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_args');
  END IF;

  SELECT * INTO v_row FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF lower(coalesce(v_row.payment_status, '')) = 'paid'
     AND lower(coalesce(v_row.approval_status, '')) = 'accepted' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_captured', 'booking_id', p_booking_id);
  END IF;

  IF lower(coalesce(v_row.status, '')) = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cancelled');
  END IF;

  IF lower(coalesce(v_row.payment_status, '')) <> 'authorized'
     OR lower(coalesce(v_row.approval_status, '')) <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_acceptable',
      'payment_status', v_row.payment_status,
      'approval_status', v_row.approval_status
    );
  END IF;

  IF v_row.approval_expires_at IS NOT NULL AND v_row.approval_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  SELECT supplier_id INTO v_listing_supplier FROM public.listings WHERE id = v_row.listing_id;
  IF v_listing_supplier IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'listing_missing');
  END IF;

  IF v_listing_supplier = p_actor_id THEN
    v_team := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.supplier_team_members
      WHERE supplier_id = v_listing_supplier
        AND user_id = p_actor_id
        AND lower(coalesce(role, '')) IN ('owner', 'admin', 'editor')
    ) INTO v_team;
  END IF;

  IF NOT v_team THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF v_row.listing_id IS NOT NULL
     AND v_row.booking_date IS NOT NULL
     AND coalesce(v_row.guests, 0) >= 1 THEN
    IF public.booking_is_stay_night(v_row) THEN
      v_check_out := public.stay_booking_check_out(v_row);
    ELSE
      v_check_out := CASE
        WHEN v_row.check_out IS NOT NULL AND v_row.check_out > v_row.booking_date THEN v_row.check_out
        ELSE NULL
      END;
    END IF;
    -- Exclude self: this authorized row already occupies inventory.
    PERFORM public.assert_checkout_inventory(
      v_row.listing_id,
      v_row.booking_date,
      v_row.guests,
      v_check_out,
      v_row.id,
      v_row.start_time,
      v_row.booking_option_id
    );
  END IF;

  UPDATE public.bookings
  SET
    status = 'confirmed',
    payment_status = 'paid',
    amount_paid = p_amount_paid,
    currency = upper(nullif(trim(coalesce(p_currency, '')), '')),
    paid_at = coalesce(p_paid_at, now()),
    approval_status = 'accepted',
    approval_decided_at = now(),
    approval_decided_by = p_actor_id,
    hold_expires_at = NULL
  WHERE id = p_booking_id
    AND payment_status = 'authorized'
    AND approval_status = 'pending'
    AND coalesce(status, '') IS DISTINCT FROM 'cancelled'
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'update_race');
  END IF;

  RETURN jsonb_build_object('ok', true, 'booking_id', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.capture_stay_booking_request(uuid, uuid, numeric, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_stay_booking_request(uuid, uuid, numeric, text, timestamptz) TO service_role;

-- Decline / withdraw / expire: release authorization hold (caller cancels Stripe PI).
CREATE OR REPLACE FUNCTION public.release_stay_booking_request(
  p_booking_id uuid,
  p_actor_id uuid,
  p_action text,
  p_allow_guest boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.bookings%ROWTYPE;
  v_listing_supplier uuid;
  v_ok boolean := false;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_next_approval text;
  v_updated uuid;
BEGIN
  IF p_booking_id IS NULL OR v_action NOT IN ('decline', 'withdraw', 'expire') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_args');
  END IF;

  SELECT * INTO v_row FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF lower(coalesce(v_row.approval_status, '')) = v_action
     OR (v_action = 'expire' AND lower(coalesce(v_row.approval_status, '')) = 'expired') THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_done', 'booking_id', p_booking_id);
  END IF;

  IF lower(coalesce(v_row.payment_status, '')) <> 'authorized'
     OR lower(coalesce(v_row.approval_status, '')) <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_releasable');
  END IF;

  SELECT supplier_id INTO v_listing_supplier FROM public.listings WHERE id = v_row.listing_id;

  IF v_action = 'expire' THEN
    v_ok := true;
    v_next_approval := 'expired';
  ELSIF v_action = 'decline' THEN
    IF p_actor_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'missing_actor');
    END IF;
    IF v_listing_supplier = p_actor_id THEN
      v_ok := true;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.supplier_team_members
        WHERE supplier_id = v_listing_supplier
          AND user_id = p_actor_id
          AND lower(coalesce(role, '')) IN ('owner', 'admin', 'editor')
      ) INTO v_ok;
    END IF;
    v_next_approval := 'declined';
  ELSIF v_action = 'withdraw' THEN
    IF NOT coalesce(p_allow_guest, false) OR p_actor_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;
    v_ok := (
      v_row.guest_user_id IS NOT NULL AND v_row.guest_user_id = p_actor_id
    );
    v_next_approval := 'withdrawn';
  END IF;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    payment_status = 'failed',
    approval_status = v_next_approval,
    approval_decided_at = now(),
    approval_decided_by = p_actor_id,
    hold_expires_at = now()
  WHERE id = p_booking_id
    AND payment_status = 'authorized'
    AND approval_status = 'pending'
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'update_race');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', v_updated,
    'payment_intent_id', v_row.payment_intent_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_stay_booking_request(uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_stay_booking_request(uuid, uuid, text, boolean) TO service_role;

-- Batch expire pending requests past approval_expires_at (idempotent).
CREATE OR REPLACE FUNCTION public.expire_stay_booking_requests(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_pis text[] := ARRAY[]::text[];
BEGIN
  FOR r IN
    SELECT id, payment_intent_id
    FROM public.bookings
    WHERE approval_status = 'pending'
      AND payment_status = 'authorized'
      AND approval_expires_at IS NOT NULL
      AND approval_expires_at <= now()
      AND coalesce(status, '') IS DISTINCT FROM 'cancelled'
    ORDER BY approval_expires_at ASC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.bookings
    SET
      status = 'cancelled',
      payment_status = 'failed',
      approval_status = 'expired',
      approval_decided_at = now(),
      hold_expires_at = now()
    WHERE id = r.id
      AND approval_status = 'pending'
      AND payment_status = 'authorized';
    IF FOUND THEN
      v_count := v_count + 1;
      v_ids := array_append(v_ids, r.id);
      IF nullif(trim(coalesce(r.payment_intent_id, '')), '') IS NOT NULL THEN
        v_pis := array_append(v_pis, trim(r.payment_intent_id));
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'expired_count', v_count,
    'booking_ids', to_jsonb(v_ids),
    'payment_intent_ids', to_jsonb(v_pis)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stay_booking_requests(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stay_booking_requests(integer) TO service_role;
