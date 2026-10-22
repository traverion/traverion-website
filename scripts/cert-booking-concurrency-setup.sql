-- Concurrent booking safety certification fixture (disposable).
-- Far-future dates; cleaned up by cert-booking-concurrency-cleanup.sql.
-- Do not run against customer-facing inventory windows.

DO $$
DECLARE
  v_supplier uuid;
  v_listing uuid := 'a1111111-1111-4111-8111-111111111111';
  v_tour uuid := 'a2222222-2222-4222-8222-222222222222';
  v_book_a uuid := 'b1111111-1111-4111-8111-111111111111';
  v_book_b uuid := 'b2222222-2222-4222-8222-222222222222';
  v_book_c uuid := 'b3333333-3333-4333-8333-333333333333';
  v_book_d uuid := 'b4444444-4444-4444-8444-444444444444';
  v_tour_a uuid := 'b5555555-5555-4555-8555-555555555555';
  v_tour_b uuid := 'b6666666-6666-4666-8666-666666666666';
  v_tour_c uuid := 'b7777777-7777-4777-8777-777777777777';
  v_tour_d uuid := 'b8888888-8888-4888-8888-888888888888';
BEGIN
  SELECT supplier_id INTO v_supplier FROM public.listings LIMIT 1;
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'No supplier available for concurrency cert fixture';
  END IF;

  DELETE FROM public.bookings
  WHERE id IN (v_book_a, v_book_b, v_book_c, v_book_d, v_tour_a, v_tour_b, v_tour_c, v_tour_d);
  DELETE FROM public.listing_availability WHERE listing_id IN (v_listing, v_tour);
  DELETE FROM public.listings WHERE id IN (v_listing, v_tour);

  INSERT INTO public.listings (
    id, supplier_id, title, destination, duration, status, listing_extras
  ) VALUES (
    v_listing,
    v_supplier,
    '[CERT] Stay concurrency fixture',
    'Certland',
    '2 nights',
    'draft',
    jsonb_build_object(
      'family', 'stay',
      'stay', jsonb_build_object('maxGuests', 4)
    )
  );

  INSERT INTO public.listings (
    id, supplier_id, title, destination, duration, status, group_size, listing_extras
  ) VALUES (
    v_tour,
    v_supplier,
    '[CERT] Tour concurrency fixture',
    'Certland',
    '3 hours',
    'draft',
    '1-8',
    jsonb_build_object(
      'family', 'tour',
      'bookingOptions', jsonb_build_array(
        jsonb_build_object(
          'id', 'opt-shared',
          'maxSpotsPerSlot', 3,
          'minPersons', 1,
          'maxPersons', 8,
          'startTime', '10:00',
          'availabilityDateFrom', '2099-01-01',
          'availabilityDateTo', '2099-12-31',
          'weekdays', jsonb_build_array(true, true, true, true, true, true, true)
        ),
        jsonb_build_object(
          'id', 'opt-indep',
          'maxSpotsPerSlot', 2,
          'minPersons', 1,
          'maxPersons', 8,
          'startTime', '14:00',
          'availabilityDateFrom', '2099-01-01',
          'availabilityDateTo', '2099-12-31',
          'weekdays', jsonb_build_array(true, true, true, true, true, true, true)
        )
      )
    )
  );

  -- Manual block night for stay overlap tests
  INSERT INTO public.listing_availability (listing_id, available_date, capacity)
  VALUES (v_listing, '2099-06-15', 0);

  -- Two Instant Book pending stays, identical overlapping nights
  INSERT INTO public.bookings (
    id, listing_id, public_reference, status, payment_status, guests,
    booking_date, check_out, nights, total_amount, currency,
    checkout_session_id, hold_expires_at, purchase_snapshot
  ) VALUES
  (
    v_book_a, v_listing, 'CERT-STAY-A', 'pending', 'pending', 2,
    '2099-06-10', '2099-06-12', 2, 100, 'EUR',
    'cs_cert_stay_a', now() + interval '30 minutes',
    jsonb_build_object('checkIn', '2099-06-10', 'checkOut', '2099-06-12', 'nights', 2)
  ),
  (
    v_book_b, v_listing, 'CERT-STAY-B', 'pending', 'pending', 2,
    '2099-06-10', '2099-06-12', 2, 100, 'EUR',
    'cs_cert_stay_b', now() + interval '30 minutes',
    jsonb_build_object('checkIn', '2099-06-10', 'checkOut', '2099-06-12', 'nights', 2)
  ),
  -- Adjacent non-overlap (B starts at A's exclusive checkout)
  (
    v_book_c, v_listing, 'CERT-STAY-ADJ-A', 'pending', 'pending', 1,
    '2099-07-01', '2099-07-03', 2, 80, 'EUR',
    'cs_cert_adj_a', now() + interval '30 minutes',
    jsonb_build_object('checkIn', '2099-07-01', 'checkOut', '2099-07-03', 'nights', 2)
  ),
  (
    v_book_d, v_listing, 'CERT-STAY-ADJ-B', 'pending', 'pending', 1,
    '2099-07-03', '2099-07-05', 2, 80, 'EUR',
    'cs_cert_adj_b', now() + interval '30 minutes',
    jsonb_build_object('checkIn', '2099-07-03', 'checkOut', '2099-07-05', 'nights', 2)
  ),
  -- Tour: last-seat race (capacity 3 day-wide option; A+B each want 2 with 3 remaining → one fails)
  (
    v_tour_a, v_tour, 'CERT-TOUR-A', 'pending', 'pending', 2,
    '2099-08-10', null, null, 120, 'EUR',
    'cs_cert_tour_a', now() + interval '30 minutes',
    jsonb_build_object('startTimeHm', '10:00', 'bookingOptionId', 'opt-shared')
  ),
  (
    v_tour_b, v_tour, 'CERT-TOUR-B', 'pending', 'pending', 2,
    '2099-08-10', null, null, 120, 'EUR',
    'cs_cert_tour_b', now() + interval '30 minutes',
    jsonb_build_object('startTimeHm', '10:00', 'bookingOptionId', 'opt-shared')
  ),
  -- Independent departure (14:00) should not fight 10:00 inventory when slot-scoped
  (
    v_tour_c, v_tour, 'CERT-TOUR-C', 'pending', 'pending', 2,
    '2099-08-10', null, null, 90, 'EUR',
    'cs_cert_tour_c', now() + interval '30 minutes',
    jsonb_build_object('startTimeHm', '14:00', 'bookingOptionId', 'opt-indep')
  ),
  (
    v_tour_d, v_tour, 'CERT-TOUR-D', 'pending', 'pending', 1,
    '2099-08-10', null, null, 60, 'EUR',
    'cs_cert_tour_d', now() + interval '30 minutes',
    jsonb_build_object('startTimeHm', '10:00', 'bookingOptionId', 'opt-shared')
  );

  UPDATE public.bookings
  SET start_time = '10:00:00', booking_option_id = 'opt-shared'
  WHERE id IN (v_tour_a, v_tour_b, v_tour_d);
  UPDATE public.bookings
  SET start_time = '14:00:00', booking_option_id = 'opt-indep'
  WHERE id = v_tour_c;
END $$;

SELECT 'setup_ok' AS status;
