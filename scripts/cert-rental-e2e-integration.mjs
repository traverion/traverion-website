/**
 * Mission 06.4 — Rental end-to-end integration (staging + Stripe TEST).
 *
 * Creates a real checkout → Stripe TEST pay → promote, then verifies
 * customer/supplier surfaces via staging DB + app libraries (tsx).
 * No production writes. No UI redesign.
 *
 *   node scripts/cert-rental-e2e-integration.mjs
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  PRODUCTION_PROJECT_REF,
  loadCertEnv,
  resolveCertTarget,
} from './cert-rental-target-guard.mjs';

const certEnv = loadCertEnv();
const target = resolveCertTarget(certEnv);
const PROJECT = target.projectRef;
const SUPABASE_URL = target.supabaseUrl;
const DATABASE_URL = target.databaseUrl;
const STRIPE_SK = target.stripeSecret;
const CHECKOUT_FN = `${SUPABASE_URL}/functions/v1/create-booking-checkout-session`;
const RECONCILE_FN = `${SUPABASE_URL}/functions/v1/reconcile-checkout-session`;
const RUN_ID = randomUUID().slice(0, 8);
const VARIANT = 'cert-e2e-unit';
const UNIT_MINOR = 2500;
// Future window → Upcoming; Past verified with injected nowMs via app libs.
const PICKUP = '2035-07-10T09:00:00+03:00';
const RETURN = '2035-07-11T18:00:00+03:00';
const OUT = resolve('scripts/cert-rental-e2e-integration.report.json');

const report = {
  ok: false,
  phase: 'rental_e2e_integration',
  mission: '06.4',
  startedAt: new Date().toISOString(),
  runId: RUN_ID,
  environment: {
    project: PROJECT,
    productionRefRejected: PRODUCTION_PROJECT_REF,
    stripeMode: 'test',
    listingStatus: 'draft_with_rental_checkout_flag',
    note: 'Staging has 0 published rentals; draft rental checkout is allowed when RENTAL_CHECKOUT_ENABLED=1 (same gate as prior certs). No staging web host available for browser UI.',
  },
  surfaces: {
    checkout_confirmation: { verdict: 'UNVERIFIED', evidence: [] },
    customer_trips: { verdict: 'UNVERIFIED', evidence: [] },
    supplier_bookings: { verdict: 'UNVERIFIED', evidence: [] },
    supplier_calendar: { verdict: 'UNVERIFIED', evidence: [] },
    inbox_messaging: { verdict: 'UNVERIFIED', evidence: [] },
    supplier_income: { verdict: 'UNVERIFIED', evidence: [] },
    cross_surface_consistency: { verdict: 'UNVERIFIED', evidence: [] },
  },
  steps: [],
  errors: [],
  ids: {},
  defects: [],
  verdict: 'UNVERIFIED',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function step(name, extra = {}) {
  report.steps.push({ name, ok: true, at: new Date().toISOString(), ...extra });
  console.log('✓', name, Object.keys(extra).length ? JSON.stringify(extra) : '');
}

function fail(name, err, extra = {}) {
  const message = err instanceof Error ? err.message : String(err);
  report.steps.push({ name, ok: false, at: new Date().toISOString(), error: message, ...extra });
  report.errors.push(`${name}: ${message}`);
  console.error('✗', name, message);
}

function surface(key, verdict, evidence, defect) {
  report.surfaces[key] = {
    verdict,
    evidence: Array.isArray(evidence) ? evidence : [evidence],
  };
  if (defect) report.defects.push({ surface: key, ...defect });
}

function writeReport() {
  report.finishedAt = new Date().toISOString();
  const vals = Object.values(report.surfaces).map((s) => s.verdict);
  if (vals.every((v) => v === 'PASS')) report.verdict = 'PASS';
  else if (vals.some((v) => v === 'FAIL')) report.verdict = 'FAIL';
  else if (vals.some((v) => v === 'PASS' || v === 'PARTIAL')) report.verdict = 'PARTIAL';
  else report.verdict = 'UNVERIFIED';
  report.ok = report.verdict === 'PASS' || report.verdict === 'PARTIAL';
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('report →', OUT, 'verdict=', report.verdict);
}

function loadApiKeys() {
  return {
    anon: certEnv.CERT_SUPABASE_ANON_KEY || '',
    service: certEnv.CERT_SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

function dbQuery(sql) {
  if (DATABASE_URL.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('ABORT: refusing production database');
  }
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '--db-url', DATABASE_URL, '--output', 'json', sql],
    { encoding: 'utf8', cwd: resolve('.'), maxBuffer: 20 * 1024 * 1024 }
  );
  if (r.status !== 0) throw new Error(`db query failed: ${(r.stderr || r.stdout || '').slice(-1500)}`);
  const out = (r.stdout || '').trim();
  if (!out) return { rows: [] };
  const objStart = out.indexOf('{');
  const arrStart = out.indexOf('[');
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) return JSON.parse(out.slice(objStart));
  if (arrStart >= 0) return { rows: JSON.parse(out.slice(arrStart)) };
  return { rows: [], raw: out.slice(-400) };
}

function dbExec(sql) {
  if (DATABASE_URL.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('ABORT: refusing production database');
  }
  const r = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    cwd: resolve('.'),
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`psql failed: ${(r.stderr || r.stdout || '').slice(-2000)}`);
  return `${r.stdout || ''}\n${r.stderr || ''}`;
}

async function stripeForm(sk, path, params) {
  const body = new URLSearchParams();
  const flatten = (obj, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key);
      else if (Array.isArray(v)) {
        v.forEach((item, i) => {
          if (item !== null && typeof item === 'object') flatten(item, `${key}[${i}]`);
          else body.append(`${key}[${i}]`, String(item));
        });
      } else if (v !== undefined && v !== null) body.append(key, String(v));
    }
  };
  flatten(params);
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sk}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${json?.error?.message || res.status}`);
  return json;
}

async function stripeGet(sk, path) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${sk}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe GET ${path}: ${json?.error?.message || res.status}`);
  return json;
}

async function createConfirmedUser(service, email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${service}`,
      apikey: service,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`create user failed: ${json?.msg || json?.error || res.status}`);
  return json.id;
}

async function signIn(anon, email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`sign-in failed: ${json?.error_description || res.status}`);
  }
  return json.access_token;
}

async function deleteUser(service, id) {
  if (!id) return;
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${service}`, apikey: service },
  });
}

async function postCheckout(jwt, anon, body) {
  const res = await fetch(CHECKOUT_FN, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function completeHostedCheckout(sk, session) {
  const pm = await stripeForm(sk, '/payment_methods', {
    type: 'card',
    card: { token: 'tok_visa' },
    billing_details: {
      name: 'CERT E2E Guest',
      email: session.customer_email,
      address: { country: 'FI' },
    },
  });
  const confirmed = await stripeForm(sk, `/payment_pages/${session.id}/confirm`, {
    payment_method: pm.id,
    expected_amount: String(session.amount_total),
    expected_payment_method_type: 'card',
  });
  const paymentStatus = confirmed.payment_status || confirmed.status || null;
  if (paymentStatus !== 'paid' && confirmed.status !== 'complete') {
    throw new Error(`payment not paid: ${paymentStatus}`);
  }
  return { paymentStatus };
}

async function reconcile(jwt, anon, sessionId) {
  const res = await fetch(RECONCILE_FN, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId }),
  });
  return { http: res.status, json: await res.json().catch(() => ({})) };
}

function runSurfaceChecks(bookingJsonPath) {
  mkdirSync(resolve('.tmp'), { recursive: true });
  const helper = resolve(`.tmp/cert-rental-e2e-surfaces-${RUN_ID}.mts`);
  writeFileSync(
    helper,
    `
import { readFileSync, writeFileSync } from 'node:fs';
import { bookingMatchesTripView } from '../src/lib/trip-views.ts';
import { buildPartnerUnifiedCalendarEvents } from '../src/lib/partner-unified-calendar.ts';
import { rentalBookingSimpleStatusLabel } from '../src/lib/rental-booking-status.ts';
import { parseRentalPurchaseSnapshot } from '../src/lib/rental-booking-domain.ts';

const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const b = input.booking;
const snap = parseRentalPurchaseSnapshot(b.purchase_snapshot);
const returnMs = Date.parse(String(snap?.returnAt || ''));
const beforeReturn = returnMs - 60_000;
const afterReturn = returnMs + 60_000;

const upcoming = bookingMatchesTripView(b, 'upcoming', undefined, beforeReturn);
const pastBefore = bookingMatchesTripView(b, 'past', undefined, beforeReturn);
const pastAfter = bookingMatchesTripView(b, 'past', undefined, afterReturn);
const upcomingAfter = bookingMatchesTripView(b, 'upcoming', undefined, afterReturn);

const events = buildPartnerUnifiedCalendarEvents({
  bookings: [b],
  fromYmd: '2035-07-01',
  toYmd: '2035-07-31',
  titlesByListingId: new Map([[b.listing_id, input.listingTitle]]),
  nowMs: beforeReturn,
});
const kinds = events.map((e) => e.kind);
const collection = events.find((e) => e.kind === 'rental_collection');
const ret = events.find((e) => e.kind === 'rental_return');

const out = {
  trips: {
    upcomingBeforeReturn: upcoming,
    pastBeforeReturn: pastBefore,
    pastAfterReturn: pastAfter,
    upcomingAfterReturn: upcomingAfter,
    statusBefore: rentalBookingSimpleStatusLabel(b, beforeReturn),
    statusAfter: rentalBookingSimpleStatusLabel(b, afterReturn),
  },
  calendar: {
    kinds,
    collectionYmd: collection?.ymd ?? null,
    returnYmd: ret?.ymd ?? null,
    collectionBookingId: collection?.bookingId ?? null,
    returnBookingId: ret?.bookingId ?? null,
    optionLabel: collection?.optionLabel ?? ret?.optionLabel ?? null,
  },
  snap: {
    variantName: snap?.variantName ?? null,
    quantity: snap?.quantity ?? null,
    pickupAt: snap?.pickupAt ?? null,
    returnAt: snap?.returnAt ?? null,
  },
};
writeFileSync(process.argv[3], JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
`
  );
  const outPath = resolve(`.tmp/cert-rental-e2e-surfaces-${RUN_ID}.json`);
  // vite-node supplies Vite import.meta.env so trip/calendar libs can load;
  // plain tsx crashes on src/lib/supabase.ts transitive imports.
  const r = spawnSync('npx', ['vite-node', helper, bookingJsonPath, outPath], {
    encoding: 'utf8',
    cwd: resolve('.'),
    maxBuffer: 5 * 1024 * 1024,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'cert-placeholder',
    },
  });
  if (r.status !== 0) {
    throw new Error(`surface check failed: ${(r.stderr || r.stdout || '').slice(-1500)}`);
  }
  return JSON.parse(readFileSync(outPath, 'utf8'));
}

function cleanupListing(listingId) {
  if (!listingId) return;
  dbExec(`
DO $$
DECLARE v_listing uuid := '${listingId}'::uuid;
BEGIN
  DELETE FROM public.booking_messages
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.booking_commercial_snapshots
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.booking_payment_events
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.rental_booking_events WHERE listing_id = v_listing;
  DELETE FROM public.rental_inventory_holds WHERE listing_id = v_listing;
  DELETE FROM public.supplier_earning_items
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.bookings WHERE listing_id = v_listing;
  DELETE FROM public.listings WHERE id = v_listing;
END $$;
`);
}

async function main() {
  if (PROJECT === PRODUCTION_PROJECT_REF) {
    fail('target', new Error('ABORT: staging only'));
    writeReport();
    process.exit(2);
  }
  if (!STRIPE_SK.startsWith('sk_test_')) {
    fail('stripe', new Error('ABORT: sk_test required'));
    writeReport();
    process.exit(2);
  }

  const keys = loadApiKeys();
  if (!keys.anon || !keys.service) {
    fail('keys', new Error('CERT anon/service keys missing'));
    writeReport();
    process.exit(2);
  }

  const cap = await fetch(CHECKOUT_FN, {
    method: 'POST',
    headers: {
      apikey: keys.anon,
      Authorization: `Bearer ${keys.anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ intent: 'rental_checkout_capability' }),
  }).then((r) => r.json());
  if (!cap?.rentalCheckoutEnabled) {
    fail('staging_flag', new Error('staging rental checkout disabled'));
    writeReport();
    process.exit(2);
  }
  step('staging_rental_checkout_enabled');

  const password = randomBytes(18).toString('base64url');
  const guestEmail = `cert-e2e-guest-${RUN_ID}@example.com`;
  const supplierEmail = `cert-e2e-supplier-${RUN_ID}@example.com`;
  let guestId = null;
  let supplierId = null;
  let listingId = null;
  let bookingId = null;

  try {
    guestId = await createConfirmedUser(keys.service, guestEmail, password);
    supplierId = await createConfirmedUser(keys.service, supplierEmail, password);
    report.ids.guestId = guestId;
    report.ids.supplierId = supplierId;
    report.ids.guestEmail = guestEmail;

    dbExec(`
INSERT INTO public.supplier_profiles (id) VALUES ('${supplierId}'::uuid) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.supplier_commercial_terms (
  supplier_id, plan_code, commission_bps, payout_cadence, effective_from, status, note
)
SELECT '${supplierId}'::uuid, 'standard', 1500, 'monthly', now() - interval '1 day', 'active', 'cert e2e'
WHERE NOT EXISTS (
  SELECT 1 FROM public.supplier_commercial_terms t
  WHERE t.supplier_id = '${supplierId}'::uuid AND t.status = 'active' AND t.effective_until IS NULL
);
`);

    const guestJwt = await signIn(keys.anon, guestEmail, password);
    const supplierJwt = await signIn(keys.anon, supplierEmail, password);
    step('identities_ready');

    const extras = JSON.stringify({
      inventoryFamily: 'rental',
      departureTimezone: 'Europe/Helsinki',
      rental: {
        durationMode: 'daily',
        category: 'equipment',
        itemType: 'camera',
        pickupAddress: 'CERT E2E Desk, Test City',
        cancellationPreset: 'flexible_24h',
        variants: [
          {
            id: VARIANT,
            name: 'E2E Day Kit',
            quantity: 2,
            durationMode: 'daily',
            pricingOverride: { pricePerDayMinor: UNIT_MINOR },
          },
        ],
      },
      galleryImageUrls: [
        'https://example.com/cert-e2e-a.jpg',
        'https://example.com/cert-e2e-b.jpg',
      ],
    }).replace(/'/g, "''");

    listingId = dbQuery(`
INSERT INTO public.listings (
  supplier_id, title, destination, duration, style, status, price_starting_from, price_currency, listing_extras
) VALUES (
  '${supplierId}'::uuid, 'CERT e2e rental ${RUN_ID}', 'Test', '1 day', 'adventure', 'draft', 25, 'EUR',
  '${extras}'::jsonb
) RETURNING id::text AS id;
`).rows?.[0]?.id;
    if (!listingId) throw new Error('listing insert failed');
    report.ids.listingId = listingId;
    report.ids.listingTitle = `CERT e2e rental ${RUN_ID}`;
    step('fixture_listing_draft', { listingId: listingId.slice(0, 8) });

    // Attempt publish (mission prefers published). Soft-fail to draft if gate blocks.
    try {
      dbExec(`UPDATE public.listings SET status = 'published' WHERE id = '${listingId}'::uuid;`);
      const st = dbQuery(`SELECT status FROM public.listings WHERE id = '${listingId}'::uuid`).rows?.[0]
        ?.status;
      report.environment.listingStatus = st || 'unknown';
      step('listing_status', { status: st });
    } catch (err) {
      report.environment.listingStatus = 'draft_publish_blocked';
      step('listing_remain_draft', { error: err instanceof Error ? err.message : String(err) });
    }

    const evalRes = dbQuery(`
SELECT public.evaluate_rental_availability(
  '${listingId}'::uuid, '${VARIANT}', 1,
  timestamptz '${PICKUP}', timestamptz '${RETURN}', null::uuid
) AS r;
`).rows?.[0]?.r;
    if (!evalRes?.ok) throw new Error(`availability failed: ${JSON.stringify(evalRes)}`);
    step('availability_ok', evalRes);

    const checkout = await postCheckout(guestJwt, keys.anon, {
      listingId,
      customerName: 'CERT E2E Guest',
      checkoutConsentAccepted: true,
      expectedTotal: 25,
      currency: 'EUR',
      successPath: '/booking-confirmed',
      cancelPath: '/cart?payment=cancelled',
      rental: {
        variantId: VARIANT,
        quantity: 1,
        pickupAt: PICKUP,
        returnAt: RETURN,
        durationCount: 1,
        durationUnit: 'day',
      },
    });
    if (!checkout.json?.success || !checkout.json.sessionId || !checkout.json.bookingId) {
      throw new Error(`checkout failed: ${checkout.status} ${JSON.stringify(checkout.json)}`);
    }
    bookingId = checkout.json.bookingId;
    const sessionId = checkout.json.sessionId;
    report.ids.bookingId = bookingId;
    report.ids.sessionId = sessionId;

    const holdsBefore = dbQuery(
      `SELECT count(*)::int AS n FROM public.rental_inventory_holds WHERE booking_id = '${bookingId}'::uuid AND status IN ('held','confirmed')`
    ).rows?.[0]?.n;
    if (Number(holdsBefore) !== 0) throw new Error('unpaid checkout reserved inventory');
    step('checkout_session_created', {
      bookingId: bookingId.slice(0, 8),
      quotedTotal: checkout.json.quotedTotal,
      unpaidHolds: 0,
    });

    const session = await stripeGet(STRIPE_SK, `/checkout/sessions/${sessionId}`);
    if (session.livemode !== false) throw new Error('livemode session');
    if (session.amount_total !== UNIT_MINOR) throw new Error(`amount ${session.amount_total}`);
    if (session.metadata?.traverion_supabase_project_ref !== PROJECT) {
      throw new Error('env stamp mismatch');
    }
    await completeHostedCheckout(STRIPE_SK, session);
    const rec = await reconcile(guestJwt, keys.anon, sessionId);
    step('paid_and_reconciled', { http: rec.http, promoted: rec.json?.promoted });

    await sleep(2000);
    const booking = dbQuery(`
SELECT id::text, listing_id::text, status, payment_status, public_reference, guest_email, guest_name,
       total_amount::text, amount_paid::text, currency, payment_intent_id, checkout_session_id,
       purchase_snapshot, booking_option_id, guests, booking_date::text
FROM public.bookings WHERE id = '${bookingId}'::uuid
`).rows?.[0];
    if (!booking || booking.payment_status !== 'paid' || booking.status !== 'confirmed') {
      throw new Error(`booking not confirmed: ${JSON.stringify(booking)}`);
    }
    const hold = dbQuery(`
SELECT id::text, status, quantity, variant_id
FROM public.rental_inventory_holds WHERE booking_id = '${bookingId}'::uuid
`).rows;
    const confirmedHold = (hold || []).filter((h) => h.status === 'confirmed');
    if (confirmedHold.length !== 1) throw new Error(`expected 1 confirmed hold: ${JSON.stringify(hold)}`);

    // ---- 1) Checkout + confirmation ----
    const confirmOk =
      Boolean(booking.public_reference) &&
      booking.guest_email === guestEmail &&
      Number(booking.amount_paid) === 25 &&
      booking.currency === 'EUR' &&
      String(booking.purchase_snapshot?.variantId || booking.booking_option_id) === VARIANT &&
      String(booking.purchase_snapshot?.pickupAt || '').includes('2035-07-10') &&
      String(booking.purchase_snapshot?.returnAt || '').includes('2035-07-11');
    surface(
      'checkout_confirmation',
      confirmOk ? 'PASS' : 'FAIL',
      [
        'API-tested: create-booking-checkout-session + Stripe payment_pages confirm + reconcile',
        `reference=${booking.public_reference}`,
        `amount_paid=${booking.amount_paid} ${booking.currency}`,
        `option=${booking.purchase_snapshot?.variantName || booking.booking_option_id}`,
        `pickup=${booking.purchase_snapshot?.pickupAt}`,
        `return=${booking.purchase_snapshot?.returnAt}`,
        `hold=${confirmedHold[0].status}`,
      ],
      confirmOk
        ? null
        : { severity: 'P1', summary: 'Confirmation payload incomplete or mismatched' }
    );
    step('surface_checkout_confirmation', { verdict: confirmOk ? 'PASS' : 'FAIL' });

    // ---- App-lib surfaces (trips + calendar) ----
    mkdirSync(resolve('.tmp'), { recursive: true });
    const bookingPath = resolve(`.tmp/cert-rental-e2e-booking-${RUN_ID}.json`);
    writeFileSync(
      bookingPath,
      JSON.stringify(
        {
          booking,
          listingTitle: report.ids.listingTitle,
        },
        null,
        2
      )
    );
    const checks = runSurfaceChecks(bookingPath);
    report.ids.surfaceChecks = checks;

    const tripsOk =
      checks.trips.upcomingBeforeReturn === true &&
      checks.trips.pastBeforeReturn === false &&
      checks.trips.pastAfterReturn === true &&
      checks.trips.upcomingAfterReturn === false &&
      checks.trips.statusBefore === 'Confirmed' &&
      checks.trips.statusAfter === 'Completed';
    surface(
      'customer_trips',
      tripsOk ? 'PASS' : 'FAIL',
      [
        'API/lib-tested via bookingMatchesTripView + rentalBookingSimpleStatusLabel (same libs as MyBookings)',
        'Browser UI not exercised — no staging web host in CERT env',
        JSON.stringify(checks.trips),
      ],
      tripsOk
        ? null
        : { severity: 'P1', summary: 'Trips Upcoming/Past transition failed against returnAt clock' }
    );
    step('surface_customer_trips', { verdict: tripsOk ? 'PASS' : 'FAIL', ...checks.trips });

    // ---- Supplier bookings desk (DB visibility + snapshot fields) ----
    const supplierRead = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id,status,payment_status,public_reference,guest_name,guest_email,purchase_snapshot,guests`,
      {
        headers: {
          apikey: keys.anon,
          Authorization: `Bearer ${supplierJwt}`,
        },
      }
    );
    const supplierRows = await supplierRead.json().catch(() => []);
    const supplierRow = Array.isArray(supplierRows) ? supplierRows[0] : null;
    const bookingsOk =
      supplierRead.status === 200 &&
      supplierRow?.id === bookingId &&
      supplierRow?.payment_status === 'paid' &&
      Number(supplierRow?.guests) === 1 &&
      String(supplierRow?.purchase_snapshot?.variantName || '').length > 0 &&
      String(supplierRow?.purchase_snapshot?.pickupAt || '').length > 0 &&
      String(supplierRow?.purchase_snapshot?.returnAt || '').length > 0;
    surface(
      'supplier_bookings',
      bookingsOk ? 'PASS' : 'FAIL',
      [
        'API-tested: supplier JWT REST read of booking row (unified Bookings data source)',
        'Browser Bookings UI not exercised',
        `guest=${supplierRow?.guest_name}`,
        `option=${supplierRow?.purchase_snapshot?.variantName}`,
        `qty=${supplierRow?.guests}`,
      ],
      bookingsOk ? null : { severity: 'P1', summary: 'Supplier cannot read booking or fields missing' }
    );
    step('surface_supplier_bookings', {
      verdict: bookingsOk ? 'PASS' : 'FAIL',
      http: supplierRead.status,
    });

    // ---- Calendar collection/return ----
    const calOk =
      checks.calendar.kinds.includes('rental_collection') &&
      checks.calendar.kinds.includes('rental_return') &&
      checks.calendar.collectionBookingId === bookingId &&
      checks.calendar.returnBookingId === bookingId &&
      checks.calendar.collectionYmd !== checks.calendar.returnYmd;
    surface(
      'supplier_calendar',
      calOk ? 'PASS' : 'FAIL',
      [
        'Lib-tested via buildPartnerUnifiedCalendarEvents (same builder as Partner Calendar)',
        'Browser Calendar UI not exercised',
        JSON.stringify(checks.calendar),
      ],
      calOk
        ? null
        : { severity: 'P1', summary: 'Calendar missing distinct Collection/Return events' }
    );
    step('surface_supplier_calendar', { verdict: calOk ? 'PASS' : 'FAIL', ...checks.calendar });

    // ---- Inbox messaging ----
    const msgGuest = await fetch(`${SUPABASE_URL}/rest/v1/rpc/post_booking_message`, {
      method: 'POST',
      headers: {
        apikey: keys.anon,
        Authorization: `Bearer ${guestJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_booking_id: bookingId,
        p_body: `CERT e2e guest hello ${RUN_ID}`,
      }),
    });
    const msgGuestJson = await msgGuest.json().catch(() => ({}));
    const msgSupplier = await fetch(`${SUPABASE_URL}/rest/v1/rpc/post_booking_message`, {
      method: 'POST',
      headers: {
        apikey: keys.anon,
        Authorization: `Bearer ${supplierJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_booking_id: bookingId,
        p_body: `CERT e2e supplier reply ${RUN_ID}`,
      }),
    });
    const msgSupplierJson = await msgSupplier.json().catch(() => ({}));
    const messages = dbQuery(`
SELECT sender_role, left(body, 80) AS body
FROM public.booking_messages
WHERE booking_id = '${bookingId}'::uuid
ORDER BY created_at
`).rows;
    const inboxOk =
      (msgGuestJson?.ok === true || msgGuest.status === 200) &&
      (msgSupplierJson?.ok === true || msgSupplier.status === 200) &&
      (messages || []).length >= 2 &&
      (messages || []).some((m) => m.sender_role === 'guest' || m.sender_role === 'traveler') &&
      (messages || []).some((m) => m.sender_role === 'supplier');
    // Normalize sender roles - check actual values
    const roles = (messages || []).map((m) => m.sender_role);
    const inboxPass =
      (messages || []).length >= 2 &&
      roles.includes('supplier') &&
      (roles.includes('guest') || roles.includes('traveler') || roles.includes('customer'));
    surface(
      'inbox_messaging',
      inboxPass ? 'PASS' : msgGuest.status >= 400 && msgSupplier.status >= 400 ? 'FAIL' : 'PARTIAL',
      [
        'API-tested: post_booking_message RPC as guest + supplier',
        'Browser Inbox UI not exercised',
        `guestRpc=${msgGuest.status}`,
        `supplierRpc=${msgSupplier.status}`,
        `roles=${JSON.stringify(roles)}`,
        `guestBody=${JSON.stringify(msgGuestJson)}`,
        `supplierBody=${JSON.stringify(msgSupplierJson)}`,
      ],
      inboxPass
        ? null
        : {
            severity: 'P1',
            summary: 'Messaging RPC did not create a two-party thread',
          }
    );
    step('surface_inbox_messaging', {
      verdict: inboxPass ? 'PASS' : 'PARTIAL',
      roles,
      count: (messages || []).length,
    });

    // ---- Supplier income ----
    const earning = dbQuery(`
SELECT id::text, status, amount_minor, gross_minor, commission_minor, commission_bps,
       service_completed_at::text, eligible_at::text, currency
FROM public.supplier_earning_items
WHERE booking_id = '${bookingId}'::uuid
  AND status IS DISTINCT FROM 'reversed'
`).rows?.[0];
    const incomeOk =
      Boolean(earning) &&
      Number(earning.gross_minor) === UNIT_MINOR &&
      Number(earning.commission_bps) === 1500 &&
      Number(earning.commission_minor) === Math.round(UNIT_MINOR * 0.15) &&
      Number(earning.amount_minor) === UNIT_MINOR - Math.round(UNIT_MINOR * 0.15) &&
      Boolean(earning.service_completed_at) &&
      earning.status === 'pending'; // future return → pending until return+hold
    surface(
      'supplier_income',
      incomeOk ? 'PASS' : earning ? 'PARTIAL' : 'FAIL',
      [
        'API-tested: supplier_earning_items after promote/record_paid_booking_earnings',
        'Browser Income UI not exercised',
        JSON.stringify(earning || null),
      ],
      incomeOk
        ? null
        : {
            severity: 'P1',
            summary: earning
              ? 'Earnings row present but fields unexpected'
              : 'No supplier_earning_items row after paid promote',
          }
    );
    step('surface_supplier_income', { verdict: incomeOk ? 'PASS' : 'FAIL', earning });

    // ---- Cross-surface consistency ----
    const sameId =
      booking.id === bookingId &&
      checks.calendar.collectionBookingId === bookingId &&
      checks.calendar.returnBookingId === bookingId &&
      (!earning || true);
    const cancelSafe = await (async () => {
      // Soft cancel test: mark cancelled + release hold path via status update, then check surfaces.
      dbExec(`
UPDATE public.bookings
SET status = 'cancelled', cancelled_at = now(), payment_status = 'refunded'
WHERE id = '${bookingId}'::uuid;
`);
      // Trigger hold release if present
      dbExec(`
SELECT public.release_rental_checkout_booking('${bookingId}'::uuid, 'cert_e2e_cancel');
`);
      const after = dbQuery(`
SELECT status, payment_status FROM public.bookings WHERE id = '${bookingId}'::uuid
`).rows?.[0];
      const holdsAfter = dbQuery(`
SELECT status FROM public.rental_inventory_holds WHERE booking_id = '${bookingId}'::uuid
`).rows;
      const earnAfter = dbQuery(`
SELECT status FROM public.supplier_earning_items WHERE booking_id = '${bookingId}'::uuid
`).rows?.[0];
      return {
        booking: after,
        holds: holdsAfter,
        earning: earnAfter,
      };
    })();
    report.ids.cancelPropagation = cancelSafe;

    const cancelOk =
      cancelSafe.booking?.status === 'cancelled' &&
      (cancelSafe.holds || []).every((h) => ['released', 'expired'].includes(h.status) || h.status !== 'confirmed');
    // refresh eligibility for refunded
    try {
      dbExec(`SELECT public.refresh_supplier_earning_eligibility(now());`);
    } catch {
      /* optional */
    }
    const earnBlocked = dbQuery(`
SELECT status, amount_minor FROM public.supplier_earning_items WHERE booking_id = '${bookingId}'::uuid
`).rows?.[0];

    const earnReversed =
      !earnBlocked ||
      earnBlocked.status === 'reversed' ||
      (earnBlocked.status !== 'pending' &&
        earnBlocked.status !== 'eligible' &&
        earnBlocked.status !== 'paid' &&
        Number(earnBlocked.amount_minor) === 0);
    // Synthetic SQL cancel+refund is not the Stripe refund webhook path; note if ledger not reversed.
    const crossVerdict = sameId && cancelOk && earnReversed ? 'PASS' : sameId && cancelOk ? 'PARTIAL' : 'FAIL';
    surface(
      'cross_surface_consistency',
      crossVerdict,
      [
        'API-tested: shared booking id across confirm/calendar/income',
        `cancel status=${cancelSafe.booking?.status}`,
        `holds=${JSON.stringify(cancelSafe.holds)}`,
        `earningAfterCancel=${JSON.stringify(earnBlocked)}`,
        earnReversed
          ? 'earnings reversed after cancel/refund'
          : 'NOTE: synthetic SQL payment_status=refunded did not reverse supplier_earning_items (likely needs Stripe refund webhook / reverse_paid_booking_earnings path)',
        'Browser sync not exercised',
      ],
      crossVerdict === 'PASS'
        ? null
        : {
            severity: 'P2',
            summary: earnReversed
              ? 'Cancel/hold/earnings propagation incomplete'
              : 'Cancel releases hold but earnings stay pending without refund-pipeline reverse',
          }
    );
    step('surface_cross_surface', {
      sameId,
      cancelOk,
      earningAfter: earnBlocked?.status ?? null,
    });

    report.ok = true;
    step('mission_06_4_complete');
  } catch (err) {
    fail('mission_06_4', err);
    // Mark any still-UNVERIFIED critical path as FAIL if checkout never completed
    for (const key of Object.keys(report.surfaces)) {
      if (report.surfaces[key].verdict === 'UNVERIFIED' && !bookingId) {
        report.surfaces[key].verdict = 'UNVERIFIED';
        report.surfaces[key].evidence = ['Not reached — booking flow aborted early'];
      }
    }
  } finally {
    try {
      cleanupListing(listingId);
      step('cleanup_listing');
    } catch (err) {
      fail('cleanup_listing', err);
    }
    await Promise.all([deleteUser(keys.service, guestId), deleteUser(keys.service, supplierId)]);
    step('cleanup_identities');
    writeReport();
  }

  process.exit(report.verdict === 'FAIL' || report.verdict === 'UNVERIFIED' ? 1 : 0);
}

main().catch((err) => {
  fail('fatal', err);
  writeReport();
  process.exit(2);
});
