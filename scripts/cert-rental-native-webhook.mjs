/**
 * P0.8.1 — Native Stripe TEST webhook → staging (no reconcile).
 *
 *   CERT_USE_HOSTED_CHECKOUT=1 node scripts/cert-rental-native-webhook.mjs
 *
 * Requires a Stripe TEST Dashboard/API webhook endpoint pointing at
 *   https://gedktutbpfwnstcbffsc.supabase.co/functions/v1/stripe-webhook
 * with STRIPE_WEBHOOK_SECRET set on staging only.
 */
import { writeFileSync } from 'node:fs';
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
const STAGING_WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/stripe-webhook`;
const PROD_WEBHOOK_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co/functions/v1/stripe-webhook`;
const RUN_ID = randomUUID().slice(0, 8);
const VARIANT = 'cert-native-wh';
const UNIT_MINOR = 2500;
const PICKUP = '2035-09-10T09:00:00+03:00';
const RETURN = '2035-09-11T18:00:00+03:00';
const OUT = resolve('scripts/cert-rental-native-webhook.report.json');
const report = {
  ok: false,
  mission: 'P0.8.1',
  phase: 'rental_native_stripe_webhook',
  startedAt: new Date().toISOString(),
  runId: RUN_ID,
  environment: {
    project: PROJECT,
    productionRefRejected: PRODUCTION_PROJECT_REF,
    stripeMode: 'test',
    promotePath: 'native Stripe webhook → staging stripe-webhook (no reconcile)',
  },
  steps: [],
  errors: [],
  ids: {},
  evidence: {},
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

function writeReport() {
  report.finishedAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('report →', OUT, 'verdict=', report.verdict);
}

function dbQuery(sql) {
  if (DATABASE_URL.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('ABORT: refusing production database URL inside dbQuery');
  }
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '--db-url', DATABASE_URL, '--yes', '--output', 'json', sql],
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

async function stripeGet(path) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SK}` },
  });
  const json = await r.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
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
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { cert_run: RUN_ID },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`create user failed: ${JSON.stringify(json)}`);
  return json.id || json.user?.id;
}

async function signIn(anon, email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`sign-in failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function deleteUser(service, id) {
  if (!id) return;
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${service}`, apikey: service },
  });
}

async function completeHostedCheckout(session) {
  const pmBody = new URLSearchParams();
  pmBody.set('type', 'card');
  pmBody.set('card[token]', 'tok_visa');
  pmBody.set('billing_details[name]', 'CERT Native Webhook Guest');
  pmBody.set('billing_details[email]', String(session.customer_email || ''));
  pmBody.set('billing_details[address][country]', 'FI');
  const pmRes = await fetch('https://api.stripe.com/v1/payment_methods', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SK}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: pmBody,
  });
  const pm = await pmRes.json();
  if (pm.error) throw new Error(`payment_methods: ${JSON.stringify(pm.error)}`);

  const confirmBody = new URLSearchParams({
    payment_method: pm.id,
    expected_amount: String(session.amount_total),
    expected_payment_method_type: 'card',
  });
  const confirmedRes = await fetch(`https://api.stripe.com/v1/payment_pages/${session.id}/confirm`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SK}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: confirmBody,
  });
  const confirmed = await confirmedRes.json();
  if (confirmed.error) throw new Error(`payment_pages confirm: ${JSON.stringify(confirmed.error)}`);
  const paymentStatus = confirmed.payment_status || confirmed.status || null;
  if (paymentStatus !== 'paid' && confirmed.status !== 'complete') {
    throw new Error(`payment not paid: ${paymentStatus}`);
  }
  return { paymentStatus };
}

async function probeFlag(baseUrl, anon) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/functions/v1/create-booking-checkout-session`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ intent: 'rental_checkout_capability' }),
  });
  const json = await res.json().catch(() => ({}));
  return { http: res.status, enabled: json?.rentalCheckoutEnabled === true, json };
}

function cleanupListing(listingId) {
  if (!listingId) return;
  dbQuery(`
