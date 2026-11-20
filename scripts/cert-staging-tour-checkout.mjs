/**
 * Staging-only tour checkout, payment, isolation, and refund.
 * Stripe test mode. Identities are *@example.com and are deleted afterward.
 * Refuses the production project.
 */
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCertEnv, resolveCertTarget, PRODUCTION_PROJECT_REF } from './cert-rental-target-guard.mjs';

const env = loadCertEnv();
const target = resolveCertTarget(env);
const PROJECT = target.projectRef;
const SUPABASE_URL = target.supabaseUrl;
const DATABASE_URL = target.databaseUrl;
const STRIPE_SK = target.stripeSecret;
const ANON = env.CERT_SUPABASE_ANON_KEY;
const SERVICE = env.CERT_SUPABASE_SERVICE_ROLE_KEY;
const RUN = randomUUID().slice(0, 8);
const PASSWORD = `Cert-${RUN}-pass`;
const report = { ok: false, project: PROJECT, runId: RUN, steps: [], errors: [] };

function step(name, detail = {}) {
  report.steps.push({ name, ok: true, ...detail });
  console.log('✓', name);
}
function fail(name, err) {
  const msg = err instanceof Error ? err.message : String(err);
  report.steps.push({ name, ok: false, error: msg.slice(0, 400) });
  report.errors.push(`${name}: ${msg.slice(0, 400)}`);
  console.error('✗', name, msg.slice(0, 400));
}
function dbQuery(sql) {
  if (DATABASE_URL.includes(PRODUCTION_PROJECT_REF)) throw new Error('ABORT production database');
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '--db-url', DATABASE_URL, '--yes', '--output', 'json', sql],
    { encoding: 'utf8', cwd: resolve('.'), maxBuffer: 12 * 1024 * 1024 }
  );
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').slice(-800));
  const out = (r.stdout || '').trim();
  if (!out || /^(DO|OK|UPDATE \d+|INSERT \d+( \d+)?|DELETE \d+)$/i.test(out)) return { rows: [] };
  const start = out.indexOf('[');
  const obj = out.indexOf('{');
  if (start >= 0 && (obj < 0 || start < obj)) return { rows: JSON.parse(out.slice(start)) };
  if (obj >= 0) return JSON.parse(out.slice(obj));
  throw new Error(out.slice(-400));
}
async function stripeForm(path, params, idempotencyKey) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const headers = { Authorization: `Bearer ${STRIPE_SK}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method: 'POST', headers, body });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `stripe ${res.status}`);
  return json;
}
async function createUser(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.msg || 'create user');
  if (!email.endsWith('@example.com')) throw new Error('refusing non-example identity');
  return json.id;
}
async function signIn(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(json.error_description || 'sign-in');
  return json.access_token;
}
async function deleteUser(id) {
  if (!id) return;
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE },
  });
}

const supplierEmail = `cert-tour-supplier-${RUN}@example.com`;
const otherEmail = `cert-tour-other-${RUN}@example.com`;
const guestEmail = `cert-tour-guest-${RUN}@example.com`;
let supplierId;
let otherId;
let guestId;
let listingId;
let bookingId;

try {
  if (PROJECT === PRODUCTION_PROJECT_REF) throw new Error('production refused');
  supplierId = await createUser(supplierEmail);
  otherId = await createUser(otherEmail);
  guestId = await createUser(guestEmail);
  step('identities');
  dbQuery(`insert into public.supplier_profiles (id, verification_status, payout_verification_status)
    values ('${supplierId}'::uuid, 'verified', 'verified'), ('${otherId}'::uuid, 'verified', 'verified')
    on conflict (id) do update set verification_status = excluded.verification_status, payout_verification_status = excluded.payout_verification_status;`);
  dbQuery(`insert into public.supplier_commercial_terms (supplier_id, plan_code, commission_bps, payout_cadence, effective_from, status, note)
    values ('${supplierId}'::uuid, 'standard', 1500, 'monthly', now() - interval '1 day', 'active', 'staging tour cert')
    on conflict do nothing;`);
  const extras = JSON.stringify({
    inventoryFamily: 'tour',
    departureTimezone: 'Europe/Helsinki',
    bookingOptions: [{
      id: 'cert-opt',
      name: 'CERT departure',
      duration: '2 hours',
      priceUsd: 30,
      weekdays: [true, true, true, true, true, true, true],
      startTime: '10:00',
      minPersons: 1,
      maxPersons: 4,
      maxSpotsPerSlot: 4,
      pickupPlace: 'CERT meeting point',
      fulfillment: 'meeting_point',
      optionInfo: 'Certification option only',
      travelerStartInstructions: 'Meet at the certification point.',
      availabilityDateFrom: '2026-01-01',
      availabilityDateTo: '2036-12-31',
    }],
  }).replace(/'/g, "''");
  const hero = 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=60';
  const listing = dbQuery(`insert into public.listings (
      supplier_id, title, destination, duration, style, status, price_starting_from, price_currency,
      listing_extras, city, country, image, meeting_point, group_size, experience_kind
    ) values (
      '${supplierId}'::uuid, 'CERT tour ${RUN}', 'Certville', '2 hours', 'adventure', 'published',
      30, 'EUR', '${extras}'::jsonb, 'Certville', 'Testland', '${hero}', 'CERT meeting point', '1-4 guests', 'tour'
    ) returning id::text as id, status;`);
  listingId = listing.rows?.[0]?.id;
  if (!listingId || listing.rows[0].status !== 'published') throw new Error('tour listing was not published');
  step('tour_listing_published', { listingId });

  const guestJwt = await signIn(guestEmail);
  const otherJwt = await signIn(otherEmail);
  const checkout = await fetch(`${SUPABASE_URL}/functions/v1/create-booking-checkout-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${guestJwt}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId,
      customerName: 'CERT Tour Guest',
      checkoutConsentAccepted: true,
      currency: 'EUR',
      bookingDate: '2034-06-13',
      guests: 1,
      bookingOptionId: 'cert-opt',
      startTime: '10:00',
      successPath: '/booking-confirmed',
      cancelPath: '/cart?payment=cancelled',
      returnOrigin: 'http://127.0.0.1:5184',
    }),
  });
  const checkoutJson = await checkout.json();
  bookingId = checkoutJson.bookingId;
  const sessionId = checkoutJson.checkoutSessionId || checkoutJson.sessionId || checkoutJson.id;
  if (!bookingId || !sessionId) {
    throw new Error(
      `${checkoutJson.error || checkoutJson.message || 'missing session'} status ${checkout.status} keys ${Object.keys(checkoutJson).join(',')}`
    );
  }
  step('tour_checkout_session', { bookingId });

  const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${STRIPE_SK}` },
  });
  const session = await sessionRes.json();
  if (!sessionRes.ok) throw new Error(session.error?.message || 'session retrieve');
  if (session.livemode) throw new Error('refusing live checkout session');
  const pm = await stripeForm('/payment_methods', {
    type: 'card',
    'card[token]': 'tok_visa',
    'billing_details[name]': 'CERT Tour Guest',
    'billing_details[email]': guestEmail,
    'billing_details[address][country]': 'FI',
  });
  const confirmed = await stripeForm(`/payment_pages/${session.id}/confirm`, {
    payment_method: pm.id,
    expected_amount: String(session.amount_total),
    expected_payment_method_type: 'card',
  });
  if (confirmed.payment_status !== 'paid' && confirmed.status !== 'complete') {
    throw new Error(`payment not complete: ${confirmed.payment_status || confirmed.status}`);
  }
  step('tour_test_payment', { amount: session.amount_total, livemode: false });

  const reconcile = await fetch(`${SUPABASE_URL}/functions/v1/reconcile-checkout-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${guestJwt}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  const reconcileJson = await reconcile.json().catch(() => ({}));
  const booked = dbQuery(`select status, payment_status, amount_paid::text from public.bookings where id = '${bookingId}'::uuid`).rows?.[0];
  if (booked?.status !== 'confirmed' || booked?.payment_status !== 'paid') {
    throw new Error(`not confirmed: ${JSON.stringify({ booked, reconcile: reconcile.status, body: reconcileJson.error || null })}`);
  }
  step('tour_confirmed', { status: booked.status, payment: booked.payment_status, amount: booked.amount_paid });

  const otherRead = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${otherJwt}` },
  });
  const otherRows = await otherRead.json();
  if (!Array.isArray(otherRows) || otherRows.length !== 0) {
    throw new Error(`other supplier can read the booking: ${otherRead.status}`);
  }
  step('other_supplier_cannot_read_booking');

  const paidRow = dbQuery(`select payment_intent_id from public.bookings where id = '${bookingId}'::uuid`).rows?.[0];
  const pi = paidRow?.payment_intent_id;
  if (!pi) throw new Error('confirmed booking has no payment intent');
  const refund = await stripeForm('/refunds', { payment_intent: pi, amount: String(session.amount_total) }, `tour-cert:${bookingId}`);
  const replay = await stripeForm('/refunds', { payment_intent: pi, amount: String(session.amount_total) }, `tour-cert:${bookingId}`);
  if (refund.id !== replay.id) throw new Error('refund idempotency failed');
  step('tour_refund_idempotent', { refundId: refund.id, status: refund.status });
  report.ok = true;
} catch (err) {
  fail('tour_journey', err);
} finally {
  try {
    if (listingId && !DATABASE_URL.includes(PRODUCTION_PROJECT_REF)) {
      dbQuery(`delete from public.bookings where listing_id = '${listingId}'::uuid;`);
      dbQuery(`delete from public.listings where id = '${listingId}'::uuid;`);
    }
  } catch (err) {
    fail('cleanup_rows', err);
  }
  await deleteUser(guestId);
  await deleteUser(otherId);
  await deleteUser(supplierId);
  writeFileSync('scripts/cert-staging-tour-checkout.report.json', JSON.stringify(report, null, 2));
  console.log(report.ok ? 'PASS' : 'FAIL');
  process.exit(report.ok ? 0 : 1);
}
