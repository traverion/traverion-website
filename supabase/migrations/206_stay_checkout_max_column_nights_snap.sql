-- Phase 1564: stay_booking_check_out = latest of column / nights / snapshot;
-- promote writes v_stay_check_out (not coalesce column-first) so short stale
-- check_out cannot under-count paid purchase_snapshot / nights occupancy.

create or replace function public.stay_booking_check_out(p_booking public.bookings)
returns date
language sql
immutable
as $$
  select coalesce(
    (
      select max(candidate)
      from (
        select p_booking.check_out::date as candidate
        where p_booking.check_out is not null
          and p_booking.check_out > p_booking.booking_date
        union all
        select (p_booking.booking_date + p_booking.nights)::date
        where p_booking.nights is not null
          and p_booking.nights >= 1
        union all
        select (p_booking.purchase_snapshot->>'checkOut')::date
        where coalesce(nullif(trim(p_booking.purchase_snapshot->>'checkOut'), ''), '')
          ~ '^\d{4}-\d{2}-\d{2}$'
          and (p_booking.purchase_snapshot->>'checkOut')::date > p_booking.booking_date
      ) s
    ),
    (p_booking.booking_date + 1)::date
  );
$$;

comment on function public.stay_booking_check_out(public.bookings) is
  'Phase 1564: exclusive stay check-out = max(column, nights-derived, snapshot) → +1 (never notes).';

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

  IF public.booking_is_stay_night(v_row) THEN
    v_stay_check_out := public.stay_booking_check_out(v_row);
    IF v_stay_check_out IS NOT NULL
       AND v_row.booking_date IS NOT NULL
       AND v_stay_check_out > v_row.booking_date THEN
      v_stay_nights := (v_stay_check_out - v_row.booking_date);
    END IF;
  END IF;

  IF lower(coalesce(v_row.payment_status, '')) = 'paid' THEN
    -- Phase 1564: heal short check_out to authoritative exclusive range (not coalesce column-first).
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
        END
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
    -- Phase 1564: authoritative exclusive out wins over stale short column.
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
  'Phase 1564: assert+paid UPDATE; stays set check_out/nights to stay_booking_check_out max(column,nights,snap).';
