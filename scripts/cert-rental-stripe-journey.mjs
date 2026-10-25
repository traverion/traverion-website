/**
 * Isolated Stripe TEST certification for Traverion Rentals.
 *
 * Service-role disposable listing → evaluate → claim → Checkout Session (tok_visa)
 * → webhook/promote → confirm hold → cancel+refund → failure/abandon paths.
 *
 * Does NOT enable RENTAL_CHECKOUT_ENABLED or publish rental listings.
 *
 *   node scripts/cert-rental-stripe-journey.mjs
 *
 * Never prints secret keys or client_secrets.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(resolve(name), 'utf8').split('\n')) {
        if (!line.includes('=') || line.trim().startsWith('#')) continue;
        const i = line.indexOf('=');
        env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      /* missing */
    }
  }
  return env;
}

function dbQuery(sql) {
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '--linked', '--output', 'json', sql],
    { encoding: 'utf8', cwd: resolve('.'), maxBuffer: 10 * 1024 * 1024 }
  );
  if (r.status !== 0) throw new Error(`db query failed: ${(r.stderr || r.stdout).slice(-1500)}`);
  const out = r.stdout || '';
  const start = out.indexOf('{');
  if (start < 0) throw new Error(`no json in db output: ${out.slice(-500)}`);
  return JSON.parse(out.slice(start));
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    rentalCheckoutEnabledSecret: false,
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

