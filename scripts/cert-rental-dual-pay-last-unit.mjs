/**
 * Mission 06.2 — Rental Instant Book no-hold last-unit dual-pay certification.
 *
 * Staging + Stripe TEST only. Exercises post-migration-294 promote path:
 *   claim (no hold) → Stripe pay ×2 → promotePaidFromCheckoutSession
 *     → confirm_rental_checkout_paid → one winner + inventory_conflict refund.
 *
 * Dashboard Stripe webhook currently points at production; staging promote is
 * driven by reconcile-checkout-session (same promotePaidFromCheckoutSession as
 * the webhook). Foreign-env isolation is verified against the production webhook.
 *
 *   CERT_USE_HOSTED_CHECKOUT=1 node scripts/cert-rental-dual-pay-last-unit.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  PRODUCTION_PROJECT_REF,
  loadCertEnv,
  resolveCertTarget,
} from './cert-rental-target-guard.mjs';

const certEnv = loadCertEnv();
const certTarget = resolveCertTarget(certEnv);
const PROJECT = certTarget.projectRef;
const SUPABASE_URL = certTarget.supabaseUrl;
const DATABASE_URL = certTarget.databaseUrl;
const STRIPE_SK = certTarget.stripeSecret;
const CHECKOUT_FN = `${SUPABASE_URL}/functions/v1/create-booking-checkout-session`;
const RECONCILE_FN = `${SUPABASE_URL}/functions/v1/reconcile-checkout-session`;
const RUN_ID = randomUUID().slice(0, 8);
const VARIANT = 'cert-last-unit';
const UNIT_MINOR = 2500;
const PICKUP = '2035-06-10T09:00:00+00:00';
const RETURN = '2035-06-11T09:00:00+00:00';
const OUT = resolve('scripts/cert-rental-dual-pay-last-unit.report.json');

const report = {
  ok: false,
  phase: 'rental_dual_pay_last_unit_post_294',
  mission: '06.2',
  startedAt: new Date().toISOString(),
  runId: RUN_ID,
  environment: {
    project: PROJECT,
    productionRefRejected: PRODUCTION_PROJECT_REF,
    stripeMode: 'test',
    checkoutFunction: CHECKOUT_FN,
    promotePath: 'reconcile-checkout-session → promotePaidFromCheckoutSession → confirm_rental_checkout_paid',
    note: 'Dashboard Stripe webhook is production-only; staging promote uses reconcile (same promote core as webhook).',
  },
  safety: {},
  steps: [],
  errors: [],
  ids: {},
  verdict: 'UNVERIFIED',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function step(name, extra = {}) {
  const row = { name, ok: true, at: new Date().toISOString(), ...extra };
  report.steps.push(row);
  console.log('✓', name, Object.keys(extra).length ? JSON.stringify(extra) : '');
}

function fail(name, err, extra = {}) {
  const message = err instanceof Error ? err.message : String(err);
  report.steps.push({ name, ok: false, at: new Date().toISOString(), error: message, ...extra });
  report.errors.push(`${name}: ${message}`);
  console.error('✗', name, message);
}

function writeReport() {
  report.finishedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('report →', OUT);
}

function loadApiKeys() {
  return {
    anon: certEnv.CERT_SUPABASE_ANON_KEY || '',
    service: certEnv.CERT_SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

function dbQuery(sql) {
  if (DATABASE_URL.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('ABORT: refusing production database URL inside dbQuery');
  }
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '--db-url', DATABASE_URL, '--output', 'json', sql],
    { encoding: 'utf8', cwd: resolve('.'), maxBuffer: 20 * 1024 * 1024 }
  );
  if (r.status !== 0) throw new Error(`db query failed: ${(r.stderr || r.stdout || '').slice(-1500)}`);
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
  if (!res.ok) throw new Error(`create user failed: ${json?.msg || json?.error || json?.message || res.status}`);
  if (!String(json.email || '').endsWith('@example.com')) {
    throw new Error('refusing user whose email is not example.com');
  }
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
    throw new Error(`sign-in failed: ${json?.error_description || json?.msg || res.status}`);
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

function rentalBody(listingId, expectedTotal = 25) {
  return {
    listingId,
    customerName: 'CERT Dual Pay Guest',
    checkoutConsentAccepted: true,
    expectedTotal,
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
  };
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

async function completeHostedCheckout(sk, session, label) {
  const pm = await stripeForm(sk, '/payment_methods', {
    type: 'card',
    card: { token: 'tok_visa' },
    billing_details: {
      name: label,
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
    throw new Error(`payment page confirm not paid: ${paymentStatus || 'unknown'}`);
  }
  return { ok: true, via: 'payment_pages_confirm_tok_visa', paymentStatus };
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
  const json = await res.json().catch(() => ({}));
  return { http: res.status, json };
}

function bookingRow(id) {
  return dbQuery(
    `select id::text, status, payment_status, amount_paid::text, total_amount::text,
            checkout_session_id, payment_intent_id, public_reference, guest_email
     from public.bookings where id = '${id}'::uuid`
  ).rows?.[0];
}

function holdsForBooking(bookingId) {
  return dbQuery(
    `select id::text, status, quantity
     from public.rental_inventory_holds
     where booking_id = '${bookingId}'::uuid
     order by created_at`
  ).rows;
}

function holdsForListing(listingId) {
  return dbQuery(
    `select id::text, booking_id::text, status, quantity, variant_id
     from public.rental_inventory_holds
     where listing_id = '${listingId}'::uuid
     order by created_at`
  ).rows;
}

function reservedQty(listingId) {
  return Number(
    dbQuery(`
      select public.rental_variant_reserved_quantity(
        '${listingId}'::uuid,
        '${VARIANT}',
        timestamptz '${PICKUP}',
        timestamptz '${RETURN}'
      )::int as n
    `).rows?.[0]?.n ?? -1
  );
}

async function pollUntil(pred, timeoutMs = 90000, intervalMs = 2000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = pred();
    if (last && last.ok) return last;
    await sleep(intervalMs);
  }
  return last;
}

function cleanupListing(listingId) {
  if (!listingId) return;
  dbQuery(`
DO $$
DECLARE v_listing uuid := '${listingId}'::uuid;
BEGIN
  DELETE FROM public.booking_commercial_snapshots
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.booking_refund_instructions
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.booking_payment_events
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.transactional_email_log
    WHERE entity_id IN (SELECT id::text FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.rental_booking_events WHERE listing_id = v_listing;
  DELETE FROM public.rental_inventory_holds WHERE listing_id = v_listing;
  DELETE FROM public.supplier_earning_items
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.bookings WHERE listing_id = v_listing;
  DELETE FROM public.listings WHERE id = v_listing;
END $$;
`);
}

async function assertProductionWebhooksRemainEnabled(sk) {
  const listed = await stripeGet(sk, '/webhook_endpoints?limit=100');
  const prod = (listed.data || []).filter((endpoint) =>
    String(endpoint.url || '').includes(PRODUCTION_PROJECT_REF)
  );
  const disabled = prod.filter((endpoint) => endpoint.status === 'disabled');
  if (disabled.length) {
    throw new Error(
      `ABORT: production Stripe webhook(s) are disabled (${disabled.map((e) => e.id).join(', ')})`
    );
  }
  const stagingHooks = (listed.data || []).filter((endpoint) =>
    String(endpoint.url || '').includes(PROJECT)
  );
  return { prod, stagingHooks };
}

async function run() {
  if (PROJECT === PRODUCTION_PROJECT_REF || SUPABASE_URL.includes(PRODUCTION_PROJECT_REF)) {
    fail('target', new Error('ABORT: refusing production Traverionapp'));
    report.verdict = 'UNVERIFIED';
    writeReport();
    process.exit(2);
  }
  if (!STRIPE_SK.startsWith('sk_test_')) {
    fail('stripe_mode', new Error('ABORT: Stripe keys must be test mode'));
    report.verdict = 'UNVERIFIED';
    writeReport();
    process.exit(2);
  }

  const keys = loadApiKeys();
  if (!keys.anon || !keys.service) {
    fail('api_keys', new Error('staging anon/service keys missing'));
    report.verdict = 'UNVERIFIED';
    writeReport();
    process.exit(2);
  }

  // Confirm post-294 claim semantics on staging.
  const noHold = dbQuery(`
    select pg_get_functiondef(oid) like '%instant_book_no_hold%' as claim_is_no_hold
    from pg_proc where proname = 'claim_rental_checkout_booking'
    limit 1
  `).rows?.[0];
  if (!noHold?.claim_is_no_hold) {
    fail('mig_294', new Error('staging claim_rental_checkout_booking is not Instant Book no-hold'));
    report.verdict = 'UNVERIFIED';
    writeReport();
    process.exit(2);
  }
  step('staging_claim_is_instant_book_no_hold');

  const stagingCap = await fetch(CHECKOUT_FN, {
    method: 'POST',
    headers: {
      apikey: keys.anon,
      Authorization: `Bearer ${keys.anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ intent: 'rental_checkout_capability' }),
  });
  const stagingCapJson = await stagingCap.json().catch(() => ({}));
  if (!(stagingCapJson.success === true && stagingCapJson.rentalCheckoutEnabled === true)) {
    fail('staging_flag', new Error(`staging rental checkout closed: ${JSON.stringify(stagingCapJson)}`));
    report.verdict = 'UNVERIFIED';
    writeReport();
    process.exit(2);
  }
  step('staging_rental_checkout_enabled', stagingCapJson);

  try {
    const hooks = await assertProductionWebhooksRemainEnabled(STRIPE_SK);
    step('stripe_webhook_endpoints', {
      productionEnabled: hooks.prod.length,
      stagingDashboardEndpoints: hooks.stagingHooks.length,
      productionIds: hooks.prod.map((h) => h.id),
    });
  } catch (err) {
    fail('production_stripe_webhook_guard', err);
    report.verdict = 'UNVERIFIED';
    writeReport();
    process.exit(2);
  }

  const password = randomBytes(18).toString('base64url');
  const guestAEmail = `cert-dual-a-${RUN_ID}@example.com`;
  const guestBEmail = `cert-dual-b-${RUN_ID}@example.com`;
  const supplierEmail = `cert-dual-supplier-${RUN_ID}@example.com`;
  report.ids.guestAEmail = guestAEmail;
  report.ids.guestBEmail = guestBEmail;

  let listingId = null;
  let guestAId = null;
  let guestBId = null;
  let supplierId = null;

  try {
    guestAId = await createConfirmedUser(keys.service, guestAEmail, password);
    guestBId = await createConfirmedUser(keys.service, guestBEmail, password);
    supplierId = await createConfirmedUser(keys.service, supplierEmail, password);
    report.ids.guestAId = guestAId;
    report.ids.guestBId = guestBId;
    report.ids.supplierId = supplierId;

    dbQuery(`
      insert into public.supplier_profiles (id)
      values ('${supplierId}'::uuid)
      on conflict (id) do nothing;
    `);
    dbQuery(`
      insert into public.supplier_commercial_terms (
        supplier_id, plan_code, commission_bps, payout_cadence, effective_from, status, note
      )
      select '${supplierId}'::uuid, 'standard', 1500, 'monthly', now() - interval '1 day', 'active',
             'cert dual-pay staging'
      where not exists (
        select 1 from public.supplier_commercial_terms t
        where t.supplier_id = '${supplierId}'::uuid
          and t.status = 'active'
          and t.effective_until is null
      );
    `);

    const guestAJwt = await signIn(keys.anon, guestAEmail, password);
    const guestBJwt = await signIn(keys.anon, guestBEmail, password);
    step('cert_identities_example_com');

    const extras = JSON.stringify({
      inventoryFamily: 'rental',
      departureTimezone: 'Europe/Helsinki',
      rental: {
        durationMode: 'daily',
        category: 'equipment',
        itemType: 'camera',
        pickupAddress: 'CERT Dual Pay Desk, Test City',
        cancellationPreset: 'flexible_24h',
        variants: [
          {
            id: VARIANT,
            name: 'Last Unit Dual Pay',
            quantity: 1,
            durationMode: 'daily',
            pricingOverride: { pricePerDayMinor: UNIT_MINOR },
          },
        ],
      },
      galleryImageUrls: [
        'https://example.com/cert-rental-a.jpg',
        'https://example.com/cert-rental-b.jpg',
      ],
    }).replace(/'/g, "''");

    const inserted = dbQuery(`
      insert into public.listings (
        supplier_id, title, destination, duration, style,
        status, price_starting_from, price_currency, listing_extras
      ) values (
        '${supplierId}'::uuid,
        'CERT rental dual-pay ${RUN_ID}',
        'Test',
        '1 day',
        'adventure',
        'draft',
        25,
        'EUR',
        '${extras}'::jsonb
      )
      returning id::text as id, status;
    `);
    listingId = inserted.rows?.[0]?.id;
    if (!listingId) throw new Error('draft listing insert failed');
    report.ids.listingId = listingId;
    step('fixture_listing_draft_stock_1', { listingId: listingId.slice(0, 8), variant: VARIANT });

    const evalRes = dbQuery(`
      select public.evaluate_rental_availability(
        '${listingId}'::uuid,
        '${VARIANT}',
        1,
        timestamptz '${PICKUP}',
        timestamptz '${RETURN}',
        null::uuid
      ) as r;
    `).rows?.[0]?.r;
    if (!evalRes || evalRes.ok !== true) {
      throw new Error(`evaluate_rental_availability failed: ${JSON.stringify(evalRes)}`);
    }
    step('evaluate_availability', evalRes);

    if (reservedQty(listingId) !== 0) {
      throw new Error(`expected 0 reserved before checkout, got ${reservedQty(listingId)}`);
    }

    const [a, b] = await Promise.all([
      postCheckout(guestAJwt, keys.anon, rentalBody(listingId)),
      postCheckout(guestBJwt, keys.anon, rentalBody(listingId)),
    ]);
    report.ids.checkoutA = {
      http: a.status,
      success: a.json?.success === true,
      bookingId: a.json?.bookingId || null,
      sessionId: a.json?.sessionId || null,
      error: a.json?.error || null,
    };
    report.ids.checkoutB = {
      http: b.status,
      success: b.json?.success === true,
      bookingId: b.json?.bookingId || null,
      sessionId: b.json?.sessionId || null,
      error: b.json?.error || null,
    };

    const sessions = [a, b].filter((r) => r.json?.success && r.json.sessionId && r.json.bookingId);
    if (sessions.length !== 2) {
      throw new Error(
        `expected 2 unpaid checkout sessions under no-hold; got ${sessions.length}: ${JSON.stringify([
          report.ids.checkoutA,
          report.ids.checkoutB,
        ])}`
      );
    }
    step('two_checkout_sessions_created', {
      sessions: 2,
      bookingA: sessions[0].json.bookingId.slice(0, 8),
      bookingB: sessions[1].json.bookingId.slice(0, 8),
    });

    const holdsBeforePay = holdsForListing(listingId);
    const activeBefore = holdsBeforePay.filter((h) => h.status === 'held' || h.status === 'confirmed');
    if (activeBefore.length !== 0) {
      throw new Error(`unpaid checkouts reserved inventory: ${JSON.stringify(holdsBeforePay)}`);
    }
    if (reservedQty(listingId) !== 0) {
      throw new Error(`reserved qty before pay should be 0, got ${reservedQty(listingId)}`);
    }
    step('unpaid_checkouts_do_not_reserve_inventory', {
      holds: holdsBeforePay.length,
      reserved: 0,
    });

    const sessionA = await stripeGet(STRIPE_SK, `/checkout/sessions/${a.json.sessionId}`);
    const sessionB = await stripeGet(STRIPE_SK, `/checkout/sessions/${b.json.sessionId}`);
    for (const s of [sessionA, sessionB]) {
      if (s.livemode !== false) throw new Error('session is livemode');
      if (s.amount_total !== UNIT_MINOR) throw new Error(`amount_total ${s.amount_total} != ${UNIT_MINOR}`);
      if (s.metadata?.traverion_supabase_project_ref !== PROJECT) {
        throw new Error(
          `env stamp mismatch: expected ${PROJECT}, got ${s.metadata?.traverion_supabase_project_ref}`
        );
      }
      if (s.metadata?.inventory_family !== 'rental') throw new Error('inventory_family metadata missing');
    }
    step('stripe_sessions_test_mode_stamped', {
      amount_total: UNIT_MINOR,
      projectRef: PROJECT,
    });

    // Pay both as close together as possible.
    const payStarted = Date.now();
    const [payA, payB] = await Promise.all([
      completeHostedCheckout(STRIPE_SK, sessionA, 'CERT Dual A'),
      completeHostedCheckout(STRIPE_SK, sessionB, 'CERT Dual B'),
    ]);
    step('both_payments_completed_stripe_test', {
      elapsedMs: Date.now() - payStarted,
      payA: payA.paymentStatus,
      payB: payB.paymentStatus,
    });

    // Race promote via reconcile (same core as webhook promote).
    const [recA, recB] = await Promise.all([
      reconcile(guestAJwt, keys.anon, a.json.sessionId),
      reconcile(guestBJwt, keys.anon, b.json.sessionId),
    ]);
    step('dual_reconcile_promote_race', {
      a: {
        http: recA.http,
        promoted: recA.json?.promoted,
        alreadySettled: recA.json?.alreadySettled,
        ignored: recA.json?.ignored,
        inventoryRefunded: recA.json?.inventoryRefunded,
        reason: recA.json?.reason || null,
        error: recA.json?.error || null,
      },
      b: {
        http: recB.http,
        promoted: recB.json?.promoted,
        alreadySettled: recB.json?.alreadySettled,
        ignored: recB.json?.ignored,
        inventoryRefunded: recB.json?.inventoryRefunded,
        reason: recB.json?.reason || null,
        error: recB.json?.error || null,
      },
    });

    const settled = await pollUntil(() => {
      const rowA = bookingRow(a.json.bookingId);
      const rowB = bookingRow(b.json.bookingId);
      const paidConfirmed = [rowA, rowB].filter(
        (r) => r?.payment_status === 'paid' && r?.status === 'confirmed'
      );
      // Loser may be cancelled/pending on staging because charge.refunded webhooks
      // only hit the production Dashboard endpoint; Stripe refund is authoritative here.
      const notWinner = [rowA, rowB].filter(
        (r) => r && !(r.payment_status === 'paid' && r.status === 'confirmed')
      );
      const ok = paidConfirmed.length === 1 && notWinner.length === 1;
      return { ok, rowA, rowB, paidConfirmed, notWinner };
    }, 120000, 2500);

    const rowA = settled?.rowA || bookingRow(a.json.bookingId);
    const rowB = settled?.rowB || bookingRow(b.json.bookingId);
    report.ids.bookingA = rowA;
    report.ids.bookingB = rowB;

    const winners = [rowA, rowB].filter((r) => r?.payment_status === 'paid' && r?.status === 'confirmed');
    const losers = [rowA, rowB].filter((r) => r && !(r.payment_status === 'paid' && r.status === 'confirmed'));
    if (winners.length !== 1 || losers.length !== 1) {
      throw new Error(
        `expected exactly one confirmed winner; A=${JSON.stringify(rowA)} B=${JSON.stringify(rowB)}`
      );
    }
    const winner = winners[0];
    const loser = losers[0];
    report.ids.winnerBookingId = winner.id;
    report.ids.loserBookingId = loser.id;
    step('exactly_one_booking_confirmed', {
      winner: winner.id.slice(0, 8),
      winnerStatus: winner.status,
      winnerPayment: winner.payment_status,
      loser: loser.id.slice(0, 8),
      loserStatus: loser.status,
      loserPayment: loser.payment_status,
    });

    // Resolve PaymentIntents from Checkout Sessions (booking.payment_intent_id may be unset on loser).
    const winnerSessionId = winner.id === a.json.bookingId ? a.json.sessionId : b.json.sessionId;
    const loserSessionId = loser.id === a.json.bookingId ? a.json.sessionId : b.json.sessionId;
    const winnerSessionLive = await stripeGet(STRIPE_SK, `/checkout/sessions/${winnerSessionId}`);
    const loserSessionLive = await stripeGet(STRIPE_SK, `/checkout/sessions/${loserSessionId}`);
    const winnerPi =
      (typeof winnerSessionLive.payment_intent === 'string'
        ? winnerSessionLive.payment_intent
        : winnerSessionLive.payment_intent?.id) || winner.payment_intent_id;
    const loserPi =
      (typeof loserSessionLive.payment_intent === 'string'
        ? loserSessionLive.payment_intent
        : loserSessionLive.payment_intent?.id) || loser.payment_intent_id;
    if (!winnerPi || !loserPi) {
      throw new Error(`missing PaymentIntent ids winner=${winnerPi} loser=${loserPi}`);
    }
    report.ids.winnerPaymentIntentId = winnerPi;
    report.ids.loserPaymentIntentId = loserPi;

    let loserRefunds = await stripeGet(STRIPE_SK, `/refunds?payment_intent=${loserPi}&limit=5`);
    if (!(loserRefunds.data || []).length) {
      await sleep(8000);
      const loserJwt = loser.id === a.json.bookingId ? guestAJwt : guestBJwt;
      await reconcile(loserJwt, keys.anon, loserSessionId);
      await sleep(4000);
      loserRefunds = await stripeGet(STRIPE_SK, `/refunds?payment_intent=${loserPi}&limit=5`);
    }
    const refundList = loserRefunds.data || [];
    if (refundList.length !== 1) {
      throw new Error(
        `expected exactly one loser refund, got ${refundList.length}: ${JSON.stringify(
          refundList.map((r) => ({ id: r.id, status: r.status, amount: r.amount }))
        )}`
      );
    }
    if (refundList[0].status !== 'succeeded' && refundList[0].status !== 'pending') {
      throw new Error(`loser refund not succeeded: ${refundList[0].status}`);
    }
    if (Number(refundList[0].amount) !== UNIT_MINOR) {
      throw new Error(`loser refund amount ${refundList[0].amount} != ${UNIT_MINOR}`);
    }
    const winnerRefundsEarly = await stripeGet(STRIPE_SK, `/refunds?payment_intent=${winnerPi}&limit=5`);
    if ((winnerRefundsEarly.data || []).length > 0) {
      throw new Error(`winner was refunded unexpectedly: ${JSON.stringify(winnerRefundsEarly.data)}`);
    }
    step('loser_refunded_exactly_once', {
      refundId: refundList[0].id,
      status: refundList[0].status,
      amount: refundList[0].amount,
      paymentIntentId: loserPi,
      bookingPaymentStatus: loser.payment_status,
      note:
        loser.payment_status === 'refunded'
          ? 'booking payment_status mirrors Stripe'
          : 'booking payment_status may lag on staging without Dashboard webhook; Stripe refund is source of truth',
    });

    // Evidence of inventory_conflict in payment events / rental events when present.
    const conflictEvents = dbQuery(`
      select event_type, left(coalesce(payload::text, ''), 240) as detail
      from (
        select event_type, payload::text as payload, created_at
        from public.booking_payment_events
        where booking_id = '${loser.id}'::uuid
        union all
        select event_type, payload::text as payload, created_at
        from public.rental_booking_events
        where booking_id = '${loser.id}'::uuid
      ) e
      where event_type ilike '%inventory_conflict%'
         or coalesce(payload, '') ilike '%inventory_conflict%'
      order by created_at
    `).rows;
    step('inventory_conflict_evidence', {
      rows: conflictEvents.length,
      sample: conflictEvents[0] || null,
      loserPayment: loser.payment_status,
    });

    const winnerHolds = holdsForBooking(winner.id).filter((h) => h.status === 'confirmed');
    const loserHolds = holdsForBooking(loser.id).filter((h) => h.status === 'confirmed' || h.status === 'held');
    const reserved = reservedQty(listingId);
    if (winnerHolds.length !== 1) {
      throw new Error(`winner should have 1 confirmed hold: ${JSON.stringify(holdsForBooking(winner.id))}`);
    }
    if (loserHolds.length !== 0) {
      throw new Error(`loser must not keep inventory: ${JSON.stringify(holdsForBooking(loser.id))}`);
    }
    if (reserved !== 1) {
      throw new Error(`reserved quantity after race expected 1, got ${reserved}`);
    }
    step('inventory_allocated_to_winner_only', {
      winnerHolds: winnerHolds.length,
      loserActiveHolds: loserHolds.length,
      reserved,
    });

    // Idempotency: re-reconcile both; state must not change; loser refunds stay at 1.
    const [againA, againB] = await Promise.all([
      reconcile(guestAJwt, keys.anon, a.json.sessionId),
      reconcile(guestBJwt, keys.anon, b.json.sessionId),
    ]);
    await sleep(3000);
    const rowA2 = bookingRow(a.json.bookingId);
    const rowB2 = bookingRow(b.json.bookingId);
    const refundsAgain = await stripeGet(STRIPE_SK, `/refunds?payment_intent=${loserPi}&limit=5`);
    if ((refundsAgain.data || []).length !== 1) {
      throw new Error(`idempotent replay created extra refunds: ${(refundsAgain.data || []).length}`);
    }
    if (rowA2?.payment_status !== rowA.payment_status || rowB2?.payment_status !== rowB.payment_status) {
      throw new Error('re-reconcile mutated payment_status');
    }
    if (reservedQty(listingId) !== 1) throw new Error('re-reconcile changed reserved qty');
    step('promote_replay_idempotent', {
      againA: { http: againA.http, alreadySettled: againA.json?.alreadySettled, promoted: againA.json?.promoted },
      againB: { http: againB.http, alreadySettled: againB.json?.alreadySettled, promoted: againB.json?.promoted },
      loserRefundCount: (refundsAgain.data || []).length,
    });

    // Stripe events resend (hits production Dashboard webhook). Must not demote staging winner
    // or create a second loser refund (foreign project ownership).
    const events = await stripeGet(STRIPE_SK, '/events?limit=40');
    const related = (events.data || []).filter((evt) => {
      const obj = evt.data?.object || {};
      return (
        obj.id === a.json.sessionId ||
        obj.id === b.json.sessionId ||
        obj.metadata?.booking_id === a.json.bookingId ||
        obj.metadata?.booking_id === b.json.bookingId ||
        obj.payment_intent === winnerPi ||
        obj.payment_intent === loserPi ||
        obj.id === winnerPi ||
        obj.id === loserPi
      );
    });
    const completedEvts = related.filter((e) => e.type === 'checkout.session.completed');
    for (const evt of completedEvts.slice(0, 2)) {
      const resend = spawnSync(
        'stripe',
        ['events', 'resend', evt.id, '--api-key', STRIPE_SK],
        { encoding: 'utf8', cwd: resolve('.') }
      );
      if (resend.status !== 0) {
        throw new Error(`stripe events resend failed: ${(resend.stderr || resend.stdout || '').slice(-300)}`);
      }
    }
    await sleep(12000);
    const winnerAfterFanout = bookingRow(winner.id);
    const winnerRefunds = await stripeGet(STRIPE_SK, `/refunds?payment_intent=${winnerPi}&limit=5`);
    const loserRefundsAfter = await stripeGet(STRIPE_SK, `/refunds?payment_intent=${loserPi}&limit=5`);
    if (winnerAfterFanout?.payment_status !== 'paid' || winnerAfterFanout?.status !== 'confirmed') {
      throw new Error(`foreign webhook demoted winner: ${JSON.stringify(winnerAfterFanout)}`);
    }
    if ((winnerRefunds.data || []).length > 0) {
      throw new Error(
        `foreign/production webhook refunded winner PI ${winnerPi}: ${JSON.stringify(winnerRefunds.data)}`
      );
    }
    if ((loserRefundsAfter.data || []).length !== 1) {
      throw new Error(
        `foreign webhook changed loser refund count to ${(loserRefundsAfter.data || []).length}`
      );
    }
    step('foreign_env_webhook_no_promote_or_extra_refund', {
      resentEvents: completedEvts.slice(0, 2).map((e) => e.id),
      winnerStillPaid: true,
      winnerRefundCount: (winnerRefunds.data || []).length,
      loserRefundCount: (loserRefundsAfter.data || []).length,
    });

    report.ok = true;
    report.verdict = 'PASS';
    step('mission_06_2_pass', {
      checkoutSessions: 2,
      winnerBookingId: winner.id,
      loserBookingId: loser.id,
      loserRefundId: refundList[0].id,
      reservedAfter: 1,
    });
  } catch (err) {
    fail('mission_06_2', err);
    report.ok = false;
    report.verdict = report.steps.some((s) => s.name === 'two_checkout_sessions_created' && s.ok)
      ? 'FAIL'
      : 'UNVERIFIED';
  } finally {
    try {
      cleanupListing(listingId);
      step('cleanup_listing');
    } catch (err) {
      fail('cleanup_listing', err);
    }
    await Promise.all([
      deleteUser(keys.service, guestAId),
      deleteUser(keys.service, guestBId),
      deleteUser(keys.service, supplierId),
    ]);
    step('cleanup_identities');
    writeReport();
  }

  process.exit(report.ok ? 0 : 1);
}

run().catch((err) => {
  fail('fatal', err);
  report.verdict = 'UNVERIFIED';
  writeReport();
  process.exit(2);
});
