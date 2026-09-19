#!/usr/bin/env node
/**
 * Seed a realistic Partner demo supplier into Supabase (service role).
 *
 * Safety:
 * - Requires ALLOW_PARTNER_DEMO_SEED=1
 * - Uses @partner-demo.traverion.invalid emails (undeliverable)
 * - Tags listings with __traverion_partner_demo__
 * - Fake Stripe checkout ids: cs_test_demo_*
 * - Direct DB inserts only (no Edge Function / Resend / Stripe live calls)
 *
 * Usage:
 *   ALLOW_PARTNER_DEMO_SEED=1 SUPABASE_SERVICE_ROLE_KEY=... node scripts/partner-demo-seed.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const {
  DEMO_TAG,
  DEMO_EMAIL_DOMAIN,
  DEMO_SUPPLIER_EMAIL,
  DEMO_SUPPLIER_PASSWORD,
  DEMO_META_KEY,
  IDS,
  assertSeedAllowed,
  resolveSupabase,
  ymdHelsinki,
  addDaysYmd,
  isoDaysAgo,
} = require('./partner-demo-lib.cjs');

assertSeedAllowed();
const { url, serviceKey } = resolveSupabase();
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SITE = (process.env.VITE_SITE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
// Prefer local public assets for demo images (works on localhost Partner QA).
const LOCAL = 'http://127.0.0.1:5173';
const IMG = {
  banner: `${LOCAL}/banner1.jpg`,
  beach1: `${LOCAL}/beachphoto1.jpg`,
  beach2: `${LOCAL}/beachphoto2.jpg`,
  vacation: `${LOCAL}/vacation1.jpg`,
};
void SITE;

async function upsertAuthUser({ id, email, password, metadata }) {
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = (listed?.users ?? []).find((u) => u.id === id || u.email === email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata ?? {}), ...metadata },
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) {
    // Some projects disallow client-supplied id — retry without id and remap.
    const { data: d2, error: e2 } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (e2) throw e2;
    return d2.user.id;
  }
  return data.user.id;
}

async function main() {
  const today = ymdHelsinki();
  console.log('Partner demo seed — Helsinki today:', today);

  const supplierId = await upsertAuthUser({
    id: IDS.supplier,
    email: DEMO_SUPPLIER_EMAIL,
    password: DEMO_SUPPLIER_PASSWORD,
    metadata: {
      [DEMO_META_KEY]: true,
      partner_signup: true,
      account_type: 'supplier',
    },
  });

  const travelerIds = {};
  for (const [key, id] of Object.entries(IDS.travelers)) {
    travelerIds[key] = await upsertAuthUser({
      id,
      email: `${key}@${DEMO_EMAIL_DOMAIN}`,
      password: DEMO_SUPPLIER_PASSWORD,
      metadata: { [DEMO_META_KEY]: true, account_type: 'traveler' },
    });
  }

  // Reset previous demo rows for this supplier (idempotent re-seed).
  const { data: existingListings } = await admin
    .from('listings')
    .select('id')
    .eq('supplier_id', supplierId);
  const listingIds = (existingListings ?? []).map((r) => r.id);
  if (listingIds.length) {
    const { data: bks } = await admin.from('bookings').select('id').in('listing_id', listingIds);
    const bookingIds = (bks ?? []).map((r) => r.id);
    if (bookingIds.length) {
      await admin.from('booking_messages').delete().in('booking_id', bookingIds);
      await admin.from('cancellation_requests').delete().in('booking_id', bookingIds);
      await admin.from('supplier_ledger_entries').delete().in('booking_id', bookingIds);
      await admin.from('reviews').delete().in('booking_id', bookingIds);
      await admin.from('bookings').delete().in('id', bookingIds);
    }
    await admin.from('listing_availability').delete().in('listing_id', listingIds);
    await admin.from('listing_discounts').delete().in('listing_id', listingIds);
    await admin.from('listings').delete().in('id', listingIds);
  }

  await admin.from('supplier_profiles').upsert({
    id: supplierId,
    display_name: 'Aurora Lapland Experiences',
    business_type: 'company',
    company_legal_name: 'Aurora Lapland Experiences Oy',
    company_registration_number: 'DEMO-1234567-8',
    managing_directors: 'Demo Operator',
    address_street: 'Koskikatu 1',
    address_city: 'Rovaniemi',
    address_postal_code: '96200',
    address_country: 'Finland',
    tax_id: 'FI00000000',
    vat_id: 'FI00000000',
    verification_status: 'verified',
    verification_submitted_at: isoDaysAgo(30),
    payout_iban: 'FI2112345600000785',
    payout_bic: 'NDEAFIHH',
    payout_verification_status: 'verified',
    payout_verification_submitted_at: isoDaysAgo(28),
    payment_cycle: 'monthly',
    payout_threshold_min: 100,
    insurance_provider: 'Demo Insurance',
    insurance_policy_number: 'DEMO-POL-001',
    insurance_coverage: 'Public liability',
    insurance_start: addDaysYmd(today, -90),
    insurance_end: addDaysYmd(today, 275),
  });

  const weekdaysAll = [true, true, true, true, true, true, true];
  const baseTourOption = (id, name, price, startTime, maxSpots) => ({
    id,
    name,
    priceUsd: price,
    startTime,
    duration: '3 hours',
    pickupPlace: 'Hotel pickup in Rovaniemi',
    minPersons: 1,
    maxPersons: maxSpots,
    maxSpotsPerSlot: maxSpots,
    optionInfo: '',
    weekdays: weekdaysAll,
    availabilityDateFrom: '',
    availabilityDateTo: '',
    pricingMode: 'uniform',
    priceCategories: [],
  });

  const listings = [
    {
      id: IDS.listings.northernLights,
      title: 'Guaranteed Northern Lights Tour',
      destination: 'Rovaniemi, Lapland',
      duration: '3 hours',
      style: 'Tour',
      experience_kind: 'tour',
      price_starting_from: 119,
      price_currency: 'EUR',
      image: IMG.banner,
      description:
        'Chase the aurora with a local guide. Small groups, warm drinks, and a clear plan if skies stay cloudy — photo tips included.',
      highlights: ['Hotel pickup', 'Thermal suits', 'Hot berry juice', 'Photo assistance'],
      includes: ['Guide', 'Transport', 'Warm drinks'],
      excludes: ['Gratuities'],
      city: 'Rovaniemi',
      region: 'Lapland',
      country: 'Finland',
      status: 'published',
      meeting_point: 'Your Rovaniemi hotel or Airbnb',
      pickup_instructions: 'Driver waits in the lobby with an Aurora Lapland sign.',
      default_start_time: '20:00:00',
      pickup_window_minutes_before_min: 30,
      pickup_window_minutes_before_max: 60,
      experience_start_style: 'operator_pickup',
      dropoff_mode: 'same_as_pickup',
      experience_language: 'en',
      cancellation_policy:
        'You may cancel free of charge up to 24 hours before the scheduled start time.',
      listing_extras: {
        inventoryFamily: 'tour',
        bookingOptions: [
          baseTourOption(IDS.options.nlShared, 'Shared group', 119, '20:00', 8),
          {
            ...baseTourOption(IDS.options.nlPrivate, 'Private tour', 449, '20:30', 6),
            optionInfo: 'Private vehicle',
            privatePricing: 'flat_group',
          },
        ],
        galleryUrls: [IMG.beach1, IMG.vacation],
      },
      tags: [DEMO_TAG, 'aurora', 'lapland'],
    },
    {
      id: IDS.listings.iceFishing,
      title: 'Ice Fishing Experience',
      destination: 'Rovaniemi outskirts',
      duration: '4 hours',
      style: 'Tour',
      experience_kind: 'tour',
      price_starting_from: 95,
      price_currency: 'EUR',
      image: IMG.beach2,
      description:
        'Drill a hole, learn local technique, and warm up in a kota. Suitable for beginners — rods and bait included.',
      highlights: ['Gear included', 'Kota lunch', 'Guide'],
      includes: ['Transport', 'Fishing gear', 'Hot lunch'],
      excludes: ['Alcohol'],
      city: 'Rovaniemi',
      region: 'Lapland',
      country: 'Finland',
      status: 'published',
      meeting_point: null,
      pickup_instructions: null,
      default_start_time: '09:00:00',
      pickup_window_minutes_before_min: 0,
      pickup_window_minutes_before_max: 0,
      experience_start_style: 'operator_pickup',
      dropoff_mode: 'same_as_pickup',
      experience_language: 'en',
      cancellation_policy:
        'You may cancel free of charge up to 24 hours before the scheduled start time.',
      listing_extras: {
        inventoryFamily: 'tour',
        bookingOptions: [baseTourOption(IDS.options.ice, 'Morning ice fishing', 95, '09:00', 10)],
      },
      tags: [DEMO_TAG, 'winter'],
    },
    {
      id: IDS.listings.ranua,
      title: 'Ranua Wildlife Park Experience',
      destination: 'Ranua',
      duration: '6 hours',
      style: 'Tour',
      experience_kind: 'tour',
      price_starting_from: 79,
      price_currency: 'EUR',
      image: IMG.vacation,
      description:
        'Arctic animals in a peaceful park setting — polar bears, lynx, and a leisurely pace for families.',
      highlights: ['Park tickets', 'Return transport', 'Guide'],
      includes: ['Entry', 'Transport'],
      excludes: ['Meals'],
      city: 'Ranua',
      region: 'Lapland',
      country: 'Finland',
      status: 'published',
      meeting_point: 'Rovaniemi bus station, bay 3',
      pickup_instructions: 'Meet at bay 3 ten minutes before departure.',
      default_start_time: '10:00:00',
      pickup_window_minutes_before_min: 15,
      pickup_window_minutes_before_max: 20,
      experience_start_style: 'operator_pickup',
      dropoff_mode: 'same_as_pickup',
      experience_language: 'en',
      cancellation_policy:
        'You may cancel free of charge up to 24 hours before the scheduled start time.',
      listing_extras: {
        inventoryFamily: 'tour',
        bookingOptions: [baseTourOption(IDS.options.ranua, 'Wildlife day trip', 79, '10:00', 16)],
      },
      tags: [DEMO_TAG, 'family'],
    },
    {
      id: IDS.listings.airportTransfer,
      title: 'Private Airport Transfer',
      destination: 'Rovaniemi Airport (RVN)',
      duration: '30–45 min',
      style: 'Tour',
      experience_kind: 'transportation',
      price_starting_from: 65,
      price_currency: 'EUR',
      image: IMG.beach1,
      description: 'Private vehicle between RVN and central Rovaniemi hotels. Meet-and-greet at arrivals.',
      highlights: ['Private car', 'Flight tracking', 'Child seats on request'],
      includes: ['Vehicle', 'Driver'],
      excludes: ['Tips'],
      city: 'Rovaniemi',
      region: 'Lapland',
      country: 'Finland',
      status: 'published',
      meeting_point: 'RVN arrivals hall',
      pickup_instructions: 'Driver waits with your name board after baggage claim.',
      default_start_time: '14:00:00',
      pickup_window_minutes_before_min: 0,
      pickup_window_minutes_before_max: 15,
      experience_start_style: 'either_available',
      dropoff_mode: 'different_place',
      dropoff_location: 'Rovaniemi city hotels',
      experience_language: 'en',
      cancellation_policy:
        'You may cancel free of charge up to 24 hours before the scheduled start time.',
      listing_extras: {
        inventoryFamily: 'tour',
        bookingOptions: [
          {
            ...baseTourOption(IDS.options.transfer, 'Private transfer', 65, '14:00', 4),
            duration: '45 minutes',
            privatePricing: 'flat_group',
          },
        ],
      },
      tags: [DEMO_TAG, 'transfer'],
    },
    {
      id: IDS.listings.apartment,
      title: 'Riverside Apartment · Rovaniemi',
      destination: 'Rovaniemi city centre',
      duration: 'Nightly stay',
      style: 'Stay',
      experience_kind: null,
      price_starting_from: 145,
      price_currency: 'EUR',
      image: IMG.vacation,
      description:
        'Bright one-bedroom apartment by the river — kitchen, sauna, and walkable restaurants. Ideal after a late aurora run.',
      highlights: ['Sauna', 'Kitchen', 'Self check-in'],
      includes: ['Linens', 'Wi-Fi', 'Towels'],
      excludes: ['Breakfast'],
      city: 'Rovaniemi',
      region: 'Lapland',
      country: 'Finland',
      status: 'published',
      meeting_point: null,
      pickup_instructions: null,
      default_start_time: null,
      experience_language: 'en',
      cancellation_policy:
        'You may cancel free of charge up to 24 hours before the scheduled start time.',
      listing_extras: {
        inventoryFamily: 'stay',
        stay: {
          nightlyPriceUsd: 145,
          maxGuests: 4,
          minNights: 2,
          cleaningFeeUsd: 45,
        },
        bookingOptions: [],
        galleryUrls: [IMG.beach2],
      },
      tags: [DEMO_TAG, 'stay'],
    },
    {
      id: IDS.listings.draftAurora,
      title: 'Snowshoe & Campfire (draft)',
      destination: 'Rovaniemi forests',
      duration: '2.5 hours',
      style: 'Tour',
      experience_kind: 'tour',
      price_starting_from: 69,
      price_currency: 'EUR',
      image: IMG.banner,
      description: 'Draft product — not live on Traverion yet. Finish photos and pickup copy before publishing.',
      highlights: ['Snowshoes', 'Campfire'],
      includes: ['Guide'],
      excludes: [],
      city: 'Rovaniemi',
      region: 'Lapland',
      country: 'Finland',
      status: 'draft',
      meeting_point: 'TBD',
      pickup_instructions: '',
      default_start_time: '15:00:00',
      experience_language: 'en',
      listing_extras: { inventoryFamily: 'tour', bookingOptions: [] },
      tags: [DEMO_TAG, 'draft'],
    },
  ];

  for (const row of listings) {
    const { error } = await admin.from('listings').upsert({
      ...row,
      supplier_id: supplierId,
      group_size: '2-12',
      difficulty: 'Easy',
      best_time: 'Sep–Mar',
      validity: 'Winter season',
      rating: 4.8,
      reviews: 0,
      is_popular: false,
      category: '3*',
      tour_type: 'nature',
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  // Availability: ~5 weeks for main tours + stay nights
  const availRows = [];
  for (let i = 0; i < 35; i++) {
    const date = addDaysYmd(today, i - 3);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    // Northern lights — open most days; block two mid-week sample dates for visual testing
    const nlBlocked = i === 8 || i === 22;
    availRows.push({
      listing_id: IDS.listings.northernLights,
      available_date: date,
      capacity: nlBlocked ? 0 : i % 5 === 0 ? 8 : 12,
      booked: 0,
    });
    availRows.push({
      listing_id: IDS.listings.iceFishing,
      available_date: date,
      capacity: dow === 0 ? 0 : 10,
      booked: 0,
    });
    availRows.push({
      listing_id: IDS.listings.ranua,
      available_date: date,
      capacity: 16,
      booked: 0,
    });
    availRows.push({
      listing_id: IDS.listings.airportTransfer,
      available_date: date,
      capacity: 6,
      booked: 0,
    });
    // Stay: capacity 1 unit; block a few nights
    const stayBlocked = i === 10 || i === 11;
    availRows.push({
      listing_id: IDS.listings.apartment,
      available_date: date,
      capacity: stayBlocked ? 0 : 1,
      booked: 0,
    });
  }
  {
    const { error } = await admin.from('listing_availability').upsert(availRows);
    if (error) console.warn('availability upsert:', error.message);
  }

  const bookings = [
    {
      id: IDS.bookings.todayNlShared,
      listing_id: IDS.listings.northernLights,
      guest_email: `anna@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Anna Korhonen',
      guest_user_id: travelerIds.anna,
      guests: 3,
      booking_date: today,
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 357,
      currency: 'EUR',
      start_time: '20:00:00',
      pickup_time: '19:15:00',
      booking_option_id: IDS.options.nlShared,
      special_requests: 'Place of stay: Scandic Pohjanhovi',
      checkout_session_id: 'cs_test_demo_today_nl_shared',
      acknowledged_at: isoDaysAgo(1),
      created_at: isoDaysAgo(5),
      guest_breakdown: [
        { label: 'Adult', kind: 'adult', quantity: 2, unitPrice: 119 },
        { label: 'Child', kind: 'child', quantity: 1, unitPrice: 119 },
      ],
    },
    {
      id: IDS.bookings.todayNlPrivate,
      listing_id: IDS.listings.northernLights,
      guest_email: `markus@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Markus Niemi',
      guest_user_id: travelerIds.markus,
      guests: 2,
      booking_date: today,
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 449,
      currency: 'EUR',
      start_time: '20:30:00',
      pickup_time: '19:45:00',
      booking_option_id: IDS.options.nlPrivate,
      special_requests: 'Place of stay: Arctic TreeHouse Hotel',
      checkout_session_id: 'cs_test_demo_today_nl_private',
      created_at: isoDaysAgo(2),
    },
    {
      id: IDS.bookings.todayIcePickupGap,
      listing_id: IDS.listings.iceFishing,
      guest_email: `elena@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Elena Virtanen',
      guest_user_id: travelerIds.elena,
      guests: 4,
      booking_date: today,
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 380,
      currency: 'EUR',
      start_time: '09:00:00',
      pickup_time: null,
      booking_option_id: IDS.options.ice,
      special_requests: 'Place of stay: Original Sokos Hotel Vaakuna',
      checkout_session_id: 'cs_test_demo_today_ice',
      created_at: isoDaysAgo(3),
    },
    {
      id: IDS.bookings.tomorrowNl,
      listing_id: IDS.listings.northernLights,
      guest_email: `jonas@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Jonas Berg',
      guest_user_id: travelerIds.jonas,
      guests: 2,
      booking_date: addDaysYmd(today, 1),
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 238,
      currency: 'EUR',
      start_time: '20:00:00',
      pickup_time: '19:20:00',
      booking_option_id: IDS.options.nlShared,
      special_requests: 'Place of stay: Hostel Cafe Guesthouse',
      checkout_session_id: 'cs_test_demo_tomorrow_nl',
      created_at: isoDaysAgo(1, 18),
    },
    {
      id: IDS.bookings.tomorrowTransfer,
      listing_id: IDS.listings.airportTransfer,
      guest_email: `sofia@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Sofia Laine',
      guest_user_id: travelerIds.sofia,
      guests: 2,
      booking_date: addDaysYmd(today, 1),
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 65,
      currency: 'EUR',
      start_time: '14:30:00',
      pickup_time: '14:30:00',
      booking_option_id: IDS.options.transfer,
      special_requests: 'Flight AY441 — drop at Santa Claus Holiday Village',
      checkout_session_id: 'cs_test_demo_tomorrow_transfer',
      created_at: isoDaysAgo(0, 9),
    },
    {
      id: IDS.bookings.nextWeekRanua,
      listing_id: IDS.listings.ranua,
      guest_email: `anna@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Anna Korhonen',
      guest_user_id: travelerIds.anna,
      guests: 5,
      booking_date: addDaysYmd(today, 7),
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 395,
      currency: 'EUR',
      start_time: '10:00:00',
      pickup_time: '09:40:00',
      booking_option_id: IDS.options.ranua,
      special_requests: 'Place of stay: Scandic Pohjanhovi · stroller',
      checkout_session_id: 'cs_test_demo_ranua',
      created_at: isoDaysAgo(4),
    },
    {
      id: IDS.bookings.stayUpcoming,
      listing_id: IDS.listings.apartment,
      guest_email: `markus@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Markus Niemi',
      guest_user_id: travelerIds.markus,
      guests: 2,
      booking_date: addDaysYmd(today, 3),
      check_out: addDaysYmd(today, 6),
      nights: 3,
      nightly_amount: 145,
      cleaning_fee: 45,
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 480,
      currency: 'EUR',
      start_time: null,
      pickup_time: null,
      special_requests: 'Late check-in after aurora tour',
      checkout_session_id: 'cs_test_demo_stay',
      created_at: isoDaysAgo(2),
    },
    {
      id: IDS.bookings.unpaidCheckout,
      listing_id: IDS.listings.northernLights,
      guest_email: `guest-unpaid@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Open Checkout Guest',
      guests: 2,
      booking_date: addDaysYmd(today, 4),
      status: 'pending',
      payment_status: 'pending',
      amount_paid: null,
      currency: 'EUR',
      start_time: '20:00:00',
      booking_option_id: IDS.options.nlShared,
      checkout_session_id: 'cs_test_demo_unpaid_open',
      created_at: isoDaysAgo(0, 11),
    },
    {
      id: IDS.bookings.cancelRequest,
      listing_id: IDS.listings.northernLights,
      guest_email: `elena@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Elena Virtanen',
      guest_user_id: travelerIds.elena,
      guests: 2,
      booking_date: addDaysYmd(today, 5),
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 238,
      currency: 'EUR',
      start_time: '20:00:00',
      pickup_time: '19:10:00',
      booking_option_id: IDS.options.nlShared,
      special_requests: 'Place of stay: Hotel Cumulus',
      checkout_session_id: 'cs_test_demo_cancel_req',
      created_at: isoDaysAgo(6),
    },
    {
      id: IDS.bookings.cancelled,
      listing_id: IDS.listings.iceFishing,
      guest_email: `jonas@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Jonas Berg',
      guest_user_id: travelerIds.jonas,
      guests: 2,
      booking_date: addDaysYmd(today, -2),
      status: 'cancelled',
      payment_status: 'refunded',
      amount_paid: 190,
      currency: 'EUR',
      refund_choice: 'full_refund',
      cancellation_reason: 'Traveler plans changed',
      cancelled_at: isoDaysAgo(3),
      start_time: '09:00:00',
      booking_option_id: IDS.options.ice,
      checkout_session_id: 'cs_test_demo_cancelled',
      created_at: isoDaysAgo(10),
    },
    {
      id: IDS.bookings.completedPast,
      listing_id: IDS.listings.northernLights,
      guest_email: `sofia@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Sofia Laine',
      guest_user_id: travelerIds.sofia,
      guests: 2,
      booking_date: addDaysYmd(today, -5),
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 238,
      currency: 'EUR',
      start_time: '20:00:00',
      pickup_time: '19:20:00',
      booking_option_id: IDS.options.nlShared,
      checkout_session_id: 'cs_test_demo_completed_1',
      created_at: isoDaysAgo(12),
      acknowledged_at: isoDaysAgo(11),
    },
    {
      id: IDS.bookings.completedPast2,
      listing_id: IDS.listings.ranua,
      guest_email: `anna@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Anna Korhonen',
      guest_user_id: travelerIds.anna,
      guests: 3,
      booking_date: addDaysYmd(today, -8),
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 237,
      currency: 'EUR',
      start_time: '10:00:00',
      pickup_time: '09:45:00',
      booking_option_id: IDS.options.ranua,
      checkout_session_id: 'cs_test_demo_completed_2',
      created_at: isoDaysAgo(14),
    },
    {
      id: IDS.bookings.recentPaid,
      listing_id: IDS.listings.airportTransfer,
      guest_email: `markus@${DEMO_EMAIL_DOMAIN}`,
      guest_name: 'Markus Niemi',
      guest_user_id: travelerIds.markus,
      guests: 1,
      booking_date: addDaysYmd(today, 2),
      status: 'confirmed',
      payment_status: 'paid',
      amount_paid: 65,
      currency: 'EUR',
      start_time: '11:00:00',
      pickup_time: '11:00:00',
      booking_option_id: IDS.options.transfer,
      checkout_session_id: 'cs_test_demo_recent',
      created_at: isoDaysAgo(0, 8),
    },
  ];

  for (const b of bookings) {
    const { error } = await admin.from('bookings').upsert(b);
    if (error) throw error;
    if (b.payment_status === 'paid' && b.status !== 'cancelled') {
      await admin.rpc('record_paid_booking_earnings', { p_booking_id: b.id });
    }
  }

  // Occupancy signals on availability for today NL
  await admin
    .from('listing_availability')
    .update({ booked: 5 })
    .eq('listing_id', IDS.listings.northernLights)
    .eq('available_date', today);
  await admin
    .from('listing_availability')
    .update({ booked: 1 })
    .eq('listing_id', IDS.listings.apartment)
    .in('available_date', [addDaysYmd(today, 3), addDaysYmd(today, 4), addDaysYmd(today, 5)]);

  await admin.from('cancellation_requests').upsert({
    id: IDS.cancelReq,
    booking_id: IDS.bookings.cancelRequest,
    requested_by: 'supplier',
    requester_user_id: supplierId,
    reason_code: 'weather',
    reason_text: 'Forecast below safe operating limits for tonight’s chase window.',
    status: 'requested',
    policy_snapshot: { source: 'partner_demo' },
    applied_fee: 0,
    fee_currency: 'EUR',
    traveler_refund_expectation: 'full_refund',
    expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  });

  const messageRows = [
    {
      booking_id: IDS.bookings.todayNlShared,
      sender_role: 'traveler',
      sender_user_id: travelerIds.anna,
      body: 'Hi! We are at Scandic Pohjanhovi — can you confirm pickup is at the main lobby?',
      created_at: isoDaysAgo(0, 10),
      read_by_supplier_at: isoDaysAgo(0, 10),
      read_by_traveler_at: isoDaysAgo(0, 10),
    },
    {
      booking_id: IDS.bookings.todayNlShared,
      sender_role: 'supplier',
      sender_user_id: supplierId,
      body: 'Yes — lobby at 19:15. Look for the Aurora Lapland sign.',
      created_at: isoDaysAgo(0, 10),
      read_by_supplier_at: isoDaysAgo(0, 10),
      read_by_traveler_at: null,
    },
    {
      booking_id: IDS.bookings.todayNlPrivate,
      sender_role: 'traveler',
      sender_user_id: travelerIds.markus,
      body: 'What clothing should we wear tonight? We have basic winter jackets.',
      created_at: isoDaysAgo(0, 12),
      read_by_supplier_at: null,
      read_by_traveler_at: isoDaysAgo(0, 12),
    },
    {
      booking_id: IDS.bookings.stayUpcoming,
      sender_role: 'traveler',
      sender_user_id: travelerIds.markus,
      body: 'We land late — can we check in after 22:00? Is the keybox code still valid?',
      created_at: isoDaysAgo(1, 16),
      read_by_supplier_at: null,
      read_by_traveler_at: isoDaysAgo(1, 16),
    },
    {
      booking_id: IDS.bookings.tomorrowNl,
      sender_role: 'traveler',
      sender_user_id: travelerIds.jonas,
      body: 'Could we move pickup 10 minutes later? Dinner is running long.',
      created_at: isoDaysAgo(0, 14),
      read_by_supplier_at: isoDaysAgo(0, 15),
      read_by_traveler_at: isoDaysAgo(0, 14),
    },
    {
      booking_id: IDS.bookings.tomorrowNl,
      sender_role: 'supplier',
      sender_user_id: supplierId,
      body: 'Done — pickup revised to 19:30 at Hostel Cafe Guesthouse.',
      created_at: isoDaysAgo(0, 15),
      read_by_supplier_at: isoDaysAgo(0, 15),
      read_by_traveler_at: null,
    },
  ];
  for (const m of messageRows) {
    const { error } = await admin.from('booking_messages').insert(m);
    if (error) console.warn('message insert:', error.message);
  }

  await admin.from('reviews').upsert([
    {
      id: IDS.reviews.excellent,
      listing_id: IDS.listings.northernLights,
      user_id: travelerIds.sofia,
      booking_id: IDS.bookings.completedPast,
      guest_name: 'Sofia Laine',
      rating: 5,
      title: 'Unforgettable sky',
      comment:
        'Guide was calm and knowledgeable. We saw a strong display and felt taken care of the whole evening.',
      created_at: isoDaysAgo(3),
    },
    {
      id: IDS.reviews.short,
      listing_id: IDS.listings.ranua,
      user_id: travelerIds.anna,
      booking_id: IDS.bookings.completedPast2,
      guest_name: 'Anna Korhonen',
      rating: 4,
      title: null,
      comment: 'Great day with the kids. Bus was comfortable.',
      created_at: isoDaysAgo(6),
    },
    {
      id: IDS.reviews.awaiting,
      listing_id: IDS.listings.northernLights,
      user_id: travelerIds.jonas,
      booking_id: null,
      guest_name: 'Jonas Berg',
      rating: 5,
      title: 'Would book again',
      comment: 'Clear communication and warm drinks when we stopped. Thank you!',
      created_at: isoDaysAgo(1),
    },
  ]);

  await admin.from('review_replies').upsert({
    id: IDS.reply,
    review_id: IDS.reviews.excellent,
    supplier_id: supplierId,
    reply_text: 'Thank you, Sofia — glad the sky cooperated. Welcome back anytime.',
    created_at: isoDaysAgo(2),
  });

  await admin.from('listing_discounts').upsert([
    {
      id: IDS.discounts.active,
      listing_id: IDS.listings.northernLights,
      type: 'percent',
      value: 15,
      code: null,
      valid_from: addDaysYmd(today, -2),
      valid_until: addDaysYmd(today, 14),
      booking_option_id: IDS.options.nlShared,
    },
    {
      id: IDS.discounts.upcoming,
      listing_id: IDS.listings.iceFishing,
      type: 'percent',
      value: 10,
      code: null,
      valid_from: addDaysYmd(today, 7),
      valid_until: addDaysYmd(today, 21),
      booking_option_id: IDS.options.ice,
    },
    {
      id: IDS.discounts.expired,
      listing_id: IDS.listings.ranua,
      type: 'percent',
      value: 20,
      code: null,
      valid_from: addDaysYmd(today, -40),
      valid_until: addDaysYmd(today, -10),
      booking_option_id: IDS.options.ranua,
    },
  ]);

  console.log('\nPartner demo seeded.');
  console.log('  Supplier login:', DEMO_SUPPLIER_EMAIL);
  console.log('  Password:', DEMO_SUPPLIER_PASSWORD);
  console.log('  Open: http://127.0.0.1:5173/login');
  console.log('  Reset: ALLOW_PARTNER_DEMO_RESET=1 node scripts/partner-demo-reset.cjs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
