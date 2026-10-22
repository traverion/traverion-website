/**
 * Stripe TEST evidence for Step 2.3 Stay auto-refunds.
 * Creates an isolated paid PI, queues a durable refund instruction in SQL,
 * executes the Stripe refund with the same idempotency key the edge uses,
 * verifies duplicate idempotency, then marks the fixture refunded.
 *
 *   node scripts/cert-stripe-stay-auto-refund.mjs
 *
 * Never prints secret keys. Never touches live guest bookings.
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
  if (r.status !== 0) throw new Error(`db query failed: ${(r.stderr || r.stdout).slice(-1200)}`);
  const out = r.stdout || '';
  const start = out.indexOf('{');
  if (start < 0) throw new Error(`no json in db output: ${out.slice(-500)}`);
  return JSON.parse(out.slice(start));
}

async function stripeFormIdempotent(sk, path, params, idempotencyKey) {
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

const LISTING_ID = 'e21b231b-392a-4912-ba7f-07f7b181a564';
const BOOKING_ID = 'a3333333-3333-4333-8333-333333333333';
const CHECK_IN = '2027-03-12';
const CHECK_OUT = '2027-03-14';
const AMOUNT_MINOR = 2700;
const IDEMPOTENCY = `stay-cancel-refund:${BOOKING_ID}`;

const report = {
  ok: false,
  steps: [],
  stripePaymentIntentId: null,
  stripeRefundId: null,
  stripeRefundStatus: null,
  duplicateRefundId: null,
  instructionStatus: null,
  nonRefundableBlocked: null,
  errors: [],
};

function step(name, detail = {}) {
  report.steps.push({ name, ...detail });
  console.log(`✓ ${name}`, Object.keys(detail).length ? JSON.stringify(detail) : '');
}

async function run() {
  try {
    const env = loadEnv();
    const sk = env.STRIPE_SECRET_KEY || '';
    if (!sk.startsWith('sk_test_')) throw new Error('Need sk_test_ STRIPE_SECRET_KEY');

    dbQuery(`delete from public.booking_refund_instructions where booking_id = '${BOOKING_ID}'::uuid;
delete from public.booking_payment_events where booking_id = '${BOOKING_ID}'::uuid;
delete from public.booking_messages where booking_id = '${BOOKING_ID}'::uuid;
delete from public.supplier_ledger_entries where booking_id = '${BOOKING_ID}'::uuid;
delete from public.bookings where id = '${BOOKING_ID}'::uuid;`);

    const pm = await stripeFormIdempotent(sk, '/payment_methods', {
      type: 'card',
      card: { token: 'tok_visa' },
    });
    const pi = await stripeFormIdempotent(sk, '/payment_intents', {
      amount: String(AMOUNT_MINOR),
      currency: 'eur',
      payment_method: pm.id,
      confirm: 'true',
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
      'metadata[booking_id]': BOOKING_ID,
      'metadata[cert]': 'stay_auto_refund_2_3',
    });
    if (pi.status !== 'succeeded') throw new Error(`PI not succeeded: ${pi.status}`);
    report.stripePaymentIntentId = pi.id;
    step('created_paid_pi', { paymentIntentId: pi.id, amountMinor: AMOUNT_MINOR });

    const snap = JSON.stringify({
      listingTitle: 'CERT Stay Auto Refund',
      optionLabel: null,
      meetingPoint: null,
      pickupInstructions: null,
      startTimeHm: null,
      capturedAt: new Date().toISOString(),
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      nights: 2,
      checkInTime: '16:00',
      departureTimezone: 'Europe/Helsinki',
      cancellationPreset: 'free_24h',
      freeCancelHours: 24,
      cancellationPolicy:
        'You may cancel free of charge up to 24 hours before check-in (property local time).',
      totalAmount: AMOUNT_MINOR / 100,
      currency: 'EUR',
    }).replace(/'/g, "''");

    dbQuery(`
insert into public.bookings (
  id, listing_id, guest_email, guest_name, guests, booking_date, check_out, nights,
  status, payment_status, payment_intent_id, amount_paid, currency, refund_choice,
  cancelled_at, purchase_snapshot, special_requests
) values (
  '${BOOKING_ID}'::uuid,
  '${LISTING_ID}'::uuid,
  'cert-stay-refund-${randomUUID().slice(0, 8)}@example.com',
  'CERT Stay Refund',
  2,
  '${CHECK_IN}'::date,
  '${CHECK_OUT}'::date,
  2,
  'cancelled',
  'paid',
  '${pi.id}',
  ${AMOUNT_MINOR / 100.0},
  'EUR',
  'full_refund',
  now(),
  '${snap}'::jsonb,
  '{"cert":"stay_auto_refund_2_3","nights":2}'::jsonb
);`);
    step('inserted_cancelled_stay_booking', { bookingId: BOOKING_ID });

    const isStay = dbQuery(
      `select public.booking_is_stay_night(b) as stay from public.bookings b where id = '${BOOKING_ID}'::uuid;`
    );
    if (!isStay.rows?.[0]?.stay) throw new Error('fixture is not detected as stay night');
    step('fixture_is_stay', { stay: true });

    const ensure = dbQuery(
      `select public.ensure_stay_cancel_refund_instruction('${BOOKING_ID}'::uuid, 'cert_traveler_self_cancel', null) as r;`
    );
    const ensureRow = ensure.rows?.[0]?.r;
    if (!ensureRow?.ok) throw new Error(`ensure failed: ${JSON.stringify(ensureRow)}`);
    step('ensure_instruction', {
      id: ensureRow.id,
      status: ensureRow.status,
      amountMinor: ensureRow.amount_minor,
    });

    const claim = dbQuery(
      `select public.claim_refund_instruction_for_execution('${IDEMPOTENCY}', 120) as r;`
    );
    const claimRow = claim.rows?.[0]?.r;
    if (!claimRow?.ok) throw new Error(`claim failed: ${JSON.stringify(claimRow)}`);
    step('claim_instruction', { status: claimRow.status });

    const refund = await stripeFormIdempotent(
      sk,
      '/refunds',
      {
        payment_intent: pi.id,
        amount: String(AMOUNT_MINOR),
        reason: 'requested_by_customer',
        'metadata[booking_id]': BOOKING_ID,
        'metadata[traverion_refund_key]': IDEMPOTENCY,
      },
      IDEMPOTENCY
    );
    report.stripeRefundId = refund.id;
    report.stripeRefundStatus = refund.status;
    step('stripe_refund_created', { refundId: refund.id, status: refund.status });

    const dup = await stripeFormIdempotent(
      sk,
      '/refunds',
      {
        payment_intent: pi.id,
        amount: String(AMOUNT_MINOR),
        reason: 'requested_by_customer',
        'metadata[booking_id]': BOOKING_ID,
        'metadata[traverion_refund_key]': IDEMPOTENCY,
      },
      IDEMPOTENCY
    );
    report.duplicateRefundId = dup.id;
    if (dup.id !== refund.id) throw new Error(`idempotency broken: ${dup.id} != ${refund.id}`);
    step('stripe_refund_idempotent_replay', { refundId: dup.id });

    const marked = dbQuery(
      `select public.mark_refund_instruction_submitted('${IDEMPOTENCY}', '${refund.id}', '${refund.status}') as r;`
    );
    const markedRow = marked.rows?.[0]?.r;
    if (!markedRow?.ok) throw new Error(`mark submitted failed: ${JSON.stringify(markedRow)}`);
    report.instructionStatus = markedRow.status;
    step('mark_instruction_submitted', { status: markedRow.status });

    dbQuery(
      `update public.bookings set refund_choice = 'no_refund', auto_refund_status = null where id = '${BOOKING_ID}'::uuid;`
    );
    const skip = dbQuery(
      `select public.ensure_stay_cancel_refund_instruction('${BOOKING_ID}'::uuid, 'cert_non_refundable', null) as r;`
    );
    const skipRow = skip.rows?.[0]?.r;
    report.nonRefundableBlocked = skipRow?.error === 'no_refund_entitlement';
    if (!report.nonRefundableBlocked) {
      throw new Error(`expected no_refund_entitlement, got ${JSON.stringify(skipRow)}`);
    }
    step('non_refundable_blocked', { error: skipRow.error });

    dbQuery(
      `update public.bookings set refund_choice = 'full_refund', payment_status = 'refunded', amount_paid = ${AMOUNT_MINOR / 100.0} where id = '${BOOKING_ID}'::uuid;
select public.mark_booking_refund_instructions_succeeded('${BOOKING_ID}'::uuid, '${refund.id}');`
    );
    step('webhook_style_success_mark', { paymentStatus: 'refunded' });

    const verify = await stripeGet(sk, `/refunds/${refund.id}`);
    step('stripe_refund_verified', { id: verify.id, status: verify.status, amount: verify.amount });

    report.ok = true;
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
    console.error('✗', report.errors[report.errors.length - 1]);
  }

  const outPath = resolve('scripts/cert-stripe-stay-auto-refund.report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(report.ok ? '\nPASS — report written' : '\nFAIL — report written', outPath);
  process.exit(report.ok ? 0 : 1);
}

run();
