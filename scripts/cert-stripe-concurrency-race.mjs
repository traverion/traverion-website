/**
 * Live Stripe TEST concurrency race (Stay Instant Book).
 * Pays two Checkout Sessions via Payment Pages confirm (TEST tokens only).
 * Relies on deployed stripe-webhook at Traverion Supabase.
 *
 *   node scripts/cert-stripe-concurrency-race.mjs
 *
 * Never prints secret keys or client_secrets.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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
  if (r.status !== 0) throw new Error(`db query failed: ${(r.stderr || r.stdout).slice(-800)}`);
  const out = r.stdout || '';
  const start = out.indexOf('{');
  if (start < 0) throw new Error(`no json in db output: ${out.slice(-500)}`);
  return JSON.parse(out.slice(start));
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Published Instant Book stay (Arctic Aurora) — far enough out to avoid live guest nights.
const LISTING_ID = 'e21b231b-392a-4912-ba7f-07f7b181a564';
const BOOK_A = 'c1111111-1111-4111-8111-111111111111';
const BOOK_B = 'c2222222-2222-4222-8222-222222222222';
const CHECK_IN = '2026-12-15';
const CHECK_OUT = '2026-12-17';
const AMOUNT_EUR = '42.00';
const AMOUNT_MINOR = 4200;

async function createPaidSession(sk, { bookingId, email, name }) {
  const expiresAt = Math.floor(Date.now() / 1000) + 45 * 60;
  const pm = await stripeForm(sk, '/payment_methods', {
    type: 'card',
    card: { token: 'tok_visa' },
    billing_details: { name, email },
  });
  const session = await stripeForm(sk, '/checkout/sessions', {
    mode: 'payment',
    success_url: 'https://traverion.com/trips?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://traverion.com/stays',
    expires_at: expiresAt,
    customer_email: email,
    payment_method_types: { 0: 'card' },
    line_items: {
      0: {
        quantity: '1',
        price_data: {
          currency: 'eur',
          unit_amount: String(AMOUNT_MINOR),
          product_data: {
            name: '[CERT] Stripe Stay Race',
            description: `${CHECK_IN} · 2 guests`,
          },
        },
      },
    },
    metadata: {
      booking_id: bookingId,
      listing_id: LISTING_ID,
      user_id: `cert-${bookingId.slice(0, 8)}`,
      booking_option_id: '',
      quoted_total: AMOUNT_EUR,
      stay_request_to_book: '0',
    },
    payment_intent_data: {
      metadata: {
        booking_id: bookingId,
        listing_id: LISTING_ID,
        user_id: `cert-${bookingId.slice(0, 8)}`,
        stay_request_to_book: '0',
      },
    },
  });
  return { session, pm, expiresAt };
}

async function confirmSession(sk, sessionId, pmId) {
  const confirmed = await stripeForm(sk, `/payment_pages/${sessionId}/confirm`, {
    payment_method: pmId,
    return_url: 'https://traverion.com/trips',
  });
  const pi =
    typeof confirmed.payment_intent === 'string'
      ? confirmed.payment_intent
      : confirmed.payment_intent?.id;
  return {
    payment_status: confirmed.payment_status,
    status: confirmed.status,
    payment_intent: pi,
  };
}

async function main() {
  const env = loadEnv();
  const sk = env.STRIPE_SECRET_KEY || '';
  if (!sk.startsWith('sk_test')) {
    console.error('ABORT: STRIPE_SECRET_KEY must be sk_test');
    process.exit(2);
  }

  const report = { phase: 'stay_stripe_race', startedAt: new Date().toISOString(), steps: [] };

  dbQuery(`
DO $$
BEGIN
  -- Refuse if live inventory already occupies these nights.
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.listing_id = '${LISTING_ID}'::uuid
      AND b.id NOT IN ('${BOOK_A}'::uuid, '${BOOK_B}'::uuid)
      AND public.booking_occupies_inventory(b.status, b.payment_status, b.hold_expires_at, b.created_at)
      AND b.booking_date < '${CHECK_OUT}'::date
      AND public.stay_booking_check_out(b) > '${CHECK_IN}'::date
  ) THEN
    RAISE EXCEPTION 'Cert nights already occupied on live listing — abort';
  END IF;

  DELETE FROM public.booking_payment_events WHERE booking_id IN ('${BOOK_A}'::uuid, '${BOOK_B}'::uuid);
  DELETE FROM public.bookings WHERE id IN ('${BOOK_A}'::uuid, '${BOOK_B}'::uuid);

  INSERT INTO public.bookings (
    id, listing_id, public_reference, status, payment_status, guests,
    booking_date, check_out, nights, total_amount, currency,
    guest_email, guest_name, hold_expires_at, purchase_snapshot
  ) VALUES
  (
    '${BOOK_A}'::uuid, '${LISTING_ID}'::uuid, 'CERT-STRIPE-A', 'pending', 'pending', 2,
    '${CHECK_IN}', '${CHECK_OUT}', 2, ${AMOUNT_EUR}::numeric, 'EUR',
    'cert-a@example.com', 'Cert Guest A', now() + interval '45 minutes',
    jsonb_build_object('checkIn','${CHECK_IN}','checkOut','${CHECK_OUT}','nights',2)
  ),
  (
    '${BOOK_B}'::uuid, '${LISTING_ID}'::uuid, 'CERT-STRIPE-B', 'pending', 'pending', 2,
    '${CHECK_IN}', '${CHECK_OUT}', 2, ${AMOUNT_EUR}::numeric, 'EUR',
    'cert-b@example.com', 'Cert Guest B', now() + interval '45 minutes',
    jsonb_build_object('checkIn','${CHECK_IN}','checkOut','${CHECK_OUT}','nights',2)
  );
END $$;
SELECT 'setup_ok' AS status;
`);
  report.steps.push({ step: 'fixture_setup', ok: true });
  console.error('setup_ok');

  const [prepA, prepB] = await Promise.all([
    createPaidSession(sk, { bookingId: BOOK_A, email: 'cert-a@example.com', name: 'Cert Guest A' }),
    createPaidSession(sk, { bookingId: BOOK_B, email: 'cert-b@example.com', name: 'Cert Guest B' }),
  ]);

  dbQuery(`
UPDATE public.bookings SET checkout_session_id='${prepA.session.id}', hold_expires_at=to_timestamp(${prepA.expiresAt})
WHERE id='${BOOK_A}'::uuid;
UPDATE public.bookings SET checkout_session_id='${prepB.session.id}', hold_expires_at=to_timestamp(${prepB.expiresAt})
WHERE id='${BOOK_B}'::uuid;
`);
  console.error('sessions_ok', prepA.session.id, prepB.session.id);
  report.steps.push({
    step: 'sessions_created',
    a: prepA.session.id,
    b: prepB.session.id,
  });

  // Simultaneous payment completion
  const [paidA, paidB] = await Promise.all([
    confirmSession(sk, prepA.session.id, prepA.pm.id),
    confirmSession(sk, prepB.session.id, prepB.pm.id),
  ]);
  console.error('paid_ok', paidA.payment_status, paidB.payment_status);
  report.steps.push({
    step: 'payments_confirmed',
    a: { payment_status: paidA.payment_status, pi: paidA.payment_intent },
    b: { payment_status: paidB.payment_status, pi: paidB.payment_intent },
  });

  let books = null;
  let events = null;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    books = dbQuery(`
SELECT id, payment_status, status, amount_paid::text, payment_intent_id, checkout_session_id
FROM public.bookings WHERE id IN ('${BOOK_A}'::uuid,'${BOOK_B}'::uuid) ORDER BY id;
`);
    events = dbQuery(`
SELECT event_type, booking_id::text, payment_intent_id, amount::text
FROM public.booking_payment_events
WHERE booking_id IN ('${BOOK_A}'::uuid,'${BOOK_B}'::uuid) ORDER BY created_at;
`);
    const paid = (books.rows || []).filter((r) => r.payment_status === 'paid' && r.status === 'confirmed').length;
    const hasRefundEvt = (events.rows || []).some((e) =>
      /inventory_conflict|orphan_checkout_refund|underpay/i.test(e.event_type)
    );
    report.poll = { i, paid, events: events.rows, books: books.rows };
    if (paid >= 1 && (paid === 1 || hasRefundEvt)) {
      if (paid === 1 && hasRefundEvt) break;
      if (paid === 1 && i >= 8) break; // allow time for refund event
    }
    if (paid > 1) break; // oversell — fail fast
  }

  const stripeRefunds = [];
  for (const pi of [paidA.payment_intent, paidB.payment_intent].filter(Boolean)) {
    const list = await stripeGet(sk, `/refunds?payment_intent=${pi}&limit=5`);
    stripeRefunds.push({
      pi,
      count: (list.data || []).length,
      statuses: (list.data || []).map((r) => ({ id: r.id, status: r.status, amount: r.amount })),
    });
  }

  // Duplicate webhook resilience: re-fetch sessions and note webhook event rows
  const wh = dbQuery(`
SELECT id, status, event_type
FROM public.stripe_webhook_events
WHERE id IN (
  SELECT event_id FROM public.booking_payment_events
  WHERE booking_id IN ('${BOOK_A}'::uuid,'${BOOK_B}'::uuid)
)
ORDER BY received_at DESC NULLS LAST
LIMIT 10;
`);

  const paidCount = (books.rows || []).filter((r) => r.payment_status === 'paid' && r.status === 'confirmed').length;
  const hasConflictRefund = (events.rows || []).some((e) => e.event_type === 'inventory_conflict_checkout_refund');
  const refundedOnStripe = stripeRefunds.filter((r) => r.count > 0).length;
  const pendingLoser = (books.rows || []).filter((r) => r.payment_status !== 'paid').length;

  let verdict = 'FAIL';
  if (paidCount === 1 && (hasConflictRefund || refundedOnStripe >= 1) && pendingLoser === 1) verdict = 'PASS';
  else if (paidCount === 1 && pendingLoser === 1) verdict = 'PARTIAL';
  else if (paidCount > 1) verdict = 'FAIL_OVERSELL';

  report.result = {
    verdict,
    bookings: books.rows,
    paymentEvents: events.rows,
    stripeRefunds,
    webhookEvents: wh.rows,
    paidConfirmed: paidCount,
    hasConflictRefundEvent: hasConflictRefund,
    stripeRefundPIs: refundedOnStripe,
  };
  report.finishedAt = new Date().toISOString();

  const outPath = resolve('scripts/.cert-stay-stripe-race-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict,
        outPath,
        paidConfirmed: paidCount,
        hasConflictRefundEvent: hasConflictRefund,
        stripeRefundPIs: refundedOnStripe,
        bookings: books.rows?.map((b) => ({
          id: b.id,
          payment_status: b.payment_status,
          status: b.status,
          amount_paid: b.amount_paid,
        })),
        events: events.rows,
        refunds: stripeRefunds,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('CERT_FAIL', String(err?.message || err));
  process.exit(1);
});
