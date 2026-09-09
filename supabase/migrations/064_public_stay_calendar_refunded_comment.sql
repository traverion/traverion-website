-- Public stay calendar already omits unpaid/failed. Spell out that refunded
-- nights are not occupied either (payment_status is not paid/complete/succeeded).

COMMENT ON FUNCTION public.published_stay_occupied_ranges(uuid) IS
  'Paid stay nights for the public calendar. Unpaid, failed, and refunded bookings are omitted.';