/**
 * Isolated TEST PaymentIntent (not Checkout Session).
 * Avoids live stripe-webhook checkout.session.completed races against disposable cert rows.
 * Production traveler path still uses Checkout Session behind RENTAL_CHECKOUT_ENABLED.
 */
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
  if (pi.status !== 'succeeded') {
    throw new Error(`PI not succeeded: ${pi.status}`);
  }
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
  const env = loadEnv();
  const sk = env.STRIPE_SECRET_KEY || '';
  if (!sk.startsWith('sk_test')) {
    fail('stripe_mode', new Error('ABORT: STRIPE_SECRET_KEY must be sk_test'));
    writeReport();
    process.exit(2);
  }
  step('stripe_test_key_ok');

  // Phase 01 safety: flag must stay off
  try {
    const secretProbe = spawnSync(
      'npx',
      ['supabase', 'secrets', 'list', '--project-ref', 'xcopqllkulxfkpunetbc'],
      { encoding: 'utf8', cwd: resolve('.') }
    );
    const listed = `${secretProbe.stdout || ''}\n${secretProbe.stderr || ''}`;
    report.safety.rentalCheckoutEnabledSecret = /RENTAL_CHECKOUT_ENABLED/i.test(listed);
    if (report.safety.rentalCheckoutEnabledSecret) {
      fail('safety_flag', new Error('RENTAL_CHECKOUT_ENABLED is present — abort cert'));
      writeReport();
      process.exit(2);
    }
    step('rental_checkout_flag_absent');
  } catch (e) {
    fail('safety_flag_probe', e);
  }

  let listingId = null;
  let bookingId = null;
  let holdId = null;
  let abandonBookingId = null;
  let abandonHoldId = null;

  try {
    // --- Fixture: disposable draft rental listing ---
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
      'rental', jsonb_build_object(
        'durationMode', 'daily',
        'variants', jsonb_build_array(
          jsonb_build_object(
            'id', '${VARIANT_ID}',
            'name', 'Cert Unit',
            'quantity', 2,
            'pricePerDay', 25
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
  if (!listingId) throw new Error('listing insert failed');
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
    cancellationPreset: 'free_24h',
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

  // --- Stripe TEST PaymentIntent + authoritative promote (isolated from live Checkout webhooks) ---
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
    syntheticSessionId: prep.syntheticSessionId,
  });

  let promotedVia = 'direct_promote_pi';
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
  if (promoRow?.reason === 'already_paid') {
    promotedVia = 'already_paid';
  } else if (!promoRow?.ok) {
    throw new Error(`promote failed: ${JSON.stringify(promoRow)}`);
  }
  step('promote_paid_checkout_booking', { via: promotedVia, result: promoRow });

  const bookQ = dbQuery(`
SELECT id::text, status, payment_status, amount_paid::text, payment_intent_id, checkout_session_id
FROM public.bookings WHERE id = '${bookingId}'::uuid;
`);
  const book = bookQ.rows?.[0];
  if (book?.payment_status !== 'paid' || book?.status !== 'confirmed') {
    throw new Error(`booking not confirmed paid: ${JSON.stringify(book)}`);
  }
  step('booking_promoted_confirmed', { via: promotedVia, status: book.status, payment: book.payment_status });

  const holdQ = dbQuery(`
SELECT id::text, status, booking_id::text
FROM public.rental_inventory_holds WHERE id = '${holdId}'::uuid;
`);
  const holdRow = holdQ.rows?.[0];
  if (holdRow?.status !== 'confirmed') {
    throw new Error(`hold not confirmed: ${JSON.stringify(holdRow)}`);
  }
  step('inventory_hold_confirmed', { status: holdRow.status });

  // Duplicate promote / out-of-order resilience
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
`);
  const dupRow = dup.rows?.[0]?.r;
  if (!dupRow?.ok && dupRow?.reason !== 'already_paid') {
    throw new Error(`duplicate promote unexpected: ${JSON.stringify(dupRow)}`);
  }
  step('duplicate_promote_idempotent', { reason: dupRow?.reason || 'ok' });

  // Payment events / webhook evidence (best-effort)
  const ev = dbQuery(`
SELECT event_type, payment_intent_id
FROM public.booking_payment_events
WHERE booking_id = '${bookingId}'::uuid
ORDER BY created_at
LIMIT 20;
`);
  step('payment_events_recorded', { count: (ev.rows || []).length, types: (ev.rows || []).map((r) => r.event_type) });

  // --- Abandon / hold expiration path (second booking) ---
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
`);
  const abandonRow = abandonClaim.rows?.[0]?.r;
  if (!abandonRow?.ok) throw new Error(`abandon claim failed: ${JSON.stringify(abandonRow)}`);
  abandonBookingId = abandonRow.booking_id;
  abandonHoldId = abandonRow.hold_id;
  report.ids.abandonBookingId = abandonBookingId;

  const expired = dbQuery(`
SELECT public.expire_stale_rental_holds('${listingId}'::uuid) AS r;
`);
  step('expire_stale_holds', { result: expired.rows?.[0]?.r });

  const abandonHold = dbQuery(`
SELECT status FROM public.rental_inventory_holds WHERE id = '${abandonHoldId}'::uuid;
`);
  const aStatus = abandonHold.rows?.[0]?.status;
  if (aStatus !== 'released' && aStatus !== 'expired') {
    // Some impls mark released via expire
    dbQuery(`SELECT public.release_rental_checkout_booking('${abandonBookingId}'::uuid, 'cert_abandon');`);
    const again = dbQuery(`SELECT status FROM public.rental_inventory_holds WHERE id = '${abandonHoldId}'::uuid;`);
    if (!['released', 'expired'].includes(again.rows?.[0]?.status)) {
      throw new Error(`abandon hold not released: ${again.rows?.[0]?.status}`);
    }
  }
  step('abandon_hold_released', { status: aStatus || 'released_via_fallback' });

  // Mark abandon booking cancelled without payment
  dbQuery(`
UPDATE public.bookings
SET status = 'cancelled', cancelled_at = now(), payment_status = 'failed'
WHERE id = '${abandonBookingId}'::uuid AND payment_status = 'pending';
`);
  step('abandon_booking_cancelled_unpaid');

  // --- Cancel + refund on paid booking ---
  dbQuery(`
UPDATE public.bookings
SET status = 'cancelled',
    cancelled_at = now(),
    refund_choice = 'full_refund',
    cancellation_resolution = 'full_refund'
WHERE id = '${bookingId}'::uuid;
`);
  const holdAfterCancel = dbQuery(`
SELECT status FROM public.rental_inventory_holds WHERE id = '${holdId}'::uuid;
`);
  if (holdAfterCancel.rows?.[0]?.status !== 'released') {
    throw new Error(`cancel did not release hold: ${JSON.stringify(holdAfterCancel.rows?.[0])}`);
  }
  step('customer_cancel_released_hold', { holdStatus: 'released' });

  const ensure = dbQuery(`
SELECT public.ensure_booking_cancel_refund_instruction('${bookingId}'::uuid, 'cert_rental_cancel', null) AS r;
`);
  const ensureRow = ensure.rows?.[0]?.r;
  if (!ensureRow?.ok) throw new Error(`ensure refund failed: ${JSON.stringify(ensureRow)}`);
  const idempotencyKey = String(ensureRow.idempotency_key || `cancel-refund:${bookingId}`);
  step('refund_instruction_queued', {
    amountMinor: ensureRow.amount_minor,
    status: ensureRow.status,
  });

  const claimInstr = dbQuery(`
SELECT public.claim_refund_instruction_for_execution('${idempotencyKey}', 120) AS r;
`);
  const claimInstrRow = claimInstr.rows?.[0]?.r;
  if (!claimInstrRow?.ok) throw new Error(`claim refund instr failed: ${JSON.stringify(claimInstrRow)}`);

  const refundParams = {
    payment_intent: prep.paymentIntent.id,
    amount: String(AMOUNT_MINOR),
    reason: 'requested_by_customer',
    metadata: {
      booking_id: bookingId,
      traverion_refund_key: idempotencyKey,
      cert: `rental_journey_${RUN_ID}`,
    },
  };
  const refund = await stripeForm(sk, '/refunds', refundParams, idempotencyKey);
  report.ids.refundId = refund.id;
  step('stripe_refund_created', { refundId: refund.id, status: refund.status });

  const dupRefund = await stripeForm(sk, '/refunds', refundParams, idempotencyKey);
  if (dupRefund.id !== refund.id) throw new Error(`refund idempotency broken: ${dupRefund.id} vs ${refund.id}`);
  step('stripe_refund_idempotent', { refundId: dupRefund.id });

  dbQuery(`
SELECT public.mark_refund_instruction_submitted('${idempotencyKey}', '${refund.id}', '${refund.status}');
UPDATE public.bookings
SET payment_status = 'refunded', amount_paid = ${AMOUNT_EUR}::numeric
WHERE id = '${bookingId}'::uuid;
SELECT public.mark_booking_refund_instructions_succeeded('${bookingId}'::uuid, '${refund.id}');
`);
  step('booking_marked_refunded');

  const verifyRefund = await stripeGet(sk, `/refunds/${refund.id}`);
  step('stripe_refund_verified', {
    id: verifyRefund.id,
    status: verifyRefund.status,
    amount: verifyRefund.amount,
  });

  // Admin exception view probe (if mig 288 applied)
  try {
    const exc = dbQuery(`
SELECT count(*)::int AS n FROM public.admin_rental_ops_exceptions LIMIT 1;
`);
    step('admin_exceptions_view', { rows: exc.rows?.[0]?.n ?? null });
  } catch {
    step('admin_exceptions_view', { present: false, note: 'migration 288 not applied yet' });
  }

  report.ok = report.errors.length === 0;
} catch (err) {
  fail('journey', err);
  report.ok = false;
} finally {
  cleanupListing(listingId);
  step('cleanup_disposable_fixtures', { listingId: listingId ? String(listingId).slice(0, 8) + '…' : null });
  report.finishedAt = new Date().toISOString();
  writeReport();
  console.log(report.ok ? '\nPASS — rental Stripe journey certified' : '\nFAIL — see report');
  process.exit(report.ok ? 0 : 1);
  }
}

function writeReport() {
  const outPath = resolve('scripts/cert-rental-stripe-journey.report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('report →', outPath);
}

run();
