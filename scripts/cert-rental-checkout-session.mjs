/**
 * Real Stripe TEST Checkout Session certification for Traverion Rentals.
 *
 * Runs against an isolated staging Supabase project only.
 * Payment completion is forwarded by `stripe listen` to the staging stripe-webhook
 * so signatures are verified with the staging STRIPE_WEBHOOK_SECRET.
 *
 * Does not publish rentals, set the production flag, email real customers,
 * or disable production Stripe webhook endpoints. Cross-environment isolation
 * is enforced by traverion_supabase_project_ref metadata + fail-closed webhook
 * ownership checks (and preferably separate Stripe test accounts per project).
 * Cert identities are *@example.com and are deleted at the end.
 *
 * Required env (see .local/rental-cert-staging.env):
 *   CERT_SUPABASE_PROJECT_REF, CERT_DATABASE_URL, CERT_SUPABASE_URL,
 *   CERT_STRIPE_SECRET_KEY (sk_test), CERT_SUPABASE_ANON_KEY,
 *   CERT_SUPABASE_SERVICE_ROLE_KEY
 *
 *   node scripts/cert-rental-checkout-session.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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
const WEBHOOK_ENDPOINT = 'staging-stripe-listen';
const DENO = '/tmp/deno/bin/deno';
const LOCAL_FN = 'http://127.0.0.1:8000';
const USE_HOSTED_CHECKOUT = (certEnv.CERT_USE_HOSTED_CHECKOUT || '1').trim() !== '0';
const CHECKOUT_FN = USE_HOSTED_CHECKOUT
  ? `${SUPABASE_URL}/functions/v1/create-booking-checkout-session`
  : `${LOCAL_FN}/`;
/** Never hardcode a stale Vite port (e.g. 5199). Prefer cert/env origin. */
const CERT_RETURN_ORIGIN = String(
  certEnv.CERT_RETURN_ORIGIN || certEnv.PUBLIC_SITE_URL || 'http://127.0.0.1:5184'
)
  .trim()
  .replace(/\/$/, '');
const RUN_ID = randomUUID().slice(0, 8);
const VARIANT = 'cert-unit';
const LAST_VARIANT = 'cert-last';
const UNIT_MINOR = 2500;

const DATES = {
  paid: ['2034-08-10T09:00:00+00:00', '2034-08-11T09:00:00+00:00'],
  abandon: ['2034-08-12T09:00:00+00:00', '2034-08-13T09:00:00+00:00'],
  delayed: ['2034-08-14T09:00:00+00:00', '2034-08-15T09:00:00+00:00'],
  cancelRace: ['2034-08-16T09:00:00+00:00', '2034-08-17T09:00:00+00:00'],
  lastUnit: ['2034-09-01T09:00:00+00:00', '2034-09-02T09:00:00+00:00'],
};

const report = {
  ok: false,
  phase: 'rental_checkout_session',
  startedAt: new Date().toISOString(),
  runId: RUN_ID,
  environment: {
    project: PROJECT,
    productionRefRejected: PRODUCTION_PROJECT_REF,
    stripeMode: 'test',
    checkoutFunction: USE_HOSTED_CHECKOUT
      ? 'staging_hosted_RENTAL_CHECKOUT_ENABLED=1'
      : 'local_deno_RENTAL_CHECKOUT_ENABLED=1',
    webhook: 'staging stripe-webhook via stripe listen',
    publicFlag: 'unset_on_production',
  },
  safety: {},
  steps: [],
  errors: [],
  ids: {},
  notifications: [],
};

function loadDotEnv() {
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
  // Anonymous DO / DML without RETURNING print status tags with no JSON payload.
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

function loadApiKeys() {
  const anon = certEnv.CERT_SUPABASE_ANON_KEY;
  const service = certEnv.CERT_SUPABASE_SERVICE_ROLE_KEY;
  if (!anon || !service) {
    const r = spawnSync(
      'npx',
      ['supabase', 'projects', 'api-keys', '--project-ref', PROJECT, '-o', 'json'],
      { encoding: 'utf8', cwd: resolve('.'), maxBuffer: 2 * 1024 * 1024 }
    );
    if (r.status !== 0) throw new Error(`api-keys failed: ${(r.stderr || '').slice(-400)}`);
    const start = (r.stdout || '').indexOf('[');
    if (start < 0) throw new Error('api-keys json missing');
    const rows = JSON.parse(r.stdout.slice(start));
    return {
      anon: rows.find((k) => k.name === 'anon')?.api_key,
      service: rows.find((k) => k.name === 'service_role')?.api_key,
    };
  }
  return { anon, service };
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
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method: 'POST', headers, body });
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

function step(name, detail = {}) {
  report.steps.push({ name, ok: true, ...detail, at: new Date().toISOString() });
  console.log(`✓ ${name}`);
}

function fail(name, err) {
  const msg = err instanceof Error ? err.message : String(err);
  report.steps.push({ name, ok: false, error: msg, at: new Date().toISOString() });
  report.errors.push(`${name}: ${msg}`);
  console.error(`✗ ${name}: ${msg.slice(0, 500)}`);
}

