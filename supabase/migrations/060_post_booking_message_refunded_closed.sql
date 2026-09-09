-- Refunded bookings were paid; posting must say the thread is closed,
-- not that payment never happened. Pending/failed still require payment.

CREATE OR REPLACE FUNCTION public.post_booking_message(p_booking_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := left(trim(coalesce(p_body, '')), 4000);
  v_supplier uuid;
  v_status text;
  v_pay text;
  v_role text;
  v_id uuid;
  v_open_cancel boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in to send a message.');
  END IF;
  IF char_length(v_body) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Write a message before sending.');
  END IF;

  SELECT l.supplier_id, b.status, lower(trim(coalesce(b.payment_status, '')))
    INTO v_supplier, v_status, v_pay
  FROM public.bookings b
  JOIN public.listings l ON l.id = b.listing_id
  WHERE b.id = p_booking_id;

  IF v_supplier IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This booking is not available.');
  END IF;

  IF NOT public.is_booking_party(p_booking_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You can only message about a booking you are part of.');
  END IF;

  SELECT exists (
    SELECT 1 FROM public.cancellation_requests cr
    WHERE cr.booking_id = p_booking_id AND cr.status = 'requested'
  ) INTO v_open_cancel;

  IF v_pay = 'refunded' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This booking is closed. You can still read earlier messages.');
  END IF;

  IF v_pay NOT IN ('paid', 'complete', 'succeeded') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Messaging opens after this booking is paid.');
  END IF;

  IF lower(trim(coalesce(v_status, ''))) = 'cancelled' AND NOT v_open_cancel THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This booking is closed. You can still read earlier messages.');
  END IF;

  IF v_supplier = v_uid THEN
    v_role := 'supplier';
  ELSE
    v_role := 'traveler';
  END IF;

  INSERT INTO public.booking_messages (booking_id, sender_role, sender_user_id, body)
  VALUES (p_booking_id, v_role, v_uid, v_body)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_booking_message(uuid, text) TO authenticated;
