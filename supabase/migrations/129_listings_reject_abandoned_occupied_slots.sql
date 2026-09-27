-- Phase 1111: Server-enforce that listing_extras edits cannot abandon occupied tour slots.
--
-- Phases 1100–1110 hard-block schedule/option abandons in the partner UI only.
-- Owners can still PATCH listings.listing_extras via PostgREST and reopen a
-- full-capacity marketing departure while sold seats stay on purchase_snapshot.startTimeHm.
--
-- BEFORE UPDATE: every occupying booking with a purchased startTimeHm must still
-- have its booking option present and a non-draft schedule (or legacy option
-- startTime) covering that wall-clock.

CREATE OR REPLACE FUNCTION public.listings_reject_abandoned_occupied_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opt_id text;
  v_slot text;
  v_sold integer;
  v_covered boolean;
BEGIN
  IF NEW.listing_extras IS NOT DISTINCT FROM OLD.listing_extras THEN
    RETURN NEW;
  END IF;

  -- Stay listings do not use tour schedule slots.
  IF coalesce(NEW.listing_extras->>'inventoryFamily', '') = 'stay' THEN
    RETURN NEW;
  END IF;

  FOR v_opt_id, v_slot, v_sold IN
    SELECT
      nullif(trim(coalesce(b.booking_option_id::text, '')), ''),
      public.booking_inventory_start_time_hm(b.purchase_snapshot, b.start_time),
      coalesce(sum(b.guests), 0)::integer
    FROM public.bookings b
    WHERE b.listing_id = NEW.id
      AND public.booking_occupies_inventory(
        b.status,
        b.payment_status,
        b.hold_expires_at,
        b.created_at
      )
      AND nullif(trim(coalesce(b.booking_option_id::text, '')), '') IS NOT NULL
      AND public.booking_inventory_start_time_hm(b.purchase_snapshot, b.start_time) IS NOT NULL
    GROUP BY 1, 2
  LOOP
    IF v_opt_id IS NULL OR v_slot IS NULL OR v_sold < 1 THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(NEW.listing_extras->'bookingOptions', '[]'::jsonb)) opt
      WHERE opt->>'id' = v_opt_id
    ) THEN
      RAISE EXCEPTION
        'Cannot remove a booking option while % guest(s) still occupy purchased seats on it.',
        v_sold;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(NEW.listing_extras->'bookingOptions', '[]'::jsonb)) opt
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(opt->'schedules', '[]'::jsonb)) sch
      WHERE opt->>'id' = v_opt_id
        AND (sch->>'status') IS DISTINCT FROM 'draft'
        AND public.normalize_tour_start_time_hm(sch->>'startTime') = v_slot
    )
    INTO v_covered;

    IF NOT coalesce(v_covered, false) THEN
      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(NEW.listing_extras->'bookingOptions', '[]'::jsonb)) opt
        WHERE opt->>'id' = v_opt_id
          AND (
            opt->'schedules' IS NULL
            OR jsonb_typeof(opt->'schedules') <> 'array'
            OR jsonb_array_length(coalesce(opt->'schedules', '[]'::jsonb)) = 0
          )
          AND public.normalize_tour_start_time_hm(opt->>'startTime') = v_slot
      )
      INTO v_covered;
    END IF;

    IF NOT coalesce(v_covered, false) THEN
      RAISE EXCEPTION
        'Cannot abandon the % departure while % guest(s) still occupy purchased seats. Keep a ready schedule at that time, or add a separate schedule for the new time.',
        v_slot,
        v_sold;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_reject_abandoned_occupied_slots_trg ON public.listings;
CREATE TRIGGER listings_reject_abandoned_occupied_slots_trg
  BEFORE UPDATE OF listing_extras ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.listings_reject_abandoned_occupied_slots();

COMMENT ON FUNCTION public.listings_reject_abandoned_occupied_slots() IS
  'Phase 1111: reject listing_extras updates that remove a booking option or ready schedule covering purchased tour departure slots still occupied by inventory bookings.';
