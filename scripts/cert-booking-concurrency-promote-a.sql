-- Promote stay booking A (winner path in race).
SELECT public.promote_paid_checkout_booking(
  'b1111111-1111-4111-8111-111111111111'::uuid,
  'cs_cert_stay_a',
  'pi_cert_stay_a',
  100,
  'EUR',
  now(),
  '{"checkIn":"2099-06-10","checkOut":"2099-06-12","nights":2}'::jsonb,
  NULL,
  NULL
) AS result;
