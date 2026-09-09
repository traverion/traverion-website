-- Refunded trips are closed. Do not let partners rewrite start/pickup times.

CREATE OR REPLACE FUNCTION public.bookings_protect_refunded_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_role text := coalesce(auth.role(), '');
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF v_role IN ('service_role', '') THEN
    RETURN NEW;
  END IF;
  IF lower(trim(coalesce(OLD.payment_status, ''))) = 'refunded' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR coalesce(NEW.refund_choice, '') IS DISTINCT FROM coalesce(OLD.refund_choice, '')
       OR coalesce(NEW.cancellation_reason, '') IS DISTINCT FROM coalesce(OLD.cancellation_reason, '')
       OR NEW.start_time IS DISTINCT FROM OLD.start_time
       OR NEW.pickup_time IS DISTINCT FROM OLD.pickup_time THEN
      RAISE EXCEPTION 'This booking is already refunded.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