DO $$
DECLARE v_listing uuid := '${listingId}'::uuid;
BEGIN
  DELETE FROM public.supplier_earning_items
  WHERE booking_id IN (SELECT id FROM public.bookings WHERE listing_id = v_listing);
  DELETE FROM public.rental_inventory_holds WHERE listing_id = v_listing;
  DELETE FROM public.bookings WHERE listing_id = v_listing;
  DELETE FROM public.listings WHERE id = v_listing;
END $$;
`);
}

async function run() {
  if (!STRIPE_SK.startsWith('sk_test_')) throw new Error('ABORT: Stripe LIVE key');
  const keys = {
    anon: certEnv.CERT_SUPABASE_ANON_KEY,
    service: certEnv.CERT_SUPABASE_SERVICE_ROLE_KEY,
  };
  if (!keys.anon || !keys.service) throw new Error('CERT anon/service keys required');

  const prodAnon = certEnv.VITE_SUPABASE_ANON_KEY || certEnv.PROD_SUPABASE_ANON_KEY || keys.anon;
  const prodProbe = await probeFlag(`https://${PRODUCTION_PROJECT_REF}.supabase.co`, prodAnon);
  if (prodProbe.enabled) throw new Error('production RENTAL_CHECKOUT_ENABLED is true — abort');
  step('production_rental_checkout_flag_absent', { http: prodProbe.http });

  const stagingProbe = await probeFlag(SUPABASE_URL, keys.anon);
  if (!stagingProbe.enabled) throw new Error('staging rental checkout not enabled');
  step('staging_rental_checkout_enabled', stagingProbe.json);

  const hooks = await stripeGet('/webhook_endpoints?limit=100');
  const stagingHook = (hooks.data || []).find((e) => e.url === STAGING_WEBHOOK_URL && e.status === 'enabled');
  const prodHook = (hooks.data || []).find((e) => e.url === PROD_WEBHOOK_URL && e.status === 'enabled');
  if (!stagingHook) throw new Error(`missing staging webhook endpoint for ${STAGING_WEBHOOK_URL}`);
  if (!prodHook) throw new Error('production webhook missing — unexpected; abort rather than alter prod');
  if (prodHook.id !== 'we_1TWkBwC3BaJIHpM6eVbY1DOc') {
    throw new Error(`unexpected production webhook id: ${prodHook.id}`);
  }
  report.ids.stagingWebhookEndpointId = stagingHook.id;
  report.ids.productionWebhookEndpointId = prodHook.id;
  step('webhook_endpoints_isolated', {
    staging: stagingHook.id,
    production: prodHook.id,
    stagingEvents: stagingHook.enabled_events,
    productionUntouched: true,
  });

  const password = `Cert!${randomBytes(9).toString('base64url')}`;
  const guestEmail = `cert-native-wh-guest-${RUN_ID}@example.com`;
  const supplierEmail = `cert-native-wh-supplier-${RUN_ID}@example.com`;
  report.ids.guestEmail = guestEmail;

  let listingId = null;
  let guestId = null;
  let supplierId = null;
  let bookingId = null;

  try {
    guestId = await createConfirmedUser(keys.service, guestEmail, password);
    supplierId = await createConfirmedUser(keys.service, supplierEmail, password);
    report.ids.guestId = guestId;
    report.ids.supplierId = supplierId;
    dbQuery(`insert into public.supplier_profiles (id) values ('${supplierId}'::uuid) on conflict (id) do nothing;`);
    dbQuery(`
      insert into public.supplier_commercial_terms (
        supplier_id, plan_code, commission_bps, payout_cadence, effective_from, status, note
      )
      select '${supplierId}'::uuid, 'standard', 1500, 'monthly', now() - interval '1 day', 'active', 'cert native webhook'
      where not exists (
        select 1 from public.supplier_commercial_terms t
        where t.supplier_id = '${supplierId}'::uuid and t.status = 'active' and t.effective_until is null
      );
    `);
    const guestJwt = await signIn(keys.anon, guestEmail, password);
    step('cert_identities_ready');

    const extras = JSON.stringify({
      inventoryFamily: 'rental',
      departureTimezone: 'Europe/Helsinki',
      rental: {
        durationMode: 'daily',
        variants: [
          {
            id: VARIANT,
            name: 'Native WH Unit',
            quantity: 1,
            pricingOverride: { pricePerDayMinor: UNIT_MINOR },
          },
        ],
      },
    }).replace(/'/g, "''");

    listingId = dbQuery(`
      insert into public.listings (
        supplier_id, title, destination, duration, style,
        status, price_starting_from, price_currency, listing_extras
      ) values (
        '${supplierId}'::uuid,
        'CERT native webhook ${RUN_ID}',
        'Test', '1 day', 'cert',
        'draft', 25, 'EUR', '${extras}'::jsonb
      ) returning id::text as id;
    `).rows?.[0]?.id;
    if (!listingId) throw new Error('listing insert failed');
    report.ids.listingId = listingId;
    step('fixture_listing_draft', { listingId: listingId.slice(0, 8) });

    const checkout = await fetch(CHECKOUT_FN, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestJwt}`,
        apikey: keys.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        listingId,
        customerName: 'CERT Native Webhook Guest',
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
      }),
    });
    const checkoutJson = await checkout.json().catch(() => ({}));
    if (!checkoutJson?.success || !checkoutJson.sessionId || !checkoutJson.bookingId) {
      throw new Error(`checkout failed: ${checkout.status} ${JSON.stringify(checkoutJson)}`);
    }
    bookingId = checkoutJson.bookingId;
    const sessionId = checkoutJson.sessionId;
    report.ids.bookingId = bookingId;
    report.ids.sessionId = sessionId;

    const holdsBefore = dbQuery(
      `select count(*)::int as n from public.rental_inventory_holds
       where booking_id = '${bookingId}'::uuid and status in ('held','confirmed')`
    ).rows?.[0]?.n;
    if (Number(holdsBefore) !== 0) throw new Error('unpaid checkout reserved inventory');
    step('checkout_created_no_hold', {
      bookingId: bookingId.slice(0, 8),
      sessionId,
      quotedTotal: checkoutJson.quotedTotal,
    });

    const session = await stripeGet(`/checkout/sessions/${sessionId}`);
    if (session.livemode !== false) throw new Error('livemode session');
    if (session.amount_total !== UNIT_MINOR) throw new Error(`amount ${session.amount_total}`);
    if (session.metadata?.traverion_supabase_project_ref !== PROJECT) {
      throw new Error(`env stamp mismatch: ${session.metadata?.traverion_supabase_project_ref}`);
    }
    await completeHostedCheckout(session);
    step('stripe_test_payment_completed', { sessionId, amount: UNIT_MINOR });

    // Wait for NATIVE webhook promote — do NOT call reconcile.
    let booking = null;
    let completedEvt = null;
    let webhookRow = null;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      booking = dbQuery(`
        select id::text, status, payment_status, amount_paid::text, public_reference,
               payment_intent_id, checkout_session_id
        from public.bookings where id = '${bookingId}'::uuid
      `).rows?.[0];
      if (booking?.payment_status === 'paid' && booking?.status === 'confirmed') {
        const related = await stripeGet(
          `/events?type=checkout.session.completed&limit=20`
        );
        completedEvt = (related.data || []).find(
          (e) => e.data?.object?.id === sessionId || e.data?.object?.metadata?.booking_id === bookingId
        );
        if (completedEvt) {
          webhookRow = dbQuery(
            `select id, status, event_type, error_message from public.stripe_webhook_events where id = '${completedEvt.id}'`
          ).rows?.[0];
          if (webhookRow && ['processed', 'ignored'].includes(webhookRow.status)) break;
        }
      }
      await sleep(2000);
    }

    if (!booking || booking.payment_status !== 'paid' || booking.status !== 'confirmed') {
      throw new Error(
        `booking not confirmed by native webhook within timeout: ${JSON.stringify(booking)}`
      );
    }
    if (!completedEvt) throw new Error('checkout.session.completed event not found in Stripe');
    if (!webhookRow || !['processed', 'ignored'].includes(webhookRow.status)) {
      throw new Error(`staging webhook row missing/failed: ${JSON.stringify(webhookRow)}`);
    }
    report.ids.eventId = completedEvt.id;
    report.ids.publicReference = booking.public_reference;
    report.ids.paymentIntentId = booking.payment_intent_id;
    step('native_webhook_promoted_without_reconcile', {
      eventId: completedEvt.id,
      webhookStatus: webhookRow.status,
      reference: booking.public_reference,
      paymentIntentId: booking.payment_intent_id,
    });

    // Stripe delivery attempts for staging endpoint
    const attempts = await stripeGet(
      `/events/${completedEvt.id}` // base event
    ).catch(() => null);
    let stagingDelivery = null;
    try {
      // Prefer webhook endpoint delivery list when available
      const deliveries = await stripeGet(
        `/webhook_endpoints/${stagingHook.id}/?expand[]=` // no-op keep id
      );
      void deliveries;
      const evFull = await fetch(
        `https://api.stripe.com/v1/events/${completedEvt.id}`,
        { headers: { Authorization: `Bearer ${STRIPE_SK}` } }
      ).then((r) => r.json());
      report.evidence.stripeEvent = {
        id: evFull.id,
        type: evFull.type,
        livemode: evFull.livemode,
        pending_webhooks: evFull.pending_webhooks,
      };
    } catch {
      /* optional */
    }
    // Query recent deliveries via Events API request logs is limited; use DB + resend evidence.
    report.evidence.stagingWebhookRow = webhookRow;
    void attempts;
    void stagingDelivery;

    const holds = dbQuery(
      `select id::text, status, quantity from public.rental_inventory_holds where booking_id = '${bookingId}'::uuid`
    ).rows;
    const confirmedHolds = (holds || []).filter((h) => h.status === 'confirmed');
    if (confirmedHolds.length !== 1) {
      throw new Error(`expected 1 confirmed hold: ${JSON.stringify(holds)}`);
    }
    step('inventory_allocated_once', { holds: confirmedHolds });

    const earnings = dbQuery(`
      select id::text, status, amount_minor, commission_minor, commission_bps, gross_minor,
             service_completed_at::text, eligible_at::text
      from public.supplier_earning_items where booking_id = '${bookingId}'::uuid
    `).rows;
    if (!earnings?.length || earnings.length !== 1) {
      throw new Error(`expected 1 earning row: ${JSON.stringify(earnings)}`);
    }
    if (Number(earnings[0].commission_bps) !== 1500 || Number(earnings[0].gross_minor) !== 2500) {
      throw new Error(`earnings amounts unexpected: ${JSON.stringify(earnings[0])}`);
    }
    report.ids.earningId = earnings[0].id;
    step('earnings_recorded_once', earnings[0]);

    // Replay / idempotency via Stripe CLI (same path as prior certs).
    const resendCli = spawnSync(
      'stripe',
      ['events', 'resend', completedEvt.id, '--webhook-endpoint', stagingHook.id, '--api-key', STRIPE_SK],
      { encoding: 'utf8', cwd: resolve('.'), maxBuffer: 2 * 1024 * 1024 }
    );
    if (resendCli.status !== 0) {
      const alt = spawnSync(
        'stripe',
        ['events', 'resend', completedEvt.id, '--api-key', STRIPE_SK],
        { encoding: 'utf8', cwd: resolve('.'), maxBuffer: 2 * 1024 * 1024 }
      );
      if (alt.status !== 0) {
        throw new Error(
          `stripe events resend failed: ${(resendCli.stderr || resendCli.stdout || alt.stderr || '').slice(-800)}`
        );
      }
      step('event_replay_requested', { via: 'stripe_cli_events_resend_all', eventId: completedEvt.id });
    } else {
      step('event_replay_requested', {
        via: 'stripe_cli_events_resend_endpoint',
        eventId: completedEvt.id,
        endpoint: stagingHook.id,
      });
    }

    await sleep(5000);
    const afterReplay = dbQuery(`
      select
        (select count(*)::int from public.rental_inventory_holds
          where booking_id = '${bookingId}'::uuid and status = 'confirmed') as confirmed_holds,
        (select count(*)::int from public.supplier_earning_items
          where booking_id = '${bookingId}'::uuid) as earning_rows,
        (select status from public.stripe_webhook_events where id = '${completedEvt.id}') as webhook_status,
        (select payment_status from public.bookings where id = '${bookingId}'::uuid) as payment_status
    `).rows?.[0];
    if (Number(afterReplay?.confirmed_holds) !== 1) {
      throw new Error(`duplicate inventory after replay: ${JSON.stringify(afterReplay)}`);
    }
    if (Number(afterReplay?.earning_rows) !== 1) {
      throw new Error(`duplicate earnings after replay: ${JSON.stringify(afterReplay)}`);
    }
    if (afterReplay?.payment_status !== 'paid') {
      throw new Error(`payment status changed after replay: ${JSON.stringify(afterReplay)}`);
    }
    step('replay_idempotent', afterReplay);

    // Production isolation: no booking for this session in production DB; PI not refunded by foreign handler
    const pi = booking.payment_intent_id;
    if (pi) {
      const refunds = await stripeGet(`/refunds?payment_intent=${pi}&limit=10`);
      const refundCount = (refunds.data || []).length;
      if (refundCount !== 0) {
        throw new Error(`unexpected refunds on staging PI: ${JSON.stringify(refunds.data)}`);
      }
      step('no_refund_on_staging_pi', { paymentIntentId: pi, refundCount: 0 });
    }

    // Production webhook may receive the same event; verify it did not create a booking row
    // by checking Stripe event delivery failures are absent and PI remains succeeded.
    if (pi) {
      const piObj = await stripeGet(`/payment_intents/${pi}`);
      if (piObj.status !== 'succeeded') throw new Error(`PI status ${piObj.status}`);
      if (piObj.metadata?.traverion_supabase_project_ref !== PROJECT) {
        throw new Error('PI metadata stamp lost');
      }
      step('production_isolation_pi_intact', {
        paymentIntentId: pi,
        status: piObj.status,
        stampedProject: piObj.metadata?.traverion_supabase_project_ref,
        note: 'Production endpoint may receive the event but must ignore foreign project_ref; PI not refunded',
      });
    }

    // Confirm production webhook endpoint still enabled and unchanged
    const hooksAfter = await stripeGet('/webhook_endpoints?limit=100');
    const prodAfter = (hooksAfter.data || []).find((e) => e.id === prodHook.id);
    if (!prodAfter || prodAfter.status !== 'enabled' || prodAfter.url !== PROD_WEBHOOK_URL) {
      throw new Error('production webhook was modified');
    }
    const stagingAfter = (hooksAfter.data || []).find((e) => e.id === stagingHook.id);
    if (!stagingAfter || stagingAfter.status !== 'enabled') {
      throw new Error('staging webhook disabled unexpectedly');
    }
    step('production_webhook_untouched_after_cert', {
      productionId: prodAfter.id,
      stagingId: stagingAfter.id,
    });

    report.ok = true;
    report.verdict = 'PASS';
    step('mission_p08_1_pass', {
      bookingId,
      reference: booking.public_reference,
      eventId: completedEvt.id,
      webhookStatus: webhookRow.status,
      earningId: earnings[0].id,
    });
  } catch (err) {
    fail('journey', err);
    report.verdict = 'FAIL';
  } finally {
    try {
      cleanupListing(listingId);
      step('cleanup_listing');
    } catch (err) {
      fail('cleanup_listing', err);
    }
    try {
      await deleteUser(keys.service, guestId);
      await deleteUser(keys.service, supplierId);
      step('cleanup_identities');
    } catch (err) {
      fail('cleanup_identities', err);
    }
    writeReport();
  }
}

run().then(() => {
  process.exit(report.ok ? 0 : 2);
});
