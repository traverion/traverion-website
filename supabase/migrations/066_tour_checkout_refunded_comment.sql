-- Tour checkout already uses booking_occupies_inventory. Spell out that
-- refunded guests do not fill departure capacity (payment_status is not
-- paid/complete/succeeded/pending-hold).

COMMENT ON FUNCTION public.assert_checkout_inventory(uuid, date, integer, date, uuid) IS
  'Stay nights: paid/live-hold overlap. Tour departures: capacity minus occupying guests (paid + live holds). Refunded, cancelled, and failed bookings do not occupy.';
