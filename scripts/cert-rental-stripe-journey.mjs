/**
 * Isolated Stripe TEST certification for Traverion Rentals (DB + PaymentIntent path).
 *
 * Hard-rejects production Traverionapp. Requires explicit CERT_* staging config.
 *
 * Prefer scripts/cert-rental-checkout-session.mjs for the full Checkout Session +
 * signed webhook journey. This script still exercises claim → promote → refund
 * against the staging database with Stripe test keys only.
 *
 *   node scripts/cert-rental-stripe-journey.mjs
 *
 * Never prints secret keys or client_secrets.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  PRODUCTION_PROJECT_REF,
  loadCertEnv,
  resolveCertTarget,
} from './cert-rental-target-guard.mjs';

const certEnv = loadCertEnv();
const target = resolveCertTarget(certEnv);

function dbQuery(sql) {
  if (target.databaseUrl.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('ABORT: production database URL');
  }
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '--db-url', target.databaseUrl, '--output', 'json', sql],
    { encoding: 'utf8', cwd: resolve('.'), maxBuffer: 10 * 1024 * 1024 }
  );
  if (r.status !== 0) throw new Error(`db query failed: ${(r.stderr || r.stdout).slice(-1500)}`);
  const out = (r.stdout || '').trim();
  if (!out || /^(DO|OK|UPDATE \d+|INSERT \d+( \d+)?|DELETE \d+|CREATE .+|ALTER .+|DROP .+)$/i.test(out)) {
    return { rows: [] };
  }
  const objStart = out.indexOf('{');
  const arrStart = out.indexOf('[');
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    return JSON.parse(out.slice(objStart));
  }
  if (arrStart >= 0) {
    return { rows: JSON.parse(out.slice(arrStart)) };
  }
  throw new Error(`no json in db output: ${out.slice(-500)}`);
}

async function stripeForm(sk, path, params, idempotencyKey) {
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
  const headers = {
    Authorization: `Bearer ${sk}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers,
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

const RUN_ID = randomUUID().slice(0, 8);
const VARIANT_ID = 'cert-unit';
const AMOUNT_EUR = '25.00';
const AMOUNT_MINOR = 2500;
const PICKUP = '2033-06-10T09:00:00+00:00';
const RETURN = '2033-06-12T18:00:00+00:00';

const report = {
  ok: false,
  phase: 'rental_stripe_journey',
  startedAt: new Date().toISOString(),
  runId: RUN_ID,
  safety: {
    productionRef: PRODUCTION_PROJECT_REF,
    stagingProject: target.projectRef,
    listingStatus: 'draft',
    stripeMode: 'test',
  },
  steps: [],
  errors: [],
  ids: {},
};

function step(name, detail = {}) {
  report.steps.push({ name, ok: true, ...detail, at: new Date().toISOString() });
  console.log(`✓ ${name}`, Object.keys(detail).length ? JSON.stringify(detail) : '');
}

function fail(name, err) {
  const msg = err instanceof Error ? err.message : String(err);
  report.steps.push({ name, ok: false, error: msg, at: new Date().toISOString() });
  report.errors.push(`${name}: ${msg}`);
  console.error(`✗ ${name}`, msg);
}

function writeReport() {
  const outPath = resolve('scripts/cert-rental-stripe-journey.report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('report →', outPath);
}

async function createSucceededPaymentIntent(sk, { bookingId, email, name }) {
  const pm = await stripeForm(sk, '/payment_methods', {
    type: 'card',
    card: { token: 'tok_visa' },
    billing_details: { name, email },
  });
  const syntheticSessionId = `cs_test_cert_rental_${RUN_ID}_${bookingId.slice(0, 8)}`;
  const pi = await stripeForm(
    sk,
    '/payment_intents',
    {
      amount: String(AMOUNT_MINOR),
      currency: 'eur',
      payment_method: pm.id,
      confirm: 'true',
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
      metadata: {
        booking_id: bookingId,
        listing_id: report.ids.listingId || '',
        inventory_family: 'rental',
        cert: `rental_journey_${RUN_ID}`,
        synthetic_checkout_session_id: syntheticSessionId,
      },
    },
    `cert-rental-pi:${bookingId}`
  );
  if (pi.status !== 'succeeded') throw new Error(`PI not succeeded: ${pi.status}`);
  return { paymentIntent: pi, syntheticSessionId, pm };
}

function cleanupListing(listingId) {
  if (!listingId) return;
  try {
    dbQuery(`
DO $$
DECLARE
  v_listing uuid := '${listingId}'::uuid;
BEGIN
  DELETE FROM public.booking_refund_instructions
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.booking_payment_events
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.rental_booking_events WHERE listing_id = v_listing;
  DELETE FROM public.rental_inventory_holds WHERE listing_id = v_listing;
  DELETE FROM public.bookings WHERE listing_id = v_listing;
  DELETE FROM public.listings WHERE id = v_listing;
END $$;
SELECT 'cleanup_ok' AS status;
`);
  } catch (e) {
    report.errors.push(`cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function run() {
  const sk = target.stripeSecret;
  step('stripe_test_key_ok', { project: target.projectRef });

  const prodSecrets = spawnSync(
    'npx',
    ['supabase', 'secrets', 'list', '--project-ref', PRODUCTION_PROJECT_REF],
    { encoding: 'utf8', cwd: resolve('.') }
  );
  const listed = `${prodSecrets.stdout || ''}\n${prodSecrets.stderr || ''}`;
  if (/RENTAL_CHECKOUT_ENABLED/i.test(listed)) {
    fail('safety_flag', new Error('RENTAL_CHECKOUT_ENABLED is present on production — abort cert'));
    writeReport();
    process.exit(2);
  }
  step('production_rental_checkout_flag_absent');

  let listingId = null;
  let bookingId = null;
  let holdId = null;
  let abandonBookingId = null;
  let abandonHoldId = null;

  try {
    const setup2 = dbQuery(`
WITH supplier AS (
  SELECT id FROM auth.users LIMIT 1
),
ins AS (
  INSERT INTO public.listings (
    supplier_id, title, destination, duration, style,
    status, price_starting_from, price_currency, listing_extras
  )
  SELECT
    supplier.id,
    'CERT rental stripe journey ${RUN_ID}',
    'Test',
    '2 days',
    'adventure',
    'draft',
    25,
    'EUR',
    jsonb_build_object(
      'inventoryFamily', 'rental',
      'departureTimezone', 'Europe/Helsinki',
      'rental', jsonb_build_object(
        'durationMode', 'daily',
        'variants', jsonb_build_array(
          jsonb_build_object(
            'id', '${VARIANT_ID}',
            'name', 'Cert Unit',
            'quantity', 2,
            'pricingOverride', jsonb_build_object('pricePerDayMinor', ${AMOUNT_MINOR})
          )
        )
      )
    )
  FROM supplier
  RETURNING id
)
SELECT id::text AS listing_id FROM ins;
`);
    listingId = setup2.rows?.[0]?.listing_id;
    if (!listingId) {
      // Create a synthetic auth user if staging has none
      throw new Error('listing insert failed — ensure staging has at least one auth.users row');
    }
    report.ids.listingId = listingId;
    step('fixture_listing_draft', { listingId: listingId.slice(0, 8) + '…' });

    const evalRes = dbQuery(`
SELECT public.evaluate_rental_availability(
  '${listingId}'::uuid,
  '${VARIANT_ID}',
  1,
  timestamptz '${PICKUP}',
  timestamptz '${RETURN}'
) AS r;
`);
    const evalRow = evalRes.rows?.[0]?.r;
    if (!evalRow?.ok) throw new Error(`evaluate failed: ${JSON.stringify(evalRow)}`);
    step('evaluate_availability', {
      available: evalRow.available ?? evalRow.ok,
      stock: evalRow.stock ?? null,
    });

    const preview = dbQuery(`
SELECT public.evaluate_rental_availability(
  '00000000-0000-4000-8000-000000000001'::uuid,
  '${VARIANT_ID}',
  1,
  timestamptz '${PICKUP}',
  timestamptz '${RETURN}'
) AS r;
`);
    if (preview.rows?.[0]?.r?.ok) throw new Error('preview evaluate unexpectedly ok');
    step('preview_fixture_rejected_by_evaluate');

    const idem = `cert-rental-${RUN_ID}-paid`;
    const snap = JSON.stringify({
      inventoryFamily: 'rental',
      variantId: VARIANT_ID,
      quantity: 1,
      pickupAt: new Date(PICKUP).toISOString(),
      returnAt: new Date(RETURN).toISOString(),
      durationCount: 2,
      durationUnit: 'day',
      unitMinor: AMOUNT_MINOR,
      customerTotalMinor: AMOUNT_MINOR,
      commissionMinor: 375,
      supplierEarningsMinor: 2125,
      commissionBps: 1500,
      discountApplied: false,
      currency: 'EUR',
      rentalOpsStatus: 'awaiting_pickup',
      listingTitle: `CERT rental ${RUN_ID}`,
      departureTimezone: 'Europe/Helsinki',
      cancellationPreset: 'flexible_24h',
      freeCancelHours: 24,
      totalAmount: AMOUNT_EUR,
    }).replace(/'/g, "''");

    const claim = dbQuery(`
SELECT public.claim_rental_checkout_booking(
  '${listingId}'::uuid,
  '${VARIANT_ID}',
  1,
  timestamptz '${PICKUP}',
  timestamptz '${RETURN}',
  'cert-rental-${RUN_ID}@example.com',
  'CERT Rental Guest',
  NULL,
  ${AMOUNT_EUR}::numeric,
  'EUR',
  '${snap}'::jsonb,
  '${idem}',
  now() + interval '45 minutes',
  60
) AS r;
`);
    const claimRow = claim.rows?.[0]?.r;
    if (!claimRow?.ok) throw new Error(`claim failed: ${JSON.stringify(claimRow)}`);
    bookingId = claimRow.booking_id;
    holdId = claimRow.hold_id;
    report.ids.bookingId = bookingId;
    report.ids.holdId = holdId;
    step('claim_inventory_and_pending_booking', {
      bookingId: String(bookingId).slice(0, 8) + '…',
      holdId: String(holdId).slice(0, 8) + '…',
    });

    const prep = await createSucceededPaymentIntent(sk, {
      bookingId,
      email: `cert-rental-${RUN_ID}@example.com`,
      name: 'CERT Rental Guest',
    });
    report.ids.checkoutSessionId = prep.syntheticSessionId;
    report.ids.paymentIntentId = prep.paymentIntent.id;
    dbQuery(`
UPDATE public.bookings
SET checkout_session_id = '${prep.syntheticSessionId}',
    payment_intent_id = '${prep.paymentIntent.id}',
    hold_expires_at = now() + interval '45 minutes'
WHERE id = '${bookingId}'::uuid;
UPDATE public.rental_inventory_holds
SET hold_expires_at = now() + interval '45 minutes'
WHERE id = '${holdId}'::uuid;
`);
    step('stripe_test_payment_completed', {
      payment_status: prep.paymentIntent.status,
      pi: prep.paymentIntent.id,
    });

    const promo = dbQuery(`
SELECT public.promote_paid_checkout_booking(
  '${bookingId}'::uuid,
  '${prep.syntheticSessionId}',
  '${prep.paymentIntent.id}',
  ${AMOUNT_EUR}::numeric,
  'EUR',
  now(),
  NULL,
  NULL,
  '${VARIANT_ID}'
) AS r;
`);
    const promoRow = promo.rows?.[0]?.r;
    if (!promoRow?.ok && promoRow?.reason !== 'already_paid') {
      throw new Error(`promote failed: ${JSON.stringify(promoRow)}`);
    }
    step('promote_paid_checkout_booking', { result: promoRow });

    const book = dbQuery(`
SELECT status, payment_status FROM public.bookings WHERE id = '${bookingId}'::uuid;
`).rows?.[0];
    if (book?.payment_status !== 'paid' || book?.status !== 'confirmed') {
      throw new Error(`booking not confirmed paid: ${JSON.stringify(book)}`);
    }
    step('booking_promoted_confirmed', book);

    const holdRow = dbQuery(`
SELECT status FROM public.rental_inventory_holds WHERE id = '${holdId}'::uuid;
`).rows?.[0];
    if (holdRow?.status !== 'confirmed') throw new Error(`hold not confirmed: ${JSON.stringify(holdRow)}`);
    step('inventory_hold_confirmed', holdRow);

    const dup = dbQuery(`
SELECT public.promote_paid_checkout_booking(
  '${bookingId}'::uuid,
  '${prep.syntheticSessionId}',
  '${prep.paymentIntent.id}',
  ${AMOUNT_EUR}::numeric,
  'EUR',
  now(),
  NULL,
  NULL,
  '${VARIANT_ID}'
) AS r;
`).rows?.[0]?.r;
    if (!dup?.ok && dup?.reason !== 'already_paid') {
      throw new Error(`duplicate promote unexpected: ${JSON.stringify(dup)}`);
    }
    step('duplicate_promote_idempotent', { reason: dup?.reason || 'ok' });

    const abandonIdem = `cert-rental-${RUN_ID}-abandon`;
    const abandonClaim = dbQuery(`
SELECT public.claim_rental_checkout_booking(
  '${listingId}'::uuid,
  '${VARIANT_ID}',
  1,
  timestamptz '${PICKUP}',
  timestamptz '${RETURN}',
  'cert-rental-abandon-${RUN_ID}@example.com',
  'CERT Abandon Guest',
  NULL,
  ${AMOUNT_EUR}::numeric,
  'EUR',
  '${snap}'::jsonb,
  '${abandonIdem}',
  now() - interval '2 minutes',
  1
) AS r;
`).rows?.[0]?.r;
    if (!abandonClaim?.ok) throw new Error(`abandon claim failed: ${JSON.stringify(abandonClaim)}`);
    abandonBookingId = abandonClaim.booking_id;
    abandonHoldId = abandonClaim.hold_id;

    dbQuery(`SELECT public.expire_stale_rental_holds('${listingId}'::uuid) AS r;`);
    let aStatus = dbQuery(`SELECT status FROM public.rental_inventory_holds WHERE id = '${abandonHoldId}'::uuid;`)
      .rows?.[0]?.status;
    if (aStatus !== 'released' && aStatus !== 'expired') {
      dbQuery(`SELECT public.release_rental_checkout_booking('${abandonBookingId}'::uuid, 'cert_abandon');`);
      aStatus = dbQuery(`SELECT status FROM public.rental_inventory_holds WHERE id = '${abandonHoldId}'::uuid;`)
        .rows?.[0]?.status;
    }
    if (!['released', 'expired'].includes(aStatus)) {
      throw new Error(`abandon hold not released: ${aStatus}`);
    }
    step('abandon_hold_released', { status: aStatus });

    dbQuery(`
UPDATE public.bookings
SET status = 'cancelled', cancelled_at = now(),
    refund_choice = 'full_refund', cancellation_resolution = 'full_refund'
WHERE id = '${bookingId}'::uuid;
`);
    const holdAfterCancel = dbQuery(`
SELECT status FROM public.rental_inventory_holds WHERE id = '${holdId}'::uuid;
`).rows?.[0]?.status;
    if (holdAfterCancel !== 'released') {
      throw new Error(`cancel did not release hold: ${holdAfterCancel}`);
    }
    step('customer_cancel_released_hold');

    const refund = await stripeForm(
      sk,
      '/refunds',
      {
        payment_intent: prep.paymentIntent.id,
        amount: String(AMOUNT_MINOR),
        reason: 'requested_by_customer',
        metadata: { booking_id: bookingId, cert: `rental_journey_${RUN_ID}` },
      },
      `cert-rental-refund:${bookingId}`
    );
    const dupRefund = await stripeForm(
      sk,
      '/refunds',
      {
        payment_intent: prep.paymentIntent.id,
        amount: String(AMOUNT_MINOR),
        reason: 'requested_by_customer',
        metadata: { booking_id: bookingId, cert: `rental_journey_${RUN_ID}` },
      },
      `cert-rental-refund:${bookingId}`
    );
    if (dupRefund.id !== refund.id) throw new Error('refund idempotency broken');
    step('stripe_refund_idempotent', { refundId: refund.id, status: refund.status });
    const verifyRefund = await stripeGet(sk, `/refunds/${refund.id}`);
    step('stripe_refund_verified', { status: verifyRefund.status, amount: verifyRefund.amount });

    report.ok = report.errors.length === 0;
  } catch (err) {
    fail('journey', err);
    report.ok = false;
  } finally {
    cleanupListing(listingId);
    step('cleanup_disposable_fixtures', {
      listingId: listingId ? String(listingId).slice(0, 8) + '…' : null,
    });
    report.finishedAt = new Date().toISOString();
    writeReport();
    console.log(report.ok ? '\nPASS — rental Stripe journey certified (staging)' : '\nFAIL — see report');
    process.exit(report.ok ? 0 : 1);
  }
}

run();