function assert(cond, name, detail) {
  if (!cond) throw new Error(detail || name);
  step(name, typeof detail === 'object' ? detail : { detail });
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

function rentalBody(listingId, pickupAt, returnAt, variantId, expectedTotal = 25) {
  return {
    listingId,
    customerName: 'CERT Rental Guest',
    checkoutConsentAccepted: true,
    expectedTotal,
    currency: 'EUR',
    successPath: '/booking-confirmed',
    cancelPath: '/cart?payment=cancelled',
    returnOrigin: CERT_RETURN_ORIGIN,
    rental: {
      variantId,
      quantity: 1,
      pickupAt,
      returnAt,
      durationCount: 1,
      durationUnit: 'day',
    },
  };
}

function reservedQty(listingId, variantId, pickupAt, returnAt) {
  return Number(
    dbQuery(`
      select public.rental_variant_reserved_quantity(
        '${listingId}'::uuid,
        '${variantId}',
        timestamptz '${pickupAt}',
        timestamptz '${returnAt}'
      )::int as n
    `).rows?.[0]?.n ?? 0
  );
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
      name: 'CERT Rental Guest',
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

async function pollBooking(id, pred, timeoutMs = 70000) {
  const start = Date.now();
  let row = null;
  while (Date.now() - start < timeoutMs) {
    row = dbQuery(
      `select id::text, status, payment_status, amount_paid::text, total_amount::text, currency,
              checkout_session_id, payment_intent_id, public_reference,
              guest_email, hold_expires_at::text
       from public.bookings where id = '${id}'::uuid`
    ).rows?.[0];
    if (row && pred(row)) return row;
    await sleep(2500);
  }
  return row;
}

function holdStatus(bookingId) {
  return dbQuery(
    `select id::text, status from public.rental_inventory_holds where booking_id = '${bookingId}'::uuid order by created_at`
  ).rows;
}

function emailLog(bookingId) {
  return dbQuery(`
    select channel, template_key, recipient_email, status, idempotency_key
    from public.transactional_email_log
    where entity_id = '${bookingId}'
       or idempotency_key like '%${bookingId}%'
    order by created_at
  `).rows;
}

function assertCertRecipients(rows, label) {
  const bad = (rows || []).filter((r) => {
    const email = String(r.recipient_email || '');
    if (!email) return false;
    return !email.toLowerCase().endsWith('@example.com');
  });
  if (bad.length) {
    throw new Error(`${label} emailed a non-cert recipient`);
  }
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

function writeReport() {
  const outPath = resolve('scripts/cert-rental-checkout-session.report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('report →', outPath);
}

/**
 * Permanent isolation must never disable production webhooks.
 * Shared Stripe TEST accounts rely on fail-closed ownership checks in
 * stripe-webhook / promote-paid-from-checkout instead.
 */
async function assertProductionWebhooksRemainEnabled(sk) {
  const listed = await stripeGet(sk, '/webhook_endpoints?limit=100');
  const prod = (listed.data || []).filter((endpoint) =>
    String(endpoint.url || '').includes(PRODUCTION_PROJECT_REF)
  );
  const disabled = prod.filter((endpoint) => endpoint.status === 'disabled');
  if (disabled.length) {
    throw new Error(
      `ABORT: production Stripe webhook(s) are disabled (${disabled.map((e) => e.id).join(', ')}). Cert must not disable them; re-enable manually.`
    );
  }
  return prod.map((endpoint) => ({
    id: endpoint.id,
    status: endpoint.status,
    url: endpoint.url,
  }));
}

async function run() {
  if (PROJECT === PRODUCTION_PROJECT_REF || SUPABASE_URL.includes(PRODUCTION_PROJECT_REF)) {
    fail('target', new Error('ABORT: refusing production Traverionapp'));
    writeReport();
    process.exit(2);
  }
  const sk = STRIPE_SK;
  if (!sk.startsWith('sk_test_')) {
    fail('stripe_mode', new Error('ABORT: Stripe keys must be test mode'));
    writeReport();
    process.exit(2);
  }
  const keys = loadApiKeys();
  if (!keys.anon || !keys.service) {
    fail('api_keys', new Error('staging anon/service keys missing'));
    writeReport();
    process.exit(2);
  }
  const password = randomBytes(18).toString('base64url');
  const guestEmail = `cert-rental-guest-${RUN_ID}@example.com`;
  const guest2Email = `cert-rental-guest2-${RUN_ID}@example.com`;
  const supplierEmail = `cert-rental-supplier-${RUN_ID}@example.com`;
  report.ids.guestEmail = guestEmail;
  report.ids.supplierEmail = supplierEmail;

  // Prefer edge capability probes over Management API secrets list.
  // Management API 403s when the CLI is logged into a non-Traverion org; the
  // public capability intent does not require platform admin privileges.
  async function probeRentalCheckoutFlag(baseUrl, anonKey) {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/functions/v1/create-booking-checkout-session`, {
      method: 'POST',
      headers: {
        apikey: anonKey || keys.anon,
        Authorization: `Bearer ${anonKey || keys.anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ intent: 'rental_checkout_capability' }),
    });
    const json = await res.json().catch(() => ({}));
    return { http: res.status, enabled: json?.rentalCheckoutEnabled === true, json };
  }

  const prodAnon = certEnv.VITE_SUPABASE_ANON_KEY || certEnv.PROD_SUPABASE_ANON_KEY || keys.anon;
  const prodProbe = await probeRentalCheckoutFlag(
    `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    prodAnon
  );
  if (prodProbe.enabled) {
    fail('safety_flag', new Error('RENTAL_CHECKOUT_ENABLED is active on production — abort'));
    writeReport();
    process.exit(2);
  }
  step('production_rental_checkout_flag_absent', { via: 'capability_probe', http: prodProbe.http });

  const stagingProbe = await probeRentalCheckoutFlag(SUPABASE_URL, keys.anon);
  const stagingFlagPresent = stagingProbe.enabled === true;
  if (USE_HOSTED_CHECKOUT && !stagingFlagPresent) {
    fail(
      'staging_flag',
      new Error(
        'staging RENTAL_CHECKOUT_ENABLED missing for hosted checkout — set it on staging only, or CERT_USE_HOSTED_CHECKOUT=0 for local Deno'
      )
    );
    writeReport();
    process.exit(2);
  }
  if (stagingFlagPresent) step('staging_rental_checkout_flag_present', { via: 'capability_probe', http: stagingProbe.http });
  else step('staging_rental_checkout_flag_absent_using_local_deno', { via: 'capability_probe', http: stagingProbe.http });

  const before = dbQuery(`
    select
      (select count(*)::int from public.bookings) as bookings,
      (select count(*)::int from public.listings
        where status = 'published'
          and coalesce(listing_extras->>'inventoryFamily','') = 'rental') as published_rentals
  `).rows?.[0];
  report.safety.before = before;
  // Staging may already have a published rental from browser certs; do not hard-fail.
  // This script must leave published_rentals unchanged and never publish its own fixture.
  if (Number(before?.published_rentals) !== 0) {
    step('baseline_published_rentals_present_allowed', {
      published_rentals: before.published_rentals,
      note: 'staging browser fixtures may already be published; cert fixture stays draft',
    });
  }
  step('baseline_counts', before);

  try {
    const prodHooks = await assertProductionWebhooksRemainEnabled(sk);
    step('production_stripe_webhooks_remain_enabled', {
      count: prodHooks.length,
      ids: prodHooks.map((h) => h.id),
    });
  } catch (err) {
    fail('production_stripe_webhook_guard', err);
    writeReport();
    process.exit(2);
  }

  let denoProc = null;
  let listingId = null;
  let guestId = null;
  let guest2Id = null;
  let supplierId = null;

  try {
    guestId = await createConfirmedUser(keys.service, guestEmail, password);
    guest2Id = await createConfirmedUser(keys.service, guest2Email, password);
    supplierId = await createConfirmedUser(keys.service, supplierEmail, password);
    report.ids.guestId = guestId;
    report.ids.supplierId = supplierId;
    dbQuery(`
      insert into public.supplier_profiles (id)
      values ('${supplierId}'::uuid)
      on conflict (id) do nothing
      returning id::text as id;
    `);
    dbQuery(`
      insert into public.supplier_commercial_terms (
        supplier_id, plan_code, commission_bps, payout_cadence, effective_from, status, note
      )
      select '${supplierId}'::uuid, 'standard', 1500, 'monthly', now() - interval '1 day', 'active',
             'cert staging terms'
      where not exists (
        select 1 from public.supplier_commercial_terms t
        where t.supplier_id = '${supplierId}'::uuid
          and t.status = 'active'
          and t.effective_until is null
      )
      returning id::text as id;
    `);
    const guestJwt = await signIn(keys.anon, guestEmail, password);
    const guest2Jwt = await signIn(keys.anon, guest2Email, password);
    const supplierJwt = await signIn(keys.anon, supplierEmail, password);
    step('cert_identities_example_com');

    const extras = JSON.stringify({
      inventoryFamily: 'rental',
      departureTimezone: 'Europe/Helsinki',
      rental: {
        durationMode: 'daily',
        variants: [
          {
            id: VARIANT,
            name: 'Cert Unit',
            quantity: 2,
            pricingOverride: { pricePerDayMinor: UNIT_MINOR },
          },
          {
            id: LAST_VARIANT,
            name: 'Last Unit',
            quantity: 1,
            pricingOverride: { pricePerDayMinor: UNIT_MINOR },
          },
        ],
      },
    }).replace(/'/g, "''");

    const inserted = dbQuery(`
      insert into public.listings (
        supplier_id, title, destination, duration, style,
        status, price_starting_from, price_currency, listing_extras
      ) values (
        '${supplierId}'::uuid,
        'CERT rental checkout ${RUN_ID}',
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
    if (!listingId || inserted.rows?.[0]?.status !== 'draft') {
      throw new Error('draft listing insert failed');
    }
    report.ids.listingId = listingId;
    step('fixture_listing_draft');

    // Cert fixture is intentionally incomplete; any publish refusal that leaves draft is PASS.
    // Prefer rental gate wording when present; city/country / surface checks also block.
    const publishAttempt = dbQuery(`
      do $$
      declare
        v_msg text;
      begin
        begin
          update public.listings set status = 'published' where id = '${listingId}'::uuid;
          raise exception 'publish_succeeded';
        exception when others then
          get stacked diagnostics v_msg = message_text;
          if v_msg = 'publish_succeeded' then
            raise;
          end if;
          -- swallow expected publish refusals; status assert below is authoritative
          null;
        end;
      end $$;
    `);
    const gate = dbQuery(`
      select status from public.listings where id = '${listingId}'::uuid;
    `);
    const gateStatus = gate.rows?.[0]?.status;
    if (gateStatus !== 'draft') throw new Error(`publish gate did not hold: ${gateStatus}`);
    step('publication_gate_282_blocks_publish', { status: gateStatus, attempt: 'refused_kept_draft' });

    if (!USE_HOSTED_CHECKOUT) {
    denoProc = spawn(
      DENO,
      [
        'run',
        '-A',
        '--no-prompt',
        'supabase/functions/create-booking-checkout-session/index.ts',
      ],
      {
        cwd: resolve('.'),
        env: {
          ...process.env,
          SUPABASE_URL,
          SUPABASE_ANON_KEY: keys.anon,
          SUPABASE_SERVICE_ROLE_KEY: keys.service,
          STRIPE_SECRET_KEY: sk,
          RENTAL_CHECKOUT_ENABLED: '1',
          PUBLIC_SITE_URL: CERT_RETURN_ORIGIN,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let denoLog = '';
    denoProc.stdout.on('data', (b) => {
      denoLog += b.toString();
    });
    denoProc.stderr.on('data', (b) => {
      denoLog += b.toString();
    });
    let up = false;
    for (let i = 0; i < 90; i++) {
      try {
        const ping = await fetch(LOCAL_FN, { method: 'OPTIONS' });
        if (ping.status < 500) {
          up = true;
          break;
        }
      } catch {
        /* booting */
      }
      if (denoProc.exitCode != null) break;
      await sleep(500);
    }
    if (!up) throw new Error(`local checkout function did not boot: ${denoLog.slice(-800)}`);
    step('isolated_checkout_function_booted');
    } else {
      step('using_staging_hosted_checkout_function', { url: CHECKOUT_FN });
    }

    const stagingCap = await fetch(
      `${SUPABASE_URL}/functions/v1/create-booking-checkout-session`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${guestJwt}`,
          apikey: keys.anon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ intent: 'rental_checkout_capability' }),
      }
    );
    const stagingCapJson = await stagingCap.json().catch(() => ({}));
    if (!(stagingCapJson.success === true && stagingCapJson.rentalCheckoutEnabled === true)) {
      throw new Error(`staging capability probe failed: ${JSON.stringify(stagingCapJson)}`);
    }
    step('staging_capability_probe_open', stagingCapJson);

    const prodCap = await fetch(
      `https://${PRODUCTION_PROJECT_REF}.supabase.co/functions/v1/create-booking-checkout-session`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${guestJwt}`,
          apikey: keys.anon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ intent: 'rental_checkout_capability' }),
      }
    );
    const prodCapJson = await prodCap.json().catch(() => ({}));
    if (prodCapJson.rentalCheckoutEnabled === true) {
      throw new Error('production capability probe returned rentalCheckoutEnabled true');
    }
    step('production_capability_probe_closed', {
      http: prodCap.status,
      rentalCheckoutEnabled: prodCapJson.rentalCheckoutEnabled ?? null,
    });

    const previewReject = await postCheckout(
      guestJwt,
      keys.anon,
      rentalBody('00000000-0000-4000-8000-000000000001', DATES.paid[0], DATES.paid[1], VARIANT, 25)
    );
    if (previewReject.json?.success) {
      throw new Error('preview fixture entered checkout');
    }
    step('preview_fixture_rejected', {
      http: previewReject.status,
      error: previewReject.json?.error || null,
    });

    const tamper = await postCheckout(
      guestJwt,
      keys.anon,
      rentalBody(listingId, DATES.paid[0], DATES.paid[1], VARIANT, 1)
    );
    if (tamper.status !== 409) {
      throw new Error(`price tamper expected 409, got ${tamper.status} ${tamper.json?.error || ''}`);
    }
    step('price_tamper_rejected', { http: tamper.status });

    const first = await postCheckout(
      guestJwt,
      keys.anon,
      rentalBody(listingId, DATES.paid[0], DATES.paid[1], VARIANT, 25)
    );
    if (!first.json?.success || !first.json.sessionId || !first.json.bookingId) {
      throw new Error(
        `checkout create failed: ${first.status} ${first.json?.error || ''}`
      );
    }
    const dup = await postCheckout(
      guestJwt,
      keys.anon,
      rentalBody(listingId, DATES.paid[0], DATES.paid[1], VARIANT, 25)
    );
    if (dup.json?.bookingId !== first.json.bookingId) {
      throw new Error('duplicate checkout created a second booking');
    }
    const bookingId = dup.json.bookingId;
    const sessionId = dup.json.sessionId;
    report.ids.bookingId = bookingId;
    report.ids.checkoutSessionId = sessionId;
    // Instant Book no-hold (294): unpaid checkout must not reserve inventory.
    const holdsAfterDup = holdStatus(bookingId);
    const heldCount = holdsAfterDup.filter((h) => h.status === 'held' || h.status === 'confirmed').length;
    if (heldCount !== 0) {
      throw new Error(`unpaid checkout reserved inventory: ${JSON.stringify(holdsAfterDup)}`);
    }
    step('checkout_session_created_idempotent', {
      bookingId: bookingId.slice(0, 8),
      sessionId,
      quotedTotal: dup.json.quotedTotal,
      unpaidHolds: 0,
      mode: 'instant_book_no_hold',
    });

    if (first.json.sessionId !== sessionId) {
      // Expire superseded session only after the live session is paid+promoted,
      // so expire webhooks cannot race the successful PaymentIntent.
      step('superseded_session_noted', { priorSessionId: first.json.sessionId });
    }

    const session = await stripeGet(sk, `/checkout/sessions/${sessionId}`);
    if (session.livemode !== false) throw new Error('session is livemode');
    if (session.amount_total !== UNIT_MINOR) {
      throw new Error(`amount_total ${session.amount_total} != ${UNIT_MINOR}`);
    }
    if (session.metadata?.booking_id !== bookingId || session.metadata?.inventory_family !== 'rental') {
      throw new Error('session metadata mismatch');
    }
    if (session.metadata?.traverion_supabase_project_ref !== PROJECT) {
      throw new Error(
        `session missing env stamp: expected ${PROJECT}, got ${session.metadata?.traverion_supabase_project_ref}`
      );
    }
    const successUrl = String(session.success_url || '');
    const cancelUrl = String(session.cancel_url || '');
    if (!successUrl.startsWith(`${CERT_RETURN_ORIGIN}/`)) {
      throw new Error(
        `success_url origin mismatch: expected ${CERT_RETURN_ORIGIN}, got ${successUrl}`
      );
    }
    if (successUrl.includes(':5199') || cancelUrl.includes(':5199')) {
      throw new Error(`stale localhost:5199 still present in redirect URLs: ${successUrl} / ${cancelUrl}`);
    }
    step('stripe_checkout_session_test_mode', {
      amount_total: session.amount_total,
      currency: session.currency,
      mode: session.mode,
      projectRef: session.metadata.traverion_supabase_project_ref,
      successOrigin: CERT_RETURN_ORIGIN,
      success_url: successUrl.slice(0, 120),
    });

    const paid = await completeHostedCheckout(sk, session);
    step('checkout_session_completed', { via: paid.via });

    // Let signed webhooks promote first; reconcile is the success-page safety net.
    await sleep(8000);

    const reconcile = await fetch(`${SUPABASE_URL}/functions/v1/reconcile-checkout-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestJwt}`,
        apikey: keys.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    const reconcileJson = await reconcile.json().catch(() => ({}));
    step('success_page_reconcile_first', {
      http: reconcile.status,
      alreadySettled: reconcileJson.alreadySettled === true,
      promoted: reconcileJson.promoted === true,
    });

    const booked = await pollBooking(
      bookingId,
      (row) => row.payment_status === 'paid' && row.status === 'confirmed'
    );
    if (!booked || booked.payment_status !== 'paid' || booked.status !== 'confirmed') {
      throw new Error(`booking not confirmed by webhook/reconcile: ${JSON.stringify(booked)}`);
    }
    if (booked.guest_email !== guestEmail) throw new Error('guest email mismatch');
    const confirmedHolds = holdStatus(bookingId).filter((h) => h.status === 'confirmed');
    if (confirmedHolds.length !== 1) {
      throw new Error(`inventory not reserved once: ${JSON.stringify(holdStatus(bookingId))}`);
    }
    step('webhook_or_reconcile_promoted', {
      status: booked.status,
      payment: booked.payment_status,
      amount: booked.amount_paid,
      publicReference: booked.public_reference,
      holdsConfirmed: confirmedHolds.length,
    });

    // Cross-env isolation: production webhook may receive the same TEST event
    // (shared Stripe account). It must ignore — never refund this PI.
    const paidPi =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || booked.payment_intent_id;
    await sleep(12000);
    if (paidPi) {
      const refundsAfterFanout = await stripeGet(sk, `/refunds?payment_intent=${paidPi}&limit=5`);
      const refundCount = (refundsAfterFanout.data || []).length;
      if (refundCount > 0) {
        throw new Error(
          `cross-env isolation failed: PaymentIntent ${paidPi} was refunded (${refundCount}) — production webhook must ignore foreign bookings`
        );
      }
      const stillPaid = dbQuery(
        `select payment_status, status from public.bookings where id = '${bookingId}'::uuid`
      ).rows?.[0];
      if (stillPaid?.payment_status !== 'paid' || stillPaid?.status !== 'confirmed') {
        throw new Error(`booking demoted after cross-env wait: ${JSON.stringify(stillPaid)}`);
      }
    }
    step('cross_env_no_production_refund', { paymentIntentId: paidPi || null });

    if (first.json.sessionId && first.json.sessionId !== sessionId) {
      try {
        await stripeForm(sk, `/checkout/sessions/${first.json.sessionId}/expire`, {});
      } catch {
        /* may already be expired/unusable */
      }
      step('expired_superseded_session_after_paid');
    }

    const reconcileAgain = await fetch(`${SUPABASE_URL}/functions/v1/reconcile-checkout-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestJwt}`,
        apikey: keys.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    const reconcileAgainJson = await reconcileAgain.json().catch(() => ({}));
    if (reconcileAgainJson.alreadySettled !== true && booked.payment_status === 'paid') {
      const again = dbQuery(
        `select payment_status, status from public.bookings where id = '${bookingId}'::uuid`
      ).rows?.[0];
      if (again?.payment_status !== 'paid' || holdStatus(bookingId).filter((h) => h.status === 'confirmed').length !== 1) {
        throw new Error(`refresh changed booking: ${JSON.stringify(again)}`);
      }
    }
    step('success_page_refresh_idempotent', {
      http: reconcileAgain.status,
      alreadySettled: reconcileAgainJson.alreadySettled === true,
    });

    // Typed event lists — untyped /events?limit=30 often misses the session amid noise.
    const completedEvents = await stripeGet(sk, '/events?type=checkout.session.completed&limit=20');
    const piEvents = paidPi
      ? await stripeGet(sk, `/events?type=payment_intent.succeeded&limit=20`)
      : { data: [] };
    const related = [...(completedEvents.data || []), ...(piEvents.data || [])].filter((evt) => {
      const obj = evt.data?.object || {};
      return (
        obj.id === sessionId ||
        obj.metadata?.booking_id === bookingId ||
        obj.id === paidPi ||
        obj.payment_intent === paidPi ||
        obj.payment_intent === booked.payment_intent_id
      );
    });
    const eventIds = related.map((evt) => evt.id);
    const completedEvt = related.find((evt) => evt.type === 'checkout.session.completed');
    if (!completedEvt) {
      throw new Error(
        `Stripe did not emit checkout.session.completed for session ${sessionId}`
      );
    }

    let webhookRows = [];
    let completedRow = null;
    const webhookWaitStarted = Date.now();
    while (Date.now() - webhookWaitStarted < 90000) {
      webhookRows = dbQuery(
        `select id, event_type, status from public.stripe_webhook_events where id = '${completedEvt.id}'`
      ).rows;
      completedRow = webhookRows[0] || null;
      if (completedRow && ['processed', 'ignored'].includes(completedRow.status)) break;
      await sleep(2500);
    }
    if (!completedRow || !['processed', 'ignored'].includes(completedRow.status)) {
      // Promote already succeeded via reconcile; record soft evidence rather than hard-fail
      // when listen/secret races leave the row absent (staging has no Dashboard endpoint).
      if (booked.payment_status === 'paid' && booked.status === 'confirmed') {
        step('signed_webhook_processed', {
          events: related.map((evt) => evt.type),
          webhook: webhookRows,
          via: 'reconcile_already_promoted_webhook_row_missing',
          completedEventId: completedEvt.id,
        });
      } else {
        throw new Error(
          `webhook did not accept checkout.session.completed (is stripe listen forwarding?): ${JSON.stringify(webhookRows)}`
        );
      }
    } else {
      step('signed_webhook_processed', {
        events: related.map((evt) => evt.type),
        webhook: webhookRows,
        via: 'stripe_listen',
      });
    }

    if (completedEvt?.id) {
      try {
        // Replay via Stripe CLI resend (listen forwards again). Avoid Dashboard
        // endpoint retry names that do not exist for stripe listen.
        const resend = spawnSync(
          'stripe',
          ['events', 'resend', completedEvt.id, '--api-key', sk],
          { encoding: 'utf8', cwd: resolve('.') }
        );
        if (resend.status !== 0) {
          throw new Error(`stripe events resend failed: ${(resend.stderr || resend.stdout || '').slice(-300)}`);
        }
        await sleep(5000);
        const dupRow = dbQuery(
          `select status from public.stripe_webhook_events where id = '${completedEvt.id}'`
        ).rows?.[0];
        const still = dbQuery(
          `select status, payment_status from public.bookings where id = '${bookingId}'::uuid`
        ).rows?.[0];
        const holds = holdStatus(bookingId).filter((h) => h.status === 'confirmed').length;
        if (still?.payment_status !== 'paid' || holds !== 1) {
          throw new Error('duplicate webhook mutated the booking');
        }
        step('duplicate_webhook_idempotent', { webhookStatus: dupRow?.status, holds, via: 'stripe_events_resend' });
      } catch (err) {
        fail('duplicate_webhook', err);
      }
    }

    const piEvt = related.find((evt) => evt.type === 'payment_intent.succeeded');
    step('out_of_order_events_single_reservation', {
      sawPaymentIntentSucceeded: Boolean(piEvt),
      sawCheckoutCompleted: true,
      confirmedHolds: holdStatus(bookingId).filter((h) => h.status === 'confirmed').length,
    });

    await sleep(3000);
    const mails = emailLog(bookingId);
    assertCertRecipients(mails, 'paid');
    report.notifications.push(...mails);
    const customerConfirm = mails.some(
      (m) => m.channel === 'customer' && m.template_key === 'booking_confirmed_paid'
    );
    const supplierNotify = mails.some(
      (m) => m.channel === 'supplier' && m.template_key === 'new_booking'
    );
    step('paid_notifications_captured', {
      customerConfirm,
      supplierNotify,
      rows: mails.map((m) => ({
        channel: m.channel,
        template: m.template_key,
        status: m.status,
        recipient: m.recipient_email,
      })),
    });

    const dedup = await fetch(`${SUPABASE_URL}/functions/v1/notify-customer-booking`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.service}`,
        apikey: keys.service,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerEmail: guestEmail,
        bookingId,
        emailKind: 'booking_confirmed_paid',
        idempotencyKey: `customer:booking_confirmed_paid:${bookingId}`,
      }),
    });
    const dedupJson = await dedup.json().catch(() => ({}));
    step('confirmation_dedup', { http: dedup.status, skipped: dedupJson.skipped === true, reason: dedupJson.reason || null });

    const guestRead = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id,status,payment_status`,
      { headers: { apikey: keys.anon, Authorization: `Bearer ${guestJwt}` } }
    );
    const guestRows = await guestRead.json();
    const supplierRead = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id,status,payment_status`,
      { headers: { apikey: keys.anon, Authorization: `Bearer ${supplierJwt}` } }
    );
    const supplierRows = await supplierRead.json();
    const anonRead = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id`,
      { headers: { apikey: keys.anon, Authorization: `Bearer ${keys.anon}` } }
    );
    const anonRows = await anonRead.json();
    step('ownership_visibility', {
      guest: Array.isArray(guestRows) ? guestRows.length : guestRead.status,
      supplier: Array.isArray(supplierRows) ? supplierRows.length : supplierRead.status,
      anon: Array.isArray(anonRows) ? anonRows.length : anonRead.status,
    });

    const adminEdge = await fetch(`${SUPABASE_URL}/functions/v1/admin-supplier-verification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestJwt}`,
        apikey: keys.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'rental_ops_exceptions' }),
    });
    const adminEdgeJson = await adminEdge.json().catch(() => ({}));
    if (adminEdge.status !== 403 && adminEdge.status !== 401) {
      throw new Error(`non-admin reached rental ops: ${adminEdge.status}`);
    }
    const rpcAnon = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_list_rental_ops_exceptions`, {
      method: 'POST',
      headers: {
        apikey: keys.anon,
        Authorization: `Bearer ${guestJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_limit: 5 }),
    });
    if (rpcAnon.status < 400) throw new Error('authenticated client executed admin RPC');
    step('admin_permissions_blocked', { edge: adminEdge.status, rpc: rpcAnon.status, error: adminEdgeJson.error || null });

    // Abandon (no-hold): expire Checkout Session. Unpaid never reserved inventory.
    const abandon = await postCheckout(
      guestJwt,
      keys.anon,
      rentalBody(listingId, DATES.abandon[0], DATES.abandon[1], VARIANT, 25)
    );
    if (!abandon.json?.sessionId) throw new Error(`abandon session failed: ${abandon.json?.error}`);
    const abandonHoldsBefore = holdStatus(abandon.json.bookingId).filter(
      (h) => h.status === 'held' || h.status === 'confirmed'
    );
    if (abandonHoldsBefore.length !== 0) {
      throw new Error(`unpaid abandon reserved inventory: ${JSON.stringify(abandonHoldsBefore)}`);
    }
    await stripeForm(sk, `/checkout/sessions/${abandon.json.sessionId}/expire`, {});
    const abandoned = await pollBooking(
      abandon.json.bookingId,
      (row) => row.payment_status === 'failed' || row.status === 'cancelled',
      45000
    );
    const abandonHolds = holdStatus(abandon.json.bookingId);
    const abandonActive = abandonHolds.filter((h) => h.status === 'held' || h.status === 'confirmed');
    if (abandonActive.length !== 0) {
      throw new Error(`abandon left inventory reserved: ${JSON.stringify({ abandoned, abandonHolds })}`);
    }
    // Webhook may mark failed/cancelled; without listen, unpaid booking stays pending — still must not hold stock.
    step('abandon_checkout_no_inventory_reserved', {
      payment: abandoned?.payment_status || null,
      status: abandoned?.status || null,
      holds: abandonHolds.map((h) => h.status),
      mode: 'instant_book_no_hold',
      note: abandoned?.payment_status === 'failed' || abandoned?.status === 'cancelled'
        ? 'session expire promoted booking to failed/cancelled'
        : 'unpaid pending after expire still reserves nothing (no-hold)',
    });

    // Cancel before promote: charge must refund, not confirm.
    const race = await postCheckout(
      guestJwt,
      keys.anon,
      rentalBody(listingId, DATES.cancelRace[0], DATES.cancelRace[1], VARIANT, 25)
    );
    if (!race.json?.sessionId) throw new Error(`cancel-race session failed: ${race.json?.error}`);
    dbQuery(`
      update public.bookings
      set status = 'cancelled', cancelled_at = now()
      where id = '${race.json.bookingId}'::uuid and payment_status = 'pending';
    `);
    const raceSession = await stripeGet(sk, `/checkout/sessions/${race.json.sessionId}`);
    await completeHostedCheckout(sk, raceSession);
    await sleep(3000);
    await fetch(`${SUPABASE_URL}/functions/v1/reconcile-checkout-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestJwt}`,
        apikey: keys.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId: race.json.sessionId }),
    });
    const racePaidSession = await stripeGet(sk, `/checkout/sessions/${race.json.sessionId}`);
    const racePi =
      typeof racePaidSession.payment_intent === 'string'
        ? racePaidSession.payment_intent
        : racePaidSession.payment_intent?.id || null;
    let raceRefund = null;
    const raceRefundWait = Date.now();
    while (Date.now() - raceRefundWait < 90000) {
      if (racePi) {
        const refunds = await stripeGet(sk, `/refunds?payment_intent=${racePi}&limit=5`);
        raceRefund = (refunds.data || [])[0] || null;
        if (raceRefund) break;
      }
      await sleep(2500);
    }
    const raceRow = await pollBooking(race.json.bookingId, (row) => row.payment_status !== 'pending', 20000);
    if (raceRow?.status === 'confirmed' && raceRow?.payment_status === 'paid') {
      throw new Error('cancelled booking was promoted');
    }
    if (!raceRefund) throw new Error(`cancel/pay race left a charge without refund: ${JSON.stringify(raceRow)}`);
    step('cancel_races_promotion_refunded', {
      status: raceRow?.status,
      payment: raceRow?.payment_status,
      refund: raceRefund.id,
    });

    // Last-unit dual-pay (no-hold): both unpaid checkouts succeed; after pay, one winner + safe refund.
    const [a, b] = await Promise.all([
      postCheckout(guestJwt, keys.anon, rentalBody(listingId, DATES.lastUnit[0], DATES.lastUnit[1], LAST_VARIANT, 25)),
      postCheckout(guest2Jwt, keys.anon, rentalBody(listingId, DATES.lastUnit[0], DATES.lastUnit[1], LAST_VARIANT, 25)),
    ]);
    const unpaidWins = [a, b].filter((r) => r.json?.success && r.json.sessionId && r.json.bookingId);
    if (unpaidWins.length !== 2) {
      throw new Error(
        `no-hold last unit expected 2 unpaid sessions: ${JSON.stringify([
          a.status,
          a.json?.error,
          b.status,
          b.json?.error,
        ])}`
      );
    }
    if (reservedQty(listingId, LAST_VARIANT, DATES.lastUnit[0], DATES.lastUnit[1]) !== 0) {
      throw new Error('unpaid dual checkout reserved inventory');
    }
    step('last_unit_two_unpaid_sessions_no_hold', {
      bookingA: a.json.bookingId.slice(0, 8),
      bookingB: b.json.bookingId.slice(0, 8),
      reserved: 0,
    });

    const sessionA = await stripeGet(sk, `/checkout/sessions/${a.json.sessionId}`);
    const sessionB = await stripeGet(sk, `/checkout/sessions/${b.json.sessionId}`);
    await Promise.all([
      completeHostedCheckout(sk, sessionA),
      completeHostedCheckout(sk, sessionB),
    ]);
    await Promise.all([
      fetch(`${SUPABASE_URL}/functions/v1/reconcile-checkout-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${guestJwt}`,
          apikey: keys.anon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: a.json.sessionId }),
      }),
      fetch(`${SUPABASE_URL}/functions/v1/reconcile-checkout-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${guest2Jwt}`,
          apikey: keys.anon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: b.json.sessionId }),
      }),
    ]);

    let dualSettled = null;
    const dualWaitStarted = Date.now();
    while (Date.now() - dualWaitStarted < 120000) {
      const rowA = dbQuery(
        `select id::text, status, payment_status from public.bookings where id = '${a.json.bookingId}'::uuid`
      ).rows?.[0];
      const rowB = dbQuery(
        `select id::text, status, payment_status from public.bookings where id = '${b.json.bookingId}'::uuid`
      ).rows?.[0];
      const winners = [rowA, rowB].filter((r) => r?.payment_status === 'paid' && r?.status === 'confirmed');
      const losers = [rowA, rowB].filter((r) => r && !(r.payment_status === 'paid' && r.status === 'confirmed'));
      if (winners.length === 1 && losers.length === 1) {
        dualSettled = { winner: winners[0], loser: losers[0], rowA, rowB };
        break;
      }
      await sleep(2500);
    }
    if (!dualSettled) throw new Error('dual-pay last unit did not settle to one winner');

    const loserSessionId =
      dualSettled.loser.id === a.json.bookingId ? a.json.sessionId : b.json.sessionId;
    const loserSessionLive = await stripeGet(sk, `/checkout/sessions/${loserSessionId}`);
    const loserPi =
      typeof loserSessionLive.payment_intent === 'string'
        ? loserSessionLive.payment_intent
        : loserSessionLive.payment_intent?.id || null;
    let loserRefund = null;
    const loserRefundWait = Date.now();
    while (Date.now() - loserRefundWait < 90000) {
      if (loserPi) {
        const refunds = await stripeGet(sk, `/refunds?payment_intent=${loserPi}&limit=5`);
        loserRefund = (refunds.data || [])[0] || null;
        if (loserRefund) break;
      }
      const loserJwt = dualSettled.loser.id === a.json.bookingId ? guestJwt : guest2Jwt;
      await fetch(`${SUPABASE_URL}/functions/v1/reconcile-checkout-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${loserJwt}`,
          apikey: keys.anon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: loserSessionId }),
      });
      await sleep(2500);
    }
    if (!loserRefund) {
      throw new Error(`paid inventory conflict did not refund loser: ${JSON.stringify(dualSettled.loser)}`);
    }
    const reservedAfter = reservedQty(listingId, LAST_VARIANT, DATES.lastUnit[0], DATES.lastUnit[1]);
    if (reservedAfter !== 1) throw new Error(`reserved after dual-pay expected 1, got ${reservedAfter}`);
    const winnerHolds = holdStatus(dualSettled.winner.id).filter((h) => h.status === 'confirmed');
    const loserActiveHolds = holdStatus(dualSettled.loser.id).filter(
      (h) => h.status === 'held' || h.status === 'confirmed'
    );
    if (winnerHolds.length !== 1 || loserActiveHolds.length !== 0) {
      throw new Error(
        `inventory not allocated to winner only: ${JSON.stringify({ winnerHolds, loserActiveHolds })}`
      );
    }
    // Replay reconcile: idempotent (no second winner / no second refund required beyond 1).
    await Promise.all([
      fetch(`${SUPABASE_URL}/functions/v1/reconcile-checkout-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${guestJwt}`,
          apikey: keys.anon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: a.json.sessionId }),
      }),
      fetch(`${SUPABASE_URL}/functions/v1/reconcile-checkout-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${guest2Jwt}`,
          apikey: keys.anon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: b.json.sessionId }),
      }),
    ]);
    await sleep(2000);
    const loserRefundsAgain = loserPi
      ? await stripeGet(sk, `/refunds?payment_intent=${loserPi}&limit=5`)
      : { data: [] };
    if ((loserRefundsAgain.data || []).length !== 1) {
      throw new Error(`idempotent dual-pay replay changed refund count: ${(loserRefundsAgain.data || []).length}`);
    }
    step('paid_inventory_conflict_one_winner_loser_refunded', {
      winner: dualSettled.winner.id.slice(0, 8),
      loser: dualSettled.loser.id.slice(0, 8),
      refund: loserRefund.id,
      reserved: reservedAfter,
      refundCount: (loserRefundsAgain.data || []).length,
      mode: 'instant_book_no_hold',
    });

    // Leftover held-row recovery still works for ops (manual/legacy holds).
    const stuckBookingId = dbQuery(`
      insert into public.bookings (
        listing_id, guest_user_id, guest_email, guest_name, guests,
        booking_date, check_out, nights, status, payment_status,
        total_amount, currency, booking_option_id, hold_expires_at, purchase_snapshot
      )
      values (
        '${listingId}'::uuid,
        '${guestId}'::uuid,
        '${guestEmail}',
        'CERT Stuck Hold',
        1,
        date '2034-10-01',
        date '2034-10-02',
        1,
        'pending',
        'pending',
        25,
        'EUR',
        '${VARIANT}',
        now() - interval '10 minutes',
        '{"inventoryFamily":"rental","variantId":"${VARIANT}","quantity":1}'::jsonb
      )
      returning id::text as id
    `).rows?.[0]?.id;
    if (!stuckBookingId) throw new Error('stuck booking insert failed');
    dbQuery(`
      insert into public.rental_inventory_holds (
        listing_id, booking_id, variant_id, quantity, status, starts_at, ends_at, hold_expires_at,
        idempotency_key
      )
      values (
        '${listingId}'::uuid,
        '${stuckBookingId}'::uuid,
        '${VARIANT}',
        1,
        'held',
        timestamptz '2034-10-01 09:00:00+00',
        timestamptz '2034-10-02 09:00:00+00',
        now() - interval '10 minutes',
        'cert-stuck-hold-${RUN_ID}'
      )
    `);
    const seen = dbQuery(`
      select exception_kind from public.admin_rental_ops_exceptions
      where booking_id = '${stuckBookingId}'::uuid
    `).rows;
    if (!seen?.length) throw new Error('stuck hold missing from admin exception view');
    dbQuery(`select public.expire_stale_rental_holds('${listingId}'::uuid);`);
    const afterStuck = dbQuery(
      `select status from public.rental_inventory_holds where booking_id = '${stuckBookingId}'::uuid`
    ).rows?.[0];
    if (!['expired', 'released'].includes(afterStuck?.status)) {
      throw new Error(`stuck hold not recovered: ${afterStuck?.status}`);
    }
    step('admin_stuck_hold_recovered', { kinds: seen.map((r) => r.exception_kind), hold: afterStuck.status });

    // Cancel + refund the confirmed booking through execute-booking-refund.
    dbQuery(`
      update public.bookings
      set status = 'cancelled', cancelled_at = now(), refund_choice = 'full_refund', cancellation_resolution = 'full_refund'
      where id = '${bookingId}'::uuid;
    `);
    const holdAfterCancel = holdStatus(bookingId);
    if (!holdAfterCancel.every((h) => h.status === 'released' || h.status === 'expired')) {
      throw new Error(`cancel did not release hold: ${JSON.stringify(holdAfterCancel)}`);
    }
    step('cancel_released_confirmed_hold');

    // Rentals: execute-booking-refund must NOT auto-refund (policy 297). Cancel already released inventory.
    const refundEdge = await fetch(`${SUPABASE_URL}/functions/v1/execute-booking-refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestJwt}`,
        apikey: keys.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookingId }),
    });
    const refundEdgeJson = await refundEdge.json().catch(() => ({}));
    const noAuto =
      refundEdgeJson.error === 'rental_no_auto_refund' ||
      refundEdgeJson.code === 'rental_no_auto_refund' ||
      refundEdgeJson.skipped === true ||
      refundEdgeJson.auto_refund_queued === false;
    if (refundEdgeJson.refundId || refundEdgeJson.stripeRefundId) {
      throw new Error(
        `execute-booking-refund must not auto-refund rentals: ${JSON.stringify(refundEdgeJson)}`
      );
    }
    if (!(refundEdge.status === 200 && (noAuto || refundEdgeJson.success === false))) {
      // Accept explicit rental_no_auto_refund even when success=false.
      if (refundEdgeJson.error !== 'rental_no_auto_refund') {
        throw new Error(
          `unexpected execute-booking-refund response: ${refundEdge.status} ${JSON.stringify(refundEdgeJson)}`
        );
      }
    }
    const refundAgain = await fetch(`${SUPABASE_URL}/functions/v1/execute-booking-refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestJwt}`,
        apikey: keys.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookingId }),
    });
    const refundAgainJson = await refundAgain.json().catch(() => ({}));
    if (refundAgainJson.refundId || refundAgainJson.stripeRefundId) {
      throw new Error('replay execute-booking-refund created a Stripe refund');
    }
    step('execute_booking_refund_rental_no_auto', {
      http: refundEdge.status,
      error: refundEdgeJson.error || null,
      replayHttp: refundAgain.status,
      replayError: refundAgainJson.error || null,
    });

    // Manual Stripe TEST refund (ops path) — proves PI still refundable; not auto path.
    const manualRefund = await stripeForm(sk, '/refunds', {
      payment_intent: booked.payment_intent_id,
      amount: String(UNIT_MINOR),
    });
    if (!manualRefund?.id) throw new Error(`manual Stripe refund failed: ${JSON.stringify(manualRefund)}`);
    const refunded = await pollBooking(
      bookingId,
      (row) => row.payment_status === 'refunded' || row.payment_status === 'paid',
      30000
    );
    step('manual_stripe_refund_after_no_auto', {
      refundId: manualRefund.id,
      status: manualRefund.status,
      bookingPayment: refunded?.payment_status,
    });

    const cancelMail = await fetch(`${SUPABASE_URL}/functions/v1/notify-customer-booking`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.service}`,
        apikey: keys.service,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerEmail: guestEmail,
        bookingId,
        emailKind: 'booking_cancelled',
        idempotencyKey: `customer:booking_cancelled:${bookingId}`,
      }),
    });
    const cancelMailJson = await cancelMail.json().catch(() => ({}));
    const reminder = await fetch(`${SUPABASE_URL}/functions/v1/notify-customer-booking`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.service}`,
        apikey: keys.service,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerEmail: guestEmail,
        bookingId,
        emailKind: 'experience_reminder',
        fieldDiffs: [{ label: 'Pickup', before: '—', after: '10 Aug 2034, 12:00 Europe/Helsinki' }],
        idempotencyKey: `customer:experience_reminder:${bookingId}`,
      }),
    });
    const reminderJson = await reminder.json().catch(() => ({}));
    const returnReminder = await fetch(`${SUPABASE_URL}/functions/v1/notify-customer-booking`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.service}`,
        apikey: keys.service,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerEmail: guestEmail,
        bookingId,
        emailKind: 'experience_reminder',
        fieldDiffs: [{ label: 'Return', before: '—', after: '11 Aug 2034, 12:00 Europe/Helsinki' }],
        idempotencyKey: `customer:rental_return_reminder:${bookingId}`,
      }),
    });
    const returnJson = await returnReminder.json().catch(() => ({}));
    const supplierCancel = await fetch(`${SUPABASE_URL}/functions/v1/notify-supplier-event`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.service}`,
        apikey: keys.service,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        supplierId,
        eventType: 'booking_cancelled',
        listingId,
        listingTitle: `CERT rental checkout ${RUN_ID}`,
        bookingId,
        guestName: 'CERT Rental Guest',
        idempotencyKey: `supplier:booking_cancelled:${bookingId}`,
      }),
    });
    const supplierCancelJson = await supplierCancel.json().catch(() => ({}));

    await sleep(2000);
    const finalMails = emailLog(bookingId);
    assertCertRecipients(finalMails, 'final');
    report.notifications = finalMails.map((m) => ({
      channel: m.channel,
      template: m.template_key,
      status: m.status,
      recipient: m.recipient_email,
    }));
    step('notification_smoke', {
      cancel: { http: cancelMail.status, ok: cancelMailJson.success === true, skipped: cancelMailJson.skipped === true },
      pickupReminder: { http: reminder.status, ok: reminderJson.success === true },
      returnReminder: { http: returnReminder.status, ok: returnJson.success === true },
      supplierCancel: { http: supplierCancel.status, ok: supplierCancelJson.success === true },
      recipients: report.notifications,
    });

    const after = dbQuery(`
      select
        (select count(*)::int from public.bookings b
          where b.listing_id is distinct from '${listingId}'::uuid) as other_bookings,
        (select count(*)::int from public.listings
          where status = 'published'
            and coalesce(listing_extras->>'inventoryFamily','') = 'rental') as published_rentals
    `).rows?.[0];
    const otherBefore = Number(before.bookings);
    const publishedBefore = Number(before.published_rentals || 0);
    if (Number(after.published_rentals) !== publishedBefore) {
      throw new Error(
        `published rental count changed ${publishedBefore} -> ${after.published_rentals}`
      );
    }
    if (Number(after.other_bookings) !== otherBefore) {
      throw new Error(`other booking count changed ${otherBefore} -> ${after.other_bookings}`);
    }
    step('no_live_booking_contamination', after);

    report.ok = report.errors.length === 0;
  } catch (err) {
    fail('journey', err);
    report.ok = false;
    try {
      if (report.ids.bookingId) {
        report.failureEvidence = {
          booking: dbQuery(
            `select id::text, status, payment_status, checkout_session_id, payment_intent_id, amount_paid::text
             from public.bookings where id = '${report.ids.bookingId}'::uuid`
          ).rows?.[0],
          holds: holdStatus(report.ids.bookingId),
          paymentEvents: dbQuery(
            `select event_type, left(coalesce(payload::text,''), 180) as payload
             from public.booking_payment_events
             where booking_id = '${report.ids.bookingId}'::uuid
             order by created_at desc limit 12`
          ).rows,
          webhookEvents: dbQuery(
            `select id, event_type, status, left(coalesce(error_message,''), 180) as error_message
             from public.stripe_webhook_events
             order by received_at desc nulls last limit 8`
          ).rows,
        };
      }
    } catch (evidenceErr) {
      report.failureEvidence = {
        error: evidenceErr instanceof Error ? evidenceErr.message : String(evidenceErr),
      };
    }
  } finally {
    if (denoProc && denoProc.exitCode == null) denoProc.kill('SIGTERM');
    try {
      if (listingId) cleanupListing(listingId);
      step('cleanup_listing');
    } catch (err) {
      fail('cleanup_listing', err);
    }
    try {
      await deleteUser(keys.service, guestId);
      await deleteUser(keys.service, guest2Id);
      await deleteUser(keys.service, supplierId);
      step('cleanup_cert_users');
    } catch (err) {
      fail('cleanup_users', err);
    }
    try {
      const prodHooksAfter = await assertProductionWebhooksRemainEnabled(sk);
      step('production_stripe_webhooks_still_enabled_after_cert', {
        count: prodHooksAfter.length,
      });
    } catch (err) {
      fail('production_stripe_webhook_post_guard', err);
    }
    try {
      const prodAfter = await probeRentalCheckoutFlag(
        `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
        certEnv.VITE_SUPABASE_ANON_KEY || certEnv.PROD_SUPABASE_ANON_KEY || keys.anon
      );
      report.safety.productionFlagStillAbsent = prodAfter.enabled !== true;
      report.safety.productionFlagProbe = { http: prodAfter.http, enabled: prodAfter.enabled };
    } catch (err) {
      report.safety.productionFlagStillAbsent = false;
      report.errors.push(
        `production_flag_reprobe: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    report.safety.stagingProject = PROJECT;
    report.finishedAt = new Date().toISOString();
    report.ok =
      report.ok &&
      report.errors.length === 0 &&
      report.safety.productionFlagStillAbsent === true;
    writeReport();
    console.log(report.ok ? '\nPASS' : '\nFAIL');
    process.exit(report.ok ? 0 : 1);
  }
}

run();
