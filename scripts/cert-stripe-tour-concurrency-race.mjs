/**
 * Live Stripe TEST last-seat tour race.
 * Temporarily sets slotOverrides capacity=1 on a published tour departure,
 * pays two Checkout Sessions simultaneously, then restores overrides.
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
  if (r.status !== 0) throw new Error(`db query failed: ${(r.stderr || r.stdout).slice(-1000)}`);
  const out = r.stdout || '';
  const start = out.indexOf('{');
  if (start < 0) throw new Error(`no json: ${out.slice(-400)}`);
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

const LISTING_ID = 'ddf096fb-2dea-4f59-965f-3cd31907cf03';
const OPTION_ID = '06a932f7-7392-47a5-80cb-9c9e1afe53b6';
const START_HM = '20:00';
const BOOK_A = 'c3333333-3333-4333-8333-333333333333';
const BOOK_B = 'c4444444-4444-4444-8444-444444444444';
const DEPARTURE = '2026-12-18';
const AMOUNT_EUR = '99.00';
const AMOUNT_MINOR = 9900;

async function main() {
  const env = loadEnv();
  const sk = env.STRIPE_SECRET_KEY || '';
  if (!sk.startsWith('sk_test')) {
    console.error('ABORT: need sk_test');
    process.exit(2);
  }

  const report = { phase: 'tour_stripe_last_seat', startedAt: new Date().toISOString() };

  // Snapshot + set capacity 1 override for departure
  const snap = dbQuery(`
SELECT coalesce(listing_extras->'slotOverrides', '[]'::jsonb) AS overrides
FROM public.listings WHERE id='${LISTING_ID}'::uuid;
`);
  const priorOverrides = JSON.stringify(snap.rows?.[0]?.overrides ?? []);
  report.priorOverrides = snap.rows?.[0]?.overrides;

  dbQuery(`
UPDATE public.listings
SET listing_extras = jsonb_set(
  coalesce(listing_extras, '{}'::jsonb),
  '{slotOverrides}',
  coalesce(listing_extras->'slotOverrides', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('date', '${DEPARTURE}', 'startTimeHm', '${START_HM}', 'capacity', 1)
  ),
  true
)
WHERE id='${LISTING_ID}'::uuid;

DELETE FROM public.booking_payment_events WHERE booking_id IN ('${BOOK_A}'::uuid, '${BOOK_B}'::uuid);
DELETE FROM public.bookings WHERE id IN ('${BOOK_A}'::uuid, '${BOOK_B}'::uuid);

INSERT INTO public.bookings (
  id, listing_id, public_reference, status, payment_status, guests,
  booking_date, total_amount, currency, guest_email, guest_name,
  hold_expires_at, start_time, booking_option_id, purchase_snapshot
) VALUES
(
  '${BOOK_A}'::uuid, '${LISTING_ID}'::uuid, 'CERT-TOUR-A', 'pending', 'pending', 1,
  '${DEPARTURE}', ${AMOUNT_EUR}::numeric, 'EUR', 'cert-tour-a@example.com', 'Cert Tour A',
  now() + interval '45 minutes', '20:00:00', '${OPTION_ID}',
  jsonb_build_object('startTimeHm','${START_HM}','bookingOptionId','${OPTION_ID}')
),
(
  '${BOOK_B}'::uuid, '${LISTING_ID}'::uuid, 'CERT-TOUR-B', 'pending', 'pending', 1,
  '${DEPARTURE}', ${AMOUNT_EUR}::numeric, 'EUR', 'cert-tour-b@example.com', 'Cert Tour B',
  now() + interval '45 minutes', '20:00:00', '${OPTION_ID}',
  jsonb_build_object('startTimeHm','${START_HM}','bookingOptionId','${OPTION_ID}')
);
SELECT 'setup_ok' AS status;
`);
  console.error('setup_ok');

  const expiresAt = Math.floor(Date.now() / 1000) + 45 * 60;
  async function prep(bookingId, email, name) {
    const pm = await stripeForm(sk, '/payment_methods', {
      type: 'card',
      card: { token: 'tok_visa' },
      billing_details: { name, email },
    });
    const session = await stripeForm(sk, '/checkout/sessions', {
      mode: 'payment',
      success_url: 'https://traverion.com/trips?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://traverion.com/tours',
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
              name: '[CERT] Tour last-seat race',
              description: `${DEPARTURE} ${START_HM} · 1 guest`,
            },
          },
        },
      },
      metadata: {
        booking_id: bookingId,
        listing_id: LISTING_ID,
        user_id: `cert-${bookingId.slice(0, 8)}`,
        booking_option_id: OPTION_ID,
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
    return { pm, session };
  }

  const [prepA, prepB] = await Promise.all([
    prep(BOOK_A, 'cert-tour-a@example.com', 'Cert Tour A'),
    prep(BOOK_B, 'cert-tour-b@example.com', 'Cert Tour B'),
  ]);
  dbQuery(`
UPDATE public.bookings SET checkout_session_id='${prepA.session.id}', hold_expires_at=to_timestamp(${expiresAt}) WHERE id='${BOOK_A}'::uuid;
UPDATE public.bookings SET checkout_session_id='${prepB.session.id}', hold_expires_at=to_timestamp(${expiresAt}) WHERE id='${BOOK_B}'::uuid;
`);
  console.error('sessions_ok');

  const confirm = async (sessionId, pmId) => {
    const confirmed = await stripeForm(sk, `/payment_pages/${sessionId}/confirm`, {
      payment_method: pmId,
      return_url: 'https://traverion.com/trips',
    });
    const pi =
      typeof confirmed.payment_intent === 'string'
        ? confirmed.payment_intent
        : confirmed.payment_intent?.id;
    return { payment_status: confirmed.payment_status, payment_intent: pi };
  };

  const [paidA, paidB] = await Promise.all([
    confirm(prepA.session.id, prepA.pm.id),
    confirm(prepB.session.id, prepB.pm.id),
  ]);
  console.error('paid_ok', paidA.payment_status, paidB.payment_status);

  let books;
  let events;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    books = dbQuery(`
SELECT id, payment_status, status, amount_paid::text, guests
FROM public.bookings WHERE id IN ('${BOOK_A}'::uuid,'${BOOK_B}'::uuid) ORDER BY id;
`);
    events = dbQuery(`
SELECT event_type, booking_id::text FROM public.booking_payment_events
WHERE booking_id IN ('${BOOK_A}'::uuid,'${BOOK_B}'::uuid) ORDER BY created_at;
`);
    const paid = (books.rows || []).filter((r) => r.payment_status === 'paid').length;
    const hasRefund = (events.rows || []).some((e) => /inventory_conflict|refund/i.test(e.event_type));
    if (paid === 1 && (hasRefund || i >= 10)) break;
    if (paid > 1) break;
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

  const paidCount = (books.rows || []).filter((r) => r.payment_status === 'paid' && r.status === 'confirmed').length;
  const hasConflictRefund = (events.rows || []).some((e) => e.event_type === 'inventory_conflict_checkout_refund');
  const refundedOnStripe = stripeRefunds.filter((r) => r.count > 0).length;

  let verdict = 'FAIL';
  if (paidCount === 1 && (hasConflictRefund || refundedOnStripe >= 1)) verdict = 'PASS';
  else if (paidCount === 1) verdict = 'PARTIAL';
  else if (paidCount > 1) verdict = 'FAIL_OVERSELL';

  // Restore slotOverrides
  dbQuery(`
UPDATE public.listings
SET listing_extras = jsonb_set(
  coalesce(listing_extras, '{}'::jsonb),
  '{slotOverrides}',
  '${priorOverrides.replace(/'/g, "''")}'::jsonb,
  true
)
WHERE id='${LISTING_ID}'::uuid;
`);

  report.result = {
    verdict,
    bookings: books.rows,
    events: events.rows,
    stripeRefunds,
    paidConfirmed: paidCount,
    hasConflictRefundEvent: hasConflictRefund,
    stripeRefundPIs: refundedOnStripe,
  };
  report.finishedAt = new Date().toISOString();
  const outPath = resolve('scripts/.cert-tour-stripe-race-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict, outPath, ...report.result }, null, 2));
}

main().catch((err) => {
  // Best-effort restore note
  console.error('CERT_FAIL', String(err?.message || err));
  process.exit(1);
});
