-- Refunded bookings were paid; requesting cancellation must say they are
-- already refunded, not that they were never paid.

CREATE OR REPLACE FUNCTION public.request_supplier_cancellation(
  p_booking_id uuid,
  p_reason_code text,
  p_reason_text text,
  p_evidence_note text default null,
  p_policy_snapshot jsonb default '{}'::jsonb,
  p_applied_fee numeric default 0,
  p_fee_currency text default 'EUR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_supplier uuid;
  v_status text;
  v_pay text;
  v_code text := upper(trim(coalesce(p_reason_code, '')));
  v_text text := left(trim(coalesce(p_reason_text, '')), 2000);
  v_evidence text := left(trim(coalesce(p_evidence_note, '')), 2000);
  v_id uuid;
  v_allowed text[] := array[
    'FORCE_MAJEURE',
    'UNSAFE_WEATHER',
    'GOVERNMENT_RESTRICTION',
    'SUPPLIER_STAFF_UNAVAILABLE',
    'VEHICLE_OR_EQUIPMENT_FAILURE',
    'OVERBOOKING',
    'MINIMUM_PARTICIPATION_NOT_MET',
    'OPERATIONAL_ERROR',
    'TRAVELER_REQUESTED_DIRECTLY',
    'OTHER'
  ];
  v_fm boolean;
  v_fee numeric := coalesce(p_applied_fee, 0);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  END IF;
  IF v_code <> ALL (v_allowed) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Choose a cancellation reason.');
  END IF;
  IF char_length(v_text) < 12 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Explain what happened (at least a short sentence).');
  END IF;

  v_fm := v_code IN ('FORCE_MAJEURE', 'UNSAFE_WEATHER', 'GOVERNMENT_RESTRICTION');
  IF v_fm AND char_length(v_text) < 24 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Force majeure needs a clear explanation of why the trip cannot run.');
  END IF;

  -- Server classifies fee. Client snapshot is stored for audit but fee is not client-authoritative.
  IF v_fm THEN
    v_fee := 0;
  ELSE
    v_fee := 20;
  END IF;

  SELECT l.supplier_id, b.status, lower(trim(coalesce(b.payment_status, '')))
    INTO v_supplier, v_status, v_pay
  FROM public.bookings b
  JOIN public.listings l ON l.id = b.listing_id
  WHERE b.id = p_booking_id;

  IF v_supplier IS NULL OR v_supplier <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You can only cancel bookings for your own listings.');
  END IF;
  IF v_pay = 'refunded' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  END IF;
  IF lower(trim(coalesce(v_status, ''))) = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This booking is already cancelled.');
  END IF;
  IF v_pay NOT IN ('paid', 'complete', 'succeeded') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only paid bookings can go through this cancellation request.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cancellation_requests cr
    WHERE cr.booking_id = p_booking_id AND cr.status = 'requested'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A cancellation request is already waiting for the traveler.');
  END IF;

  INSERT INTO public.cancellation_requests (
    booking_id,
    requested_by,
    requester_user_id,
    reason_code,
    reason_text,
    evidence_note,
    status,
    policy_snapshot,
    applied_fee,
    fee_currency,
    traveler_refund_expectation,
    expires_at
  ) VALUES (
    p_booking_id,
    'supplier',
    v_uid,
    v_code,
    v_text,
    nullif(v_evidence, ''),
    'requested',
    coalesce(p_policy_snapshot, '{}'::jsonb) || jsonb_build_object(
      'server_applied_fee', v_fee,
      'server_force_majeure', v_fm,
      'auto_accept_hours', null
    ),
    v_fee,
    upper(trim(coalesce(p_fee_currency, 'EUR'))),
    'full_refund',
    now() + interval '72 hours'
  )
  RETURNING id INTO v_id;

  INSERT INTO public.booking_messages (booking_id, sender_role, sender_user_id, body)
  VALUES (
    p_booking_id,
    'system',
    v_uid,
    'Supplier requested cancellation. Open this booking to review the reason and respond.'
  );

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'applied_fee', v_fee);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) TO authenticated;
