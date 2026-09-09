-- Public tour sold-out counts already omit unpaid/failed. Spell out that
-- refunded guests do not fill a departure either (payment_status is not
-- paid/complete/succeeded). Cancelled paid bookings are also omitted.

COMMENT ON FUNCTION public.published_tour_paid_guests(uuid) IS
  'Paid guest counts per tour departure for the public calendar. Failed, unpaid, cancelled, and refunded bookings are omitted.';
