/**
 * Mission 06.5 — Rental cancellation & financial reversal (staging + Stripe TEST).
 *
 * Policy (product): rentals do NOT auto-refund. Traveler may cancel within the
 * request window; money movement is ops/manual Stripe refund; charge.refunded
 * (or its reverse_paid_booking_earnings RPC) reverses earnings.
 *
 *   node scripts/cert-rental-cancel-refund.mjs
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
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
const PROJECT = target.projectRef;
const SUPABASE_URL = target.supabaseUrl;
const DATABASE_URL = target.databaseUrl;
const STRIPE_SK = target.stripeSecret;
const CHECKOUT_FN = `${SUPABASE_URL}/functions/v1/create-booking-checkout-session`;
const RECONCILE_FN = `${SUPABASE_URL}/functions/v1/reconcile-checkout-session`;
const REFUND_FN = `${SUPABASE_URL}/functions/v1/execute-booking-refund`;
const RUN_ID = randomUUID().slice(0, 8);
const VARIANT = 'cert-cancel-unit';
const UNIT_MINOR = 2500;
const PICKUP = '2035-08-10T09:00:00+03:00';
const RETURN = '2035-08-11T18:00:00+03:00';
const OUT = resolve('scripts/cert-rental-cancel-refund.report.json');

const report = {
  ok: false,
  mission: '06.5',
  phase: 'rental_cancel_refund',
  startedAt: new Date().toISOString(),
  runId: RUN_ID,
  environment: {
    project: PROJECT,
    productionRefRejected: PRODUCTION_PROJECT_REF,
    stripeMode: 'test',
    policy:
      'Rentals: no automatic refunds. Cancel releases inventory. Earnings reverse on full Stripe refund via reverse_paid_booking_earnings (webhook path).',
  },
  sequence: [],
  findings: [],
  defects: [],
  evidence: {},
  ids: {},
  verdict: 'UNVERIFIED',
};

function step(name, extra = {}) {
  report.sequence.push({ name, ok: true, at: new Date().toISOString(), ...extra });
  console.log('✓', name, Object.keys(extra).length ? JSON.stringify(extra) : '');
}

function fail(name, err, extra = {}) {
  const message = err instanceof Error ? err.message : String(err);
  report.sequence.push({ name, ok: false, at: new Date().toISOString(), error: message, ...extra });
  console.error('✗', name, message);
}

function finding(severity, summary, detail) {
  report.findings.push({ severity, summary, detail });
}

function defect(severity, summary, detail) {
  report.defects.push({ severity, summary, detail });
  finding(severity, summary, detail);
}

function dbQuery(sql) {
  if (DATABASE_URL.includes(PRODUCTION_PROJECT_REF)) throw new Error('ABORT: production DB');
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
  if (DATABASE_URL.includes(PRODUCTION_PROJECT_REF)) throw new Error('ABORT: production DB');
  const r = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    cwd: resolve('.'),
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`psql failed: ${(r.stderr || r.stdout || '').slice(-1500)}`);
  return `${r.stdout || ''}\n${r.stderr || ''}`;
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
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function completeHostedCheckout(sk, session) {
  const pm = await stripeForm(sk, '/payment_methods', {
    type: 'card',
    card: { token: 'tok_visa' },
    billing_details: {
      name: 'CERT Cancel Guest',
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

function cleanupListing(listingId) {
  if (!listingId) return;
  dbExec(`
DO $$
DECLARE v_listing uuid := '${listingId}'::uuid;
BEGIN
  DELETE FROM public.booking_messages
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.booking_refund_instructions
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.booking_commercial_snapshots
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.booking_payment_events
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.rental_booking_events WHERE listing_id = v_listing;
  DELETE FROM public.rental_inventory_holds WHERE listing_id = v_listing;
  DELETE FROM public.supplier_earning_items
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.supplier_ledger_entries
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.bookings WHERE listing_id = v_listing;
  DELETE FROM public.listings WHERE id = v_listing;
END $$;
`);
}

function writeReport() {
  report.finishedAt = new Date().toISOString();
  const hard = report.defects.filter((d) => d.severity === 'P0' || d.severity === 'P1');
  if (hard.length) report.verdict = 'FAIL';
  else if (report.defects.length || report.findings.some((f) => f.severity === 'P2'))
    report.verdict = 'PARTIAL';
  else if (report.sequence.some((s) => s.ok === false)) report.verdict = 'FAIL';
  else report.verdict = 'PASS';
  report.ok = report.verdict === 'PASS' || report.verdict === 'PARTIAL';
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('report →', OUT, 'verdict=', report.verdict);
}

async function main() {
  if (PROJECT === PRODUCTION_PROJECT_REF) throw new Error('ABORT: staging only');
  const keys = {
    anon: certEnv.CERT_SUPABASE_ANON_KEY || '',
    service: certEnv.CERT_SUPABASE_SERVICE_ROLE_KEY || '',
  };
  if (!keys.anon || !keys.service) throw new Error('CERT anon/service keys required');

  // RENTAL_CHECKOUT_ENABLED is a staging Edge secret (not commercial_runtime_config).
  step('staging_target_ok', { project: PROJECT });

  let guestId = null;
  let supplierId = null;
  let listingId = null;
  let bookingId = null;
  let bookingId2 = null;

  const guestEmail = `cert-cancel-guest-${RUN_ID}@example.com`;
  const supplierEmail = `cert-cancel-supplier-${RUN_ID}@example.com`;
  const password = `CertCancel!${RUN_ID}Aa1`;

  try {
    guestId = await createConfirmedUser(keys.service, guestEmail, password);
    supplierId = await createConfirmedUser(keys.service, supplierEmail, password);
    report.ids.guestId = guestId;
    report.ids.supplierId = supplierId;
    dbExec(`
INSERT INTO public.supplier_profiles (id) VALUES ('${supplierId}'::uuid) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.supplier_commercial_terms (
  supplier_id, plan_code, commission_bps, payout_cadence, effective_from, status, note
)
SELECT '${supplierId}'::uuid, 'standard', 1500, 'monthly', now() - interval '1 day', 'active', 'cert cancel'
WHERE NOT EXISTS (
  SELECT 1 FROM public.supplier_commercial_terms t
  WHERE t.supplier_id = '${supplierId}'::uuid AND t.status = 'active' AND t.effective_until IS NULL
);
`);
    const guestJwt = await signIn(keys.anon, guestEmail, password);
    step('identities_ready');

    const extras = JSON.stringify({
      inventoryFamily: 'rental',
      departureTimezone: 'Europe/Helsinki',
      rental: {
        durationMode: 'daily',
        category: 'equipment',
        itemType: 'camera',
        pickupAddress: 'CERT Cancel Desk',
        cancellationPreset: 'flexible_24h',
        variants: [
          {
            id: VARIANT,
            name: 'Cancel Kit',
            quantity: 2,
            durationMode: 'daily',
            pricingOverride: { pricePerDayMinor: UNIT_MINOR },
          },
        ],
      },
      galleryImageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    }).replace(/'/g, "''");

    listingId = dbQuery(`
INSERT INTO public.listings (
  supplier_id, title, destination, duration, style, status, price_starting_from, price_currency, listing_extras
) VALUES (
  '${supplierId}'::uuid, 'CERT cancel rental ${RUN_ID}', 'Test', '1 day', 'adventure', 'draft', 25, 'EUR',
  '${extras}'::jsonb
) RETURNING id::text AS id;
`).rows?.[0]?.id;
    if (!listingId) throw new Error('listing insert failed');
    report.ids.listingId = listingId;
    step('fixture_listing', { listingId: listingId.slice(0, 8) });

    // ---- Booking A: cancel + full refund path ----
    const checkout = await postCheckout(guestJwt, keys.anon, {
      listingId,
      customerName: 'CERT Cancel Guest',
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
    report.ids.bookingId = bookingId;
    const session = await stripeGet(STRIPE_SK, `/checkout/sessions/${checkout.json.sessionId}`);
    if (session.livemode !== false) throw new Error('livemode');
    await completeHostedCheckout(STRIPE_SK, session);
    await reconcile(guestJwt, keys.anon, checkout.json.sessionId);
    await new Promise((r) => setTimeout(r, 1500));

    const paid = dbQuery(`
SELECT id::text, status, payment_status, payment_intent_id, amount_paid::text, refund_choice,
       purchase_snapshot, booking_date::text, public_reference
FROM public.bookings WHERE id = '${bookingId}'::uuid
`).rows?.[0];
    if (!paid || paid.payment_status !== 'paid' || paid.status !== 'confirmed') {
      throw new Error(`not paid/confirmed: ${JSON.stringify(paid)}`);
    }
    const holdBefore = dbQuery(`
SELECT id::text, status, quantity FROM public.rental_inventory_holds WHERE booking_id = '${bookingId}'::uuid
`).rows;
    const earnBefore = dbQuery(`
SELECT id::text, status, amount_minor, commission_minor, gross_minor
FROM public.supplier_earning_items WHERE booking_id = '${bookingId}'::uuid
`).rows?.[0];
    if (!earnBefore || earnBefore.status !== 'pending') {
      throw new Error(`expected pending earning: ${JSON.stringify(earnBefore)}`);
    }
    step('paid_booking_ready', {
      bookingId: bookingId.slice(0, 8),
      hold: holdBefore?.[0]?.status,
      earning: earnBefore.status,
      pi: paid.payment_intent_id?.slice(0, 12),
    });
    report.evidence.preCancel = { booking: paid, holds: holdBefore, earning: earnBefore };

    // Traveler cancel via real RPC (application path)
    const cancelRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cancel_booking_as_traveler`, {
      method: 'POST',
      headers: {
        apikey: keys.anon,
        Authorization: `Bearer ${guestJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_booking_id: bookingId,
        p_refund_choice: 'full_refund',
      }),
    });
    const cancelJson = await cancelRes.json().catch(() => ({}));
    report.evidence.travelerCancel = { http: cancelRes.status, body: cancelJson };
    if (cancelRes.status !== 200 || cancelJson?.ok !== true) {
      throw new Error(`cancel_booking_as_traveler failed: ${cancelRes.status} ${JSON.stringify(cancelJson)}`);
    }
    step('traveler_cancel', {
      refund_choice: cancelJson.refund_choice,
      unpaid: cancelJson.unpaid_checkout,
    });

    const afterCancel = dbQuery(`
SELECT status, payment_status, refund_choice, cancellation_origin, cancellation_resolution,
       auto_refund_status, cancelled_at::text
FROM public.bookings WHERE id = '${bookingId}'::uuid
`).rows?.[0];
    const holdsAfterCancel = dbQuery(`
SELECT status FROM public.rental_inventory_holds WHERE booking_id = '${bookingId}'::uuid
`).rows;
    const releasedCount = (holdsAfterCancel || []).filter((h) => h.status === 'released').length;
    const confirmedLeft = (holdsAfterCancel || []).filter((h) => h.status === 'confirmed').length;
    const instr = dbQuery(`
SELECT id::text, status, idempotency_key, amount_minor, note
FROM public.booking_refund_instructions WHERE booking_id = '${bookingId}'::uuid
`).rows;
    const earnAfterCancel = dbQuery(`
SELECT status, amount_minor FROM public.supplier_earning_items WHERE booking_id = '${bookingId}'::uuid
`).rows?.[0];
    const blocked = dbQuery(`
SELECT public.booking_blocks_payout_eligibility('${bookingId}'::uuid) AS blocked
`).rows?.[0]?.blocked;

    report.evidence.afterCancel = {
      booking: afterCancel,
      holds: holdsAfterCancel,
      instructions: instr,
      earning: earnAfterCancel,
      payoutBlocked: blocked,
    };

    if (afterCancel?.status !== 'cancelled') {
      defect('P0', 'Traveler cancel did not set status=cancelled', afterCancel);
    }
    if (confirmedLeft !== 0 || releasedCount < 1) {
      defect('P1', 'Inventory not released exactly once on cancel', {
        holdsAfterCancel,
        releasedCount,
        confirmedLeft,
      });
    } else {
      step('inventory_released_on_cancel', { releasedCount, confirmedLeft });
    }
    if (blocked !== true) {
      defect('P0', 'Cancelled rental still payout-eligible', { blocked, earnAfterCancel });
    } else {
      step('payout_blocked_after_cancel', { blocked: true, earningStatus: earnAfterCancel?.status });
    }

    // Product policy: rentals must NOT auto-queue Stripe refunds.
    if ((instr || []).length > 0) {
      defect(
        'P1',
        'Rental traveler cancel queued booking_refund_instructions (auto-refund) — contradicts no-automatic-rental-refunds policy',
        instr
      );
    } else {
      step('no_auto_refund_instruction', { count: 0 });
    }

    // execute-booking-refund must not create a Stripe refund for rentals.
    const exec1 = await fetch(REFUND_FN, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestJwt}`,
        apikey: keys.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookingId }),
    });
    const exec1Json = await exec1.json().catch(() => ({}));
    report.evidence.executeBookingRefundAfterCancel = { http: exec1.status, body: exec1Json };
    const execSubmittedRefund =
      exec1Json.success === true && Boolean(exec1Json.stripeRefundId) && !exec1Json.alreadyRefunded;
    step('execute_booking_refund_probe', {
      http: exec1.status,
      success: exec1Json.success === true,
      error: exec1Json.error ?? null,
      skipped: exec1Json.skipped === true,
    });
    if (execSubmittedRefund) {
      defect(
        'P1',
        'execute-booking-refund submitted a Stripe refund for a rental after cancel — policy forbids automatic rental refunds',
        exec1Json
      );
    } else {
      step('execute_booking_refund_blocked_for_rental', {
        error: exec1Json.error ?? null,
        skipped: exec1Json.skipped === true,
      });
    }

    // Authorized rental refund path: manual Stripe refund (ops/Dashboard equivalent) +
    // webhook-equivalent reverse_paid_booking_earnings (staging has no Dashboard webhook).
    let piId = paid.payment_intent_id;
    let stripeRefund = null;
    const pi = await stripeGet(STRIPE_SK, `/payment_intents/${piId}?expand[]=latest_charge`);
    const charge =
      typeof pi.latest_charge === 'object' && pi.latest_charge ? pi.latest_charge : null;
    const alreadyFully =
      charge &&
      typeof charge.amount_refunded === 'number' &&
      charge.amount_refunded >= (charge.amount || 0);

    if (alreadyFully && !execSubmittedRefund) {
      finding(
        'P2',
        'Stripe charge already fully refunded without this cert submitting execute — unexpected external refund',
        { amount_refunded: charge.amount_refunded }
      );
    }

    if (!alreadyFully) {
      const key = `manual-rental-refund:${bookingId}`;
      stripeRefund = await stripeForm(
        STRIPE_SK,
        '/refunds',
        {
          payment_intent: piId,
          amount: String(UNIT_MINOR),
          reason: 'requested_by_customer',
          'metadata[booking_id]': bookingId,
          'metadata[cert]': 'mission_06_5',
        },
        key
      );
      step('stripe_manual_full_refund', {
        refundId: stripeRefund.id,
        status: stripeRefund.status,
        amount: stripeRefund.amount,
      });

      // Idempotency replay
      const dup = await stripeForm(
        STRIPE_SK,
        '/refunds',
        {
          payment_intent: piId,
          amount: String(UNIT_MINOR),
          reason: 'requested_by_customer',
          'metadata[booking_id]': bookingId,
          'metadata[cert]': 'mission_06_5',
        },
        key
      );
      if (dup.id !== stripeRefund.id) {
        defect('P1', 'Stripe refund idempotency broken', { first: stripeRefund.id, second: dup.id });
      } else {
        step('stripe_refund_idempotent', { refundId: dup.id });
      }
      report.evidence.stripeRefund = {
        id: stripeRefund.id,
        status: stripeRefund.status,
        amount: stripeRefund.amount,
        livemode: stripeRefund.livemode,
        duplicateId: dup.id,
      };
    } else {
      step('stripe_already_fully_refunded', {
        amount_refunded: charge.amount_refunded,
        viaExecute: execSubmittedRefund,
      });
      report.evidence.stripeRefund = {
        alreadyFully: true,
        amount_refunded: charge.amount_refunded,
        viaExecute: execSubmittedRefund,
      };
    }

    // Webhook-equivalent truth apply (staging limitation: no Dashboard webhook to staging)
    dbExec(`
UPDATE public.bookings
SET payment_status = 'refunded',
    amount_paid = ${UNIT_MINOR / 100.0}
WHERE id = '${bookingId}'::uuid AND payment_status = 'paid';
`);
    const rev1 = dbQuery(
      `SELECT public.reverse_paid_booking_earnings('${bookingId}'::uuid) AS r;`
    ).rows?.[0]?.r;
    const rev2 = dbQuery(
      `SELECT public.reverse_paid_booking_earnings('${bookingId}'::uuid) AS r;`
    ).rows?.[0]?.r;
    report.evidence.reverse = { first: rev1, second: rev2 };

    const earnAfterRefund = dbQuery(`
SELECT status, amount_minor, commission_minor, gross_minor
FROM public.supplier_earning_items WHERE booking_id = '${bookingId}'::uuid
`).rows?.[0];
    const holdsFinal = dbQuery(`
SELECT status FROM public.rental_inventory_holds WHERE booking_id = '${bookingId}'::uuid
`).rows;
    const bookingFinal = dbQuery(`
SELECT status, payment_status, refund_choice, amount_paid::text
FROM public.bookings WHERE id = '${bookingId}'::uuid
`).rows?.[0];

    report.evidence.afterFullRefund = {
      booking: bookingFinal,
      earning: earnAfterRefund,
      holds: holdsFinal,
    };

    if (earnAfterRefund?.status !== 'reversed' || Number(earnAfterRefund.amount_minor) !== 0) {
      defect('P0', 'supplier_earning_items not reversed after full refund reverse RPC', earnAfterRefund);
    } else {
      step('earnings_reversed', {
        status: earnAfterRefund.status,
        amount_minor: earnAfterRefund.amount_minor,
      });
    }
    // Idempotent reverse: second call must not error / must keep reversed
    if (earnAfterRefund?.status === 'reversed') {
      const still = dbQuery(`
SELECT status, amount_minor FROM public.supplier_earning_items WHERE booking_id = '${bookingId}'::uuid
`).rows?.[0];
      if (still?.status !== 'reversed' || Number(still.amount_minor) !== 0) {
        defect('P1', 'Idempotent reverse left earnings non-reversed', { rev2, still });
      } else {
        step('reverse_idempotent', { status: still.status });
      }
    }
    if ((holdsFinal || []).filter((h) => h.status === 'confirmed').length !== 0) {
      defect('P1', 'Confirmed hold still present after refund', holdsFinal);
    }
    if ((holdsFinal || []).filter((h) => h.status === 'released').length !== 1) {
      finding('P2', 'Expected exactly one released hold row', holdsFinal);
    } else {
      step('inventory_still_single_release', { released: 1 });
    }

    // ---- Booking B: partial refund without cancel (policy: stay paid, shrink) ----
    const checkout2 = await postCheckout(guestJwt, keys.anon, {
      listingId,
      customerName: 'CERT Cancel Guest',
      checkoutConsentAccepted: true,
      expectedTotal: 25,
      currency: 'EUR',
      successPath: '/booking-confirmed',
      cancelPath: '/cart?payment=cancelled',
      rental: {
        variantId: VARIANT,
        quantity: 1,
        pickupAt: '2035-09-10T09:00:00+03:00',
        returnAt: '2035-09-11T18:00:00+03:00',
        durationCount: 1,
        durationUnit: 'day',
      },
    });
    if (!checkout2.json?.success) {
      throw new Error(`checkout2 failed: ${JSON.stringify(checkout2.json)}`);
    }
    bookingId2 = checkout2.json.bookingId;
    report.ids.bookingIdPartial = bookingId2;
    const session2 = await stripeGet(STRIPE_SK, `/checkout/sessions/${checkout2.json.sessionId}`);
    await completeHostedCheckout(STRIPE_SK, session2);
    await reconcile(guestJwt, keys.anon, checkout2.json.sessionId);
    await new Promise((r) => setTimeout(r, 1200));

    const paid2 = dbQuery(`
SELECT payment_intent_id, payment_status, status, amount_paid::text
FROM public.bookings WHERE id = '${bookingId2}'::uuid
`).rows?.[0];
    const partialAmt = Math.floor(UNIT_MINOR / 2);
    const partialRefund = await stripeForm(STRIPE_SK, '/refunds', {
      payment_intent: paid2.payment_intent_id,
      amount: String(partialAmt),
      reason: 'requested_by_customer',
      'metadata[booking_id]': bookingId2,
      'metadata[cert]': 'mission_06_5_partial',
    });
    step('stripe_partial_refund', {
      refundId: partialRefund.id,
      amount: partialRefund.amount,
    });

    // Webhook-equivalent partial: shrink amount_paid + shrink_paid_booking_earnings; do NOT mark refunded
    const remainingMajor = (UNIT_MINOR - partialAmt) / 100;
    dbExec(`
UPDATE public.bookings
SET amount_paid = ${remainingMajor}
WHERE id = '${bookingId2}'::uuid AND payment_status = 'paid';
`);
    const shrink = dbQuery(
      `SELECT public.shrink_paid_booking_earnings('${bookingId2}'::uuid, ${remainingMajor}) AS r;`
    ).rows?.[0]?.r;
    const afterPartial = dbQuery(`
SELECT status, payment_status, amount_paid::text FROM public.bookings WHERE id = '${bookingId2}'::uuid
`).rows?.[0];
    const earnPartial = dbQuery(`
SELECT status, amount_minor, gross_minor FROM public.supplier_earning_items WHERE booking_id = '${bookingId2}'::uuid
`).rows?.[0];
    const holdPartial = dbQuery(`
SELECT status FROM public.rental_inventory_holds WHERE booking_id = '${bookingId2}'::uuid
`).rows;
    report.evidence.partial = {
      stripeRefundId: partialRefund.id,
      shrink,
      booking: afterPartial,
      earning: earnPartial,
      holds: holdPartial,
    };

    if (afterPartial?.payment_status !== 'paid' || afterPartial?.status !== 'confirmed') {
      defect('P1', 'Partial refund incorrectly flipped booking status/payment', afterPartial);
    } else {
      step('partial_keeps_paid_confirmed', afterPartial);
    }
    if ((holdPartial || []).some((h) => h.status === 'released')) {
      defect('P1', 'Partial refund released rental inventory without cancel', holdPartial);
    } else {
      step('partial_inventory_retained', { holds: holdPartial });
    }
    if (earnPartial?.status === 'reversed') {
      defect('P1', 'Partial refund fully reversed earnings (should shrink)', earnPartial);
    } else {
      step('partial_earnings_not_fully_reversed', {
        status: earnPartial?.status,
        amount_minor: earnPartial?.amount_minor,
        shrinkOk: shrink?.ok === true,
      });
    }

    // ---- Failure / no entitlement ----
    const failExec = await fetch(REFUND_FN, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestJwt}`,
        apikey: keys.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookingId: bookingId2 }),
    });
    const failJson = await failExec.json().catch(() => ({}));
    report.evidence.refundWithoutCancel = { http: failExec.status, body: failJson };
    if (failJson.success === true && !failJson.alreadyRefunded) {
      defect('P1', 'execute-booking-refund succeeded on non-cancelled rental', failJson);
    } else {
      step('refund_without_cancel_blocked', {
        error: failJson.error ?? null,
        success: failJson.success === true,
      });
    }

    // Surface consistency (API/lib)
    const tripsCancel = dbQuery(`
SELECT status, payment_status FROM public.bookings WHERE id = '${bookingId}'::uuid
`).rows?.[0];
    mkdirSync(resolve('.tmp'), { recursive: true });
    const helper = resolve(`.tmp/cert-rental-cancel-surfaces-${RUN_ID}.mts`);
    writeFileSync(
      helper,
      `
import { writeFileSync } from 'node:fs';
import { bookingMatchesTripView } from '../src/lib/trip-views.ts';
import { buildPartnerUnifiedCalendarEvents } from '../src/lib/partner-unified-calendar.ts';
import { rentalBookingSimpleStatusLabel } from '../src/lib/rental-booking-status.ts';

const b = ${JSON.stringify({
        ...tripsCancel,
        id: bookingId,
        listing_id: listingId,
        purchase_snapshot: paid.purchase_snapshot,
        guest_name: 'CERT Cancel Guest',
        guests: 1,
        public_reference: paid.public_reference,
      })};
const cancelledView = bookingMatchesTripView(b, 'cancelled', undefined, Date.now());
const upcomingView = bookingMatchesTripView(b, 'upcoming', undefined, Date.now());
const label = rentalBookingSimpleStatusLabel(b, Date.now());
const events = buildPartnerUnifiedCalendarEvents({
  bookings: [b],
  fromYmd: '2035-08-01',
  toYmd: '2035-08-31',
  titlesByListingId: new Map([['${listingId}', 'CERT cancel']]),
  nowMs: Date.now(),
});
writeFileSync(process.argv[2], JSON.stringify({ cancelledView, upcomingView, label, eventCount: events.length, kinds: events.map(e => e.kind) }, null, 2));
`
    );
    const surfOut = resolve(`.tmp/cert-rental-cancel-surfaces-${RUN_ID}.json`);
    const surf = spawnSync('npx', ['vite-node', helper, surfOut], {
      encoding: 'utf8',
      cwd: resolve('.'),
      env: {
        ...process.env,
        VITE_SUPABASE_URL: SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: keys.anon,
      },
      maxBuffer: 5 * 1024 * 1024,
    });
    if (surf.status !== 0) {
      finding('P2', 'Surface lib check failed to run', (surf.stderr || surf.stdout || '').slice(-800));
    } else {
      const surface = JSON.parse(readFileSync(surfOut, 'utf8'));
      report.evidence.surfaces = surface;
      if (!surface.cancelledView || surface.upcomingView || surface.label !== 'Cancelled') {
        defect('P1', 'Trips libs do not show cancelled/refunded rental correctly', surface);
      } else {
        step('trips_cancelled_surface', surface);
      }
      if (surface.eventCount !== 0) {
        defect('P1', 'Calendar still shows collection/return for cancelled rental', surface);
      } else {
        step('calendar_excludes_cancelled', { eventCount: 0 });
      }
    }

    step('mission_06_5_complete');
  } catch (err) {
    fail('mission_06_5', err);
    defect('P0', 'Cert aborted', err instanceof Error ? err.message : String(err));
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
  console.error(err);
  process.exit(1);
});
