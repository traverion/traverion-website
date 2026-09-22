-- Freeze checkout commercial truth on bookings for non-service roles.
-- purchase_snapshot / guest_breakdown must not be rewritten by partners or travelers.
-- Paid bookings also freeze date/nights/option/guest count (ops may still edit start/pickup times).

CREATE OR REPLACE FUNCTION public.bookings_protect_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text := coalesce(auth.role(), '');
  v_paid boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF v_role IN ('service_role', '') THEN
    RETURN NEW;
  END IF;

  -- Always preserve payment + purchase commercial columns for client roles.
  NEW.payment_status := OLD.payment_status;
  NEW.amount_paid := OLD.amount_paid;
  NEW.checkout_session_id := OLD.checkout_session_id;
  NEW.payment_intent_id := OLD.payment_intent_id;
  NEW.paid_at := OLD.paid_at;
  NEW.total_amount := OLD.total_amount;
  NEW.currency := OLD.currency;
  NEW.listing_id := OLD.listing_id;
  NEW.guest_user_id := OLD.guest_user_id;
  NEW.guest_email := OLD.guest_email;
  NEW.purchase_snapshot := OLD.purchase_snapshot;
  NEW.guest_breakdown := OLD.guest_breakdown;
  NEW.booking_number := OLD.booking_number;

  v_paid := lower(trim(coalesce(OLD.payment_status, ''))) = 'paid';
  IF v_paid THEN
    NEW.booking_date := OLD.booking_date;
    NEW.check_out := OLD.check_out;
    NEW.nights := OLD.nights;
    NEW.nightly_amount := OLD.nightly_amount;
    NEW.cleaning_fee := OLD.cleaning_fee;
    NEW.booking_option_id := OLD.booking_option_id;
    NEW.guests := OLD.guests;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bookings_protect_payment_fields() IS
  'Client roles cannot rewrite payment fields, purchase_snapshot, or guest_breakdown. Paid bookings also freeze date/nights/option/guests; start_time/pickup_time remain editable for ops.';
