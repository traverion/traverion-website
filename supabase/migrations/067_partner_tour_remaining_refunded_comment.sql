-- Partner tour remaining spots already use occupying guests (paid + live
-- holds), not listing_availability.booked. Spell out that refunded guests
-- must not reduce remaining, even if the booked column is stale.

COMMENT ON COLUMN public.listing_availability.booked IS
  'Legacy guest tally incremented on paid confirm and decremented on cancel/refund. Partner remaining and checkout occupancy use occupying bookings (paid + live holds), not this column. Refunded, cancelled, and failed bookings do not occupy.';
