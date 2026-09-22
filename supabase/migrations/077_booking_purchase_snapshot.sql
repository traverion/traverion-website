-- Capture commercial display truth at checkout so listing edits cannot silently
-- rewrite what the traveler purchased (title, option label, meeting copy).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS purchase_snapshot jsonb;

COMMENT ON COLUMN public.bookings.purchase_snapshot IS
  'Checkout-time commercial display: {listingTitle, optionLabel, meetingPoint, pickupInstructions, startTimeHm, capturedAt}. Prefer over live listing joins for Trips/confirmation.';
