-- Authenticated clients can UPDATE own bookings. Refunded trips are closed:
-- do not let traveler or supplier rewrite status as a new cancellation.

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
       OR coalesce(NEW.cancellation_reason, '') IS DISTINCT FROM coalesce(OLD.cancellation_reason, '') THEN
      RAISE EXCEPTION 'This booking is already refunded.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_bookings_protect_refunded_status ON public.bookings;
CREATE TRIGGER tr_bookings_protect_refunded_status
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_protect_refunded_status();
