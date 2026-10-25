/**
 * Reliability certification after Checkout Session ee85074e.
 * Stripe TEST only. Recipients are Resend's delivered@resend.dev sink.
 * Does not set RENTAL_CHECKOUT_ENABLED on the hosted project.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = 'xcopqllkulxfkpunetbc';
const SUPABASE_URL = `https://${PROJECT}.supabase.co`;
const WEBHOOK_ENDPOINT = 'we_1TWkBwC3BaJIHpM6eVbY1DOc';
const DENO = '/tmp/deno/bin/deno';
const LOCAL_FN = 'http://127.0.0.1:8000';
const SINK = 'delivered@resend.dev';
const RUN_ID = randomUUID().slice(0, 8);
const HERO = 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=60';

const report = {
  runId: RUN_ID,
  startedAt: new Date().toISOString(),
  steps: [],
  email: {},
  reminders: {},
  recovery: {},
  regression: {},
  admin: {},
  ids: {},
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
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--output', 'json', sql], {
    encoding: 'utf8',
    cwd: resolve('.'),
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`db query failed: ${(r.stderr || r.stdout || '').slice(-1500)}`);
  const out = r.stdout || '';
  const start = out.indexOf('{');
  if (start < 0) throw new Error(`no json in db output: ${out.slice(-500)}`);
  return JSON.parse(out.slice(start));
}

function loadApiKeys() {
  const r = spawnSync(
    'npx',
    ['supabase', 'projects', 'api-keys', '--project-ref', PROJECT, '-o', 'json'],
    { encoding: 'utf8', cwd: resolve('.'), maxBuffer: 2 * 1024 * 1024 }
  );
  if (r.status !== 0) throw new Error(`api-keys failed: ${(r.stderr || '').slice(-400)}`);
  const start = (r.stdout || '').indexOf('[');
  const rows = JSON.parse(r.stdout.slice(start));
  const anon = rows.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
  const service = rows.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key;
  if (!anon || !service) throw new Error('legacy anon or service_role key missing');
  return { anon, service };
}

function step(name, detail = {}) {
  report.steps.push({ name, ok: true, ...detail, at: new Date().toISOString() });
  console.log(`✓ ${name}`);
}

function fail(name, err) {
  const msg = err instanceof Error ? err.message : String(err);
  report.steps.push({ name, ok: false, error: msg, at: new Date().toISOString() });
  console.error(`✗ ${name}: ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stripeForm(sk, path, params) {
  const body = new URLSearchParams();
  const flatten = (obj, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key);
      else if (v !== undefined && v !== null) body.append(key, String(v));
    }
  };
  flatten(params);
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' },
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

async function createUser(service, email, password) {
  const allowed = email.endsWith('@example.com') || email === SINK;
  if (!allowed) throw new Error('refusing unexpected auth email');
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
  if (!res.ok) throw new Error(`create user failed: ${json?.msg || json?.error_code || res.status}`);
  return json.id;
}

async function signIn(anon, email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`sign-in failed: ${res.status}`);
  return json.access_token;
}

async function deleteUser(service, id) {
  if (!id) return;
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${service}`, apikey: service },
  });
}

function ymdInTz(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function sqlJson(value) {
  return JSON.stringify(value).replace(/'/g, "''");
}

async function bootCheckout(sk, keys) {
  const denoProc = spawn(
    DENO,
    ['run', '-A', '--no-prompt', 'supabase/functions/create-booking-checkout-session/index.ts'],
    {
      cwd: resolve('.'),
      env: {
        ...process.env,
        SUPABASE_URL,
        SUPABASE_ANON_KEY: keys.anon,
        SUPABASE_SERVICE_ROLE_KEY: keys.service,
        STRIPE_SECRET_KEY: sk,
        RENTAL_CHECKOUT_ENABLED: '1',
        PUBLIC_SITE_URL: 'https://www.traverion.com',
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
  for (let i = 0; i < 90; i++) {
    try {
      const ping = await fetch(LOCAL_FN, { method: 'OPTIONS' });
      if (ping.status < 500) return denoProc;
    } catch {
      /* booting */
    }
    if (denoProc.exitCode != null) break;
    await sleep(500);
  }
  denoProc.kill('SIGTERM');
  throw new Error(`local checkout did not boot: ${denoLog.slice(-600)}`);
}

async function postCheckout(jwt, anon, body) {
  const res = await fetch(`${LOCAL_FN}/`, {
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

function sessionIdOf(json) {
  return json?.sessionId || json?.checkoutSessionId || null;
}

async function completeHostedCheckout(sk, session) {
  const pm = await stripeForm(sk, '/payment_methods', {
    type: 'card',
    'card[token]': 'tok_visa',
    'billing_details[name]': 'CERT Guest',
    'billing_details[email]': session.customer_email,
    'billing_details[address][country]': 'FI',
  });
  const confirmed = await stripeForm(sk, `/payment_pages/${session.id}/confirm`, {
    payment_method: pm.id,
    expected_amount: String(session.amount_total),
    expected_payment_method_type: 'card',
  });
  const paymentStatus = confirmed.payment_status || confirmed.status || null;
  if (paymentStatus !== 'paid' && confirmed.status !== 'complete') {
    throw new Error(`payment page not paid: ${paymentStatus || 'unknown'}`);
  }
  return confirmed;
}

function bookingRow(id) {
  return dbQuery(
    `select id::text, status, payment_status, checkout_session_id, payment_intent_id,
            public_reference, guest_email, booking_date::text, check_out::text
     from public.bookings where id = '${id}'::uuid`
  ).rows?.[0];
}

function holds(bookingId) {
  return dbQuery(
    `select status, count(*)::int as n from public.rental_inventory_holds
     where booking_id = '${bookingId}'::uuid group by status`
  ).rows;
}

function emailRows(bookingId) {
  return dbQuery(`
    select channel, template_key, recipient_email, status, provider_message_id, error_message, idempotency_key
    from public.transactional_email_log
    where entity_id = '${bookingId}'
       or idempotency_key like '%${bookingId}%'
    order by created_at
  `).rows;
}

async function poll(fn, timeoutMs = 80000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(2500);
  }
  return last;
}

async function resendEmail(apiKey, id) {
  const res = await fetch(`https://api.resend.com/emails/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const json = await res.json();
  return { http: res.status, json };
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
  DELETE FROM public.listing_stay_private WHERE listing_id = v_listing;
  DELETE FROM public.bookings WHERE listing_id = v_listing;
  UPDATE public.listings SET status = 'draft' WHERE id = v_listing;
  DELETE FROM public.listings WHERE id = v_listing;
END $$;
SELECT 'cleanup_ok' AS status;
`);
}

function writeReport() {
  report.finishedAt = new Date().toISOString();
  const outPath = resolve('scripts/cert-rental-reliability.report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('report →', outPath);
}

async function run() {
  const env = loadDotEnv();
  const sk = env.STRIPE_SECRET_KEY || '';
  const resendKey = env.RESEND_API_KEY || '';
  if (!sk.startsWith('sk_test_')) {
    fail('stripe_mode', new Error('ABORT: Stripe secret must be test mode'));
    writeReport();
    process.exit(2);
  }
  const secrets = spawnSync('npx', ['supabase', 'secrets', 'list', '--project-ref', PROJECT], {
    encoding: 'utf8',
    cwd: resolve('.'),
  });
  if (/RENTAL_CHECKOUT_ENABLED/i.test(`${secrets.stdout || ''}\n${secrets.stderr || ''}`)) {
    fail('safety_flag', new Error('RENTAL_CHECKOUT_ENABLED is present'));
    writeReport();
    process.exit(2);
  }
  step('rental_checkout_flag_absent');

  const exampleSend = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Traverion <no-reply@traverion.com>',
      to: [`cert-${RUN_ID}@example.com`],
      subject: 'Traverion cert diagnosis',
      html: '<p>Diagnosis only.</p>',
    }),
  });
  const exampleJson = await exampleSend.json();
  report.email.exampleCom = { http: exampleSend.status, message: exampleJson.message || null, id: exampleJson.id || null };
  if (exampleSend.status !== 422) {
    throw new Error(`expected example.com rejection, got ${exampleSend.status}`);
  }
  step('example_com_rejected_by_resend', { http: exampleSend.status });

  const domains = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${resendKey}` },
  });
  const domainJson = await domains.json();
  const traverion = (domainJson.data || []).find((d) => d.name === 'traverion.com');
  report.email.domain = { name: traverion?.name || null, status: traverion?.status || null };
  if (traverion?.status !== 'verified') throw new Error('traverion.com is not a verified Resend domain');
  step('sender_domain_verified');

  const keys = loadApiKeys();
  const password = randomBytes(18).toString('base64url');
  const guestEmail = `cert-rel-guest-${RUN_ID}@example.com`;
  const supplierEmail = SINK;
  report.ids.guestDomain = 'example.com';
  report.ids.supplierRecipient = SINK;

  const before = dbQuery(`
    select
      (select count(*)::int from public.bookings) as bookings,
      (select count(*)::int from public.listings
        where status = 'published'
          and coalesce(listing_extras->>'inventoryFamily','') = 'rental') as published_rentals
  `).rows?.[0];
  report.safety = { before };
  if (Number(before?.published_rentals) !== 0) throw new Error('a rental is already published');

  let denoProc = null;
  let notifyProc = null;
  let supplierProc = null;
  let guestId = null;
  let supplierId = null;
  const listingIds = [];
  const refundLater = [];
  const sessionsToExpire = [];

  try {
    guestId = await createUser(keys.service, guestEmail, password);
    supplierId = await createUser(keys.service, supplierEmail, password);
    report.ids.guestId = guestId;
    report.ids.supplierId = supplierId;
    const guestJwt = await signIn(keys.anon, guestEmail, password);
    step('cert_identities');

    const rentalExtras = sqlJson({
      inventoryFamily: 'rental',
      departureTimezone: 'Europe/Helsinki',
      rental: {
        durationMode: 'daily',
        variants: [{ id: 'cert-unit', name: 'Cert Unit', quantity: 2, pricingOverride: { pricePerDayMinor: 2500 } }],
      },
    });
    const rentalListing = dbQuery(`
      insert into public.listings (
        supplier_id, title, destination, duration, style, status, price_starting_from, price_currency, listing_extras, city, country, image
      ) values (
        '${supplierId}'::uuid,
        'CERT reliability rental ${RUN_ID}',
        'Certville',
        '1 day',
        'adventure',
        'draft',
        25,
        'EUR',
        '${rentalExtras}'::jsonb,
        'Certville',
        'Testland',
        '${HERO}'
      ) returning id::text as id, status;
    `).rows?.[0];
    const rentalListingId = rentalListing?.id;
    listingIds.push(rentalListingId);
    if (rentalListing?.status !== 'draft') throw new Error('rental fixture was not draft');
    dbQuery(`delete from public.supplier_profiles where id = '${supplierId}'::uuid;`);
    const profiles = dbQuery(
      `select count(*)::int as n from public.supplier_profiles where id = '${supplierId}'::uuid`
    ).rows?.[0];
    if (Number(profiles?.n) !== 0) throw new Error('supplier profile was not removed');
    step('failure_fixture_without_supplier_profile');

    denoProc = await bootCheckout(sk, keys);
    step('isolated_checkout_function_booted');
    notifyProc = spawn(
      DENO,
      ['run', '-A', '--node-modules-dir=auto', '--no-prompt', 'supabase/functions/notify-customer-booking/index.ts'],
      {
        cwd: resolve('.'),
        env: {
          ...process.env,
          NOTIFY_LISTEN_PORT: '8002',
          SUPABASE_URL,
          SUPABASE_ANON_KEY: keys.anon,
          SUPABASE_SERVICE_ROLE_KEY: keys.service,
          RESEND_API_KEY: resendKey,
          PUBLIC_SITE_URL: 'https://www.traverion.com',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    notifyProc.stdout.on('data', () => {});
    notifyProc.stderr.on('data', () => {});
    for (let i = 0; i < 120; i++) {
      try {
        const ping = await fetch('http://127.0.0.1:8002/', { method: 'POST', body: '{}' });
        if (ping.status < 500) break;
      } catch {
        /* booting */
      }
      if (i === 119) throw new Error('local notify function did not boot');
      await sleep(500);
    }
    supplierProc = spawn(
      DENO,
      ['run', '-A', '--node-modules-dir=auto', '--no-prompt', 'supabase/functions/notify-supplier-event/index.ts'],
      {
        cwd: resolve('.'),
        env: {
          ...process.env,
          NOTIFY_LISTEN_PORT: '8003',
          SUPABASE_URL,
          SUPABASE_ANON_KEY: keys.anon,
          SUPABASE_SERVICE_ROLE_KEY: keys.service,
          RESEND_API_KEY: resendKey,
          PUBLIC_SITE_URL: 'https://www.traverion.com',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    supplierProc.stdout.on('data', () => {});
    supplierProc.stderr.on('data', () => {});
    for (let i = 0; i < 90; i++) {
      try {
        const ping = await fetch('http://127.0.0.1:8003/', { method: 'POST', body: '{}' });
        if (ping.status < 500) break;
      } catch {
        /* booting */
      }
      if (i === 89) throw new Error('local supplier notify did not boot');
      await sleep(500);
    }

    const checkout = await postCheckout(keys.anon && guestJwt, keys.anon, {
      listingId: rentalListingId,
      customerName: 'CERT Rental Guest',
      checkoutConsentAccepted: true,
      expectedTotal: 25,
      currency: 'EUR',
      successPath: '/booking-confirmed',
      cancelPath: '/cart?payment=cancelled',
      rental: {
        variantId: 'cert-unit',
        quantity: 1,
        pickupAt: '2034-06-01T09:00:00+03:00',
        returnAt: '2034-06-02T09:00:00+03:00',
        durationCount: 1,
        durationUnit: 'day',
      },
    });
    if (!checkout.json?.bookingId || !checkout.json?.sessionId) {
      throw new Error(`rental checkout failed: ${checkout.status} ${checkout.json?.error || ''}`);
    }
    const bookingId = checkout.json.bookingId;
    const sessionId = checkout.json.sessionId;
    report.ids.bookingId = bookingId;
    report.ids.sessionId = sessionId;
    dbQuery(`update public.bookings set guest_email = '${SINK}' where id = '${bookingId}'::uuid;`);
    const session = await stripeGet(sk, `/checkout/sessions/${sessionId}`);
    if (!String(session.id || '').startsWith('cs_test_')) throw new Error('session is not test mode');
    await completeHostedCheckout(sk, session);
    const paidSession = await stripeGet(sk, `/checkout/sessions/${sessionId}`);
    const paymentIntentId = typeof paidSession.payment_intent === 'string' ? paidSession.payment_intent : paidSession.payment_intent?.id;
    refundLater.push(paymentIntentId);
    step('stripe_payment_accepted', { sessionId, paymentIntentId });

    const failedEvent = await poll(async () => {
      const events = await stripeGet(sk, '/events?type=checkout.session.completed&limit=20');
      const match = (events.data || []).find((e) => e.data?.object?.id === sessionId);
      if (!match) return null;
      const row = dbQuery(
        `select id, status, left(coalesce(error_message,''), 240) as error_message
         from public.stripe_webhook_events where id = '${match.id}'`
      ).rows?.[0];
      if (row?.status === 'failed' || row?.status === 'processed') return { eventId: match.id, row, booking: bookingRow(bookingId) };
      return null;
    });
    report.recovery.firstWebhook = failedEvent;
    if (failedEvent?.row?.status !== 'failed') {
      throw new Error(`expected webhook failure without supplier profile, got ${failedEvent?.row?.status}`);
    }
    const holdsAfterFail = holds(bookingId);
    report.recovery.holdsAfterFailure = holdsAfterFail;
    const exceptionsAfterFail = dbQuery(`
      select exception_kind, booking_id::text
      from public.admin_rental_ops_exceptions
      where booking_id = '${bookingId}'::uuid
    `).rows;
    report.recovery.exceptionsAfterFailure = exceptionsAfterFail;
    step('database_failure_after_payment', {
      webhook: failedEvent.row.status,
      error: failedEvent.row.error_message,
      booking: failedEvent.booking?.status,
      payment: failedEvent.booking?.payment_status,
      exceptions: exceptionsAfterFail.map((r) => r.exception_kind),
    });

    dbQuery(`insert into public.supplier_profiles (id) values ('${supplierId}'::uuid) on conflict (id) do nothing;`);
    await stripeForm(sk, `/events/${failedEvent.eventId}/retry`, { webhook_endpoint: WEBHOOK_ENDPOINT });
    const recovered = await poll(async () => {
      const row = dbQuery(
        `select status, left(coalesce(error_message,''), 180) as error_message
         from public.stripe_webhook_events where id = '${failedEvent.eventId}'`
      ).rows?.[0];
      const booking = bookingRow(bookingId);
      if (row?.status === 'processed' && booking?.payment_status === 'paid' && booking?.status === 'confirmed') {
        return { row, booking };
      }
      return null;
    });
    if (!recovered) throw new Error('webhook retry did not confirm the booking');
    const snaps = dbQuery(
      `select count(*)::int as n from public.booking_commercial_snapshots where booking_id = '${bookingId}'::uuid`
    ).rows?.[0];
    const earns = dbQuery(
      `select count(*)::int as n from public.supplier_earning_items where booking_id = '${bookingId}'::uuid`
    ).rows?.[0];
    const holdsAfterRetry = holds(bookingId);
    const confirmedHolds = holdsAfterRetry.filter((h) => h.status === 'confirmed').reduce((n, h) => n + Number(h.n), 0);
    if (confirmedHolds !== 1) throw new Error(`expected one confirmed hold, saw ${JSON.stringify(holdsAfterRetry)}`);
    if (Number(snaps?.n) < 1) throw new Error('earnings snapshot missing after retry');
    report.recovery.afterRetry = { holds: holdsAfterRetry, snapshots: snaps?.n, earningItems: earns?.n };
    step('idempotent_retry_one_hold', report.recovery.afterRetry);

    const mail = await poll(async () => {
      const rows = emailRows(bookingId);
      const confirmed = rows.filter((r) => r.template_key === 'booking_confirmed_paid' || r.template_key === 'new_booking');
      if (confirmed.length >= 2) return rows;
      return null;
    }, 25000);
    const mailRows = mail || emailRows(bookingId);
    report.email.notifyFailures = dbQuery(`
      select event_type, payload
      from public.booking_payment_events
      where booking_id = '${bookingId}'::uuid
        and event_type like 'notify_%'
    `).rows;
    const badRecipient = mailRows.filter((r) => r.recipient_email && r.recipient_email !== SINK);
    report.email.rows = mailRows.map((r) => ({
      channel: r.channel,
      template: r.template_key,
      status: r.status,
      providerMessageId: r.provider_message_id,
      error: r.error_message,
      sink: r.recipient_email === SINK,
    }));
    if (badRecipient.length) throw new Error('a certification email used a non-sink recipient');
    const accepted = mailRows.filter((r) => r.template_key === 'booking_confirmed_paid' || r.template_key === 'new_booking');
    report.email.hostedAcceptedBeforeFallback = accepted.map((r) => r.template_key);
    if (accepted.length < 2) {
      const localConfirm = await fetch('http://127.0.0.1:8002/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keys.service}`,
          apikey: keys.service,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingId,
          customerEmail: SINK,
          emailKind: 'booking_confirmed_paid',
          idempotencyKey: `customer:booking_confirmed_paid:${bookingId}`,
        }),
      });
      const localConfirmJson = await localConfirm.json().catch(() => ({}));
      report.email.localConfirmation = { http: localConfirm.status, ok: localConfirmJson.success === true, error: localConfirmJson.error || null };
      const supplierNote = await fetch('http://127.0.0.1:8003/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keys.service}`,
          apikey: keys.service,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplierId,
          bookingId,
          listingId: rentalListingId,
          eventType: 'new_booking',
          listingTitle: `CERT reliability rental ${RUN_ID}`,
          bookingPaymentStatus: 'paid',
        }),
      });
      report.email.supplierNotifyHttp = supplierNote.status;
      const refreshed = emailRows(bookingId);
      report.email.rows = refreshed.map((r) => ({
        channel: r.channel,
        template: r.template_key,
        status: r.status,
        providerMessageId: r.provider_message_id,
        error: r.error_message,
        sink: r.recipient_email === SINK,
      }));
      if (!refreshed.some((r) => r.template_key === 'booking_confirmed_paid' && r.provider_message_id)) {
        fail('confirmation_emails', new Error(`confirmation not accepted: ${JSON.stringify(report.email.localConfirmation)}`));
      }
    }
    const delivery = [];
    for (const row of emailRows(bookingId).filter((r) => r.provider_message_id)) {
      let last = null;
      for (let i = 0; i < 6; i++) {
        const got = await resendEmail(resendKey, row.provider_message_id);
        last = got.json;
        if (last?.last_event === 'delivered' || last?.last_event === 'bounced') break;
        await sleep(2000);
      }
      delivery.push({
        template: row.template_key,
        acceptance: row.status,
        providerMessageId: row.provider_message_id,
        lastEvent: last?.last_event || null,
        subject: last?.subject || null,
        hasHelsinki: JSON.stringify(last?.html || last?.text || '').includes('Europe/Helsinki'),
      });
    }
    report.email.delivery = delivery;
    report.email.paymentEventTypes = dbQuery(`
      select event_type
      from public.booking_payment_events
      where booking_id = '${bookingId}'::uuid
      order by created_at
    `).rows?.map((r) => r.event_type);
    step('provider_acceptance_and_delivery', {
      templates: delivery.map((d) => `${d.template}:${d.acceptance}/${d.lastEvent}`),
      hosted: report.email.hostedAcceptedBeforeFallback,
      paymentEventTypes: report.email.paymentEventTypes,
    });

    dbQuery(`
      update public.bookings
      set status = 'cancelled', cancelled_at = now(), refund_choice = 'full_refund'
      where id = '${bookingId}'::uuid;
    `);
    const cancelMail = await fetch('http://127.0.0.1:8002/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.service}`,
        apikey: keys.service,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bookingId,
        customerEmail: SINK,
        emailKind: 'booking_cancelled',
        idempotencyKey: `customer:booking_cancelled:${bookingId}`,
      }),
    });
    const cancelJson = await cancelMail.json().catch(() => ({}));
    const supplierCancel = await fetch('http://127.0.0.1:8003/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.service}`,
        apikey: keys.service,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        supplierId,
        bookingId,
        listingId: rentalListingId,
        eventType: 'booking_cancelled',
        listingTitle: `CERT reliability rental ${RUN_ID}`,
      }),
    });
    const supplierCancelJson = await supplierCancel.json().catch(() => ({}));
    const refundEdge = await fetch(`${SUPABASE_URL}/functions/v1/execute-booking-refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guestJwt}`,
        apikey: keys.anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookingId }),
    });
    const refundJson = await refundEdge.json().catch(() => ({}));
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
    const refundMail = await poll(async () => {
      const rows = emailRows(bookingId).filter((r) =>
        ['booking_cancelled', 'refund_initiated', 'refund_completed'].includes(r.template_key)
      );
      if (rows.some((r) => r.template_key === 'refund_completed' && r.provider_message_id)) return rows;
      return null;
    }, 40000);
    report.email.cancelAndRefund = {
      customerCancelHttp: cancelMail.status,
      customerCancelOk: cancelJson.success === true,
      supplierCancelHttp: supplierCancel.status,
      supplierCancelOk: supplierCancelJson.success === true,
      refundHttp: refundEdge.status,
      refundReplayHttp: refundAgain.status,
      refundReplayOk: refundAgainJson.alreadyRefunded === true || refundAgainJson.success === true,
      rows: (refundMail || []).map((r) => ({ template: r.template_key, status: r.status, id: r.provider_message_id })),
    };
    const cancelDelivery = [];
    for (const row of (refundMail || []).filter((r) => r.provider_message_id)) {
      let last = null;
      for (let i = 0; i < 6; i++) {
        const got = await resendEmail(resendKey, row.provider_message_id);
        last = got.json;
        if (last?.last_event === 'delivered' || last?.last_event === 'bounced') break;
        await sleep(2000);
      }
      cancelDelivery.push({
        template: row.template_key,
        acceptance: row.status,
        providerMessageId: row.provider_message_id,
        lastEvent: last?.last_event || null,
        subject: last?.subject || null,
      });
    }
    report.email.cancelAndRefund.delivery = cancelDelivery;
    step('cancellation_and_refund_mail', report.email.cancelAndRefund);

    const todayH = ymdInTz(Date.now(), 'Europe/Helsinki');
    const tomorrowH = addDays(todayH, 1);
    const todayK = ymdInTz(Date.now(), 'Pacific/Kiritimati');
    report.reminders.clocks = { todayHelsinki: todayH, tomorrowHelsinki: tomorrowH, todayKiritimati: todayK };
    const snap = (title, pickup, ret, tz) =>
      sqlJson({
        inventoryFamily: 'rental',
        listingTitle: title,
        departureTimezone: tz,
        pickupAt: pickup,
        returnAt: ret,
        variantId: 'cert-unit',
      });
    const pickupReturn = addDays(tomorrowH, 3);
    const pastPickup = addDays(todayH, -5);
    const shortReturn = addDays(tomorrowH, 2);
    const pickSnap = snap('CERT pickup reminder', tomorrowH + 'T09:00:00+02:00', pickupReturn + 'T09:00:00+02:00', 'Europe/Helsinki');
    const retSnap = snap('CERT return reminder', pastPickup + 'T09:00:00+02:00', tomorrowH + 'T18:00:00+02:00', 'Europe/Helsinki');
    const canSnap = snap('CERT cancelled reminder', tomorrowH + 'T09:00:00+02:00', shortReturn + 'T09:00:00+02:00', 'Europe/Helsinki');
    const tzSnap = snap('CERT timezone control', tomorrowH + 'T09:00:00+02:00', shortReturn + 'T09:00:00+02:00', 'Pacific/Kiritimati');
    const pickRef = 'CERT-' + RUN_ID + '-PICK';
    const retRef = 'CERT-' + RUN_ID + '-RET';
    const canRef = 'CERT-' + RUN_ID + '-CAN';
    const tzRef = 'CERT-' + RUN_ID + '-TZ';
    const insertedReminders = dbQuery(`
      insert into public.bookings (
        listing_id, guest_user_id, guest_email, guest_name, status, payment_status,
        booking_date, check_out, pickup_time, public_reference, purchase_snapshot, currency, total_amount, amount_paid
      ) values
      (
        '${rentalListingId}'::uuid, '${guestId}'::uuid, '${SINK}', 'CERT Rental Guest', 'confirmed', 'paid',
        '${tomorrowH}', '${pickupReturn}', '09:00', '${pickRef}',
        '${pickSnap}'::jsonb,
        'EUR', 25, 25
      ),
      (
        '${rentalListingId}'::uuid, '${guestId}'::uuid, '${SINK}', 'CERT Rental Guest', 'confirmed', 'paid',
        '${pastPickup}', '${tomorrowH}', '09:00', '${retRef}',
        '${retSnap}'::jsonb,
        'EUR', 25, 25
      ),
      (
        '${rentalListingId}'::uuid, '${guestId}'::uuid, '${SINK}', 'CERT Rental Guest', 'cancelled', 'paid',
        '${tomorrowH}', '${shortReturn}', '09:00', '${canRef}',
        '${canSnap}'::jsonb,
        'EUR', 25, 25
      ),
      (
        '${rentalListingId}'::uuid, '${guestId}'::uuid, '${SINK}', 'CERT Rental Guest', 'confirmed', 'paid',
        '${tomorrowH}', '${shortReturn}', '09:00', '${tzRef}',
        '${tzSnap}'::jsonb,
        'EUR', 25, 25
      )
      returning id::text, public_reference;
    `).rows;
    const titled = dbQuery(`
      select id::text, purchase_snapshot->>'listingTitle' as title
      from public.bookings
      where listing_id = '${rentalListingId}'::uuid
        and purchase_snapshot->>'listingTitle' like 'CERT %'
    `).rows;
    const idFor = (title) => titled.find((row) => row.title === title)?.id;
    const pickId = idFor('CERT pickup reminder');
    const retId = idFor('CERT return reminder');
    const canId = idFor('CERT cancelled reminder');
    const tzId = idFor('CERT timezone control');
    report.reminders.inserted = titled;
    if (![pickId, retId, canId, tzId].every((id) => /^[0-9a-f-]{36}$/i.test(String(id || '')))) {
      throw new Error(`reminder fixtures missing: ${JSON.stringify(titled)}`);
    }
    const cronSecret = randomBytes(24).toString('hex');
    const reminderProc = spawn(
      DENO,
      ['run', '-A', '--no-prompt', 'supabase/functions/send-booking-reminders/index.ts'],
      {
        cwd: resolve('.'),
        env: {
          ...process.env,
          PORT: '8000',
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: keys.service,
          BOOKING_REMINDER_CRON_SECRET: cronSecret,
          NOTIFY_CUSTOMER_URL: 'http://127.0.0.1:8002/',
          RESEND_API_KEY: resendKey,
          PUBLIC_SITE_URL: 'https://www.traverion.com',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    reminderProc.stdout.on('data', () => {});
    reminderProc.stderr.on('data', () => {});
    denoProc.kill('SIGTERM');
    await sleep(1000);
    denoProc = reminderProc;
    let reminderUp = false;
    for (let i = 0; i < 90; i++) {
      try {
        const ping = await fetch(LOCAL_FN, { method: 'POST' });
        if (ping.status === 401 || ping.status === 500) {
          reminderUp = true;
          break;
        }
      } catch {
        /* booting */
      }
      await sleep(500);
    }
    if (!reminderUp) throw new Error('reminder function did not boot');
    const unauth = await fetch(LOCAL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const wrong = await fetch(LOCAL_FN, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ onlyBookingIds: [pickId] }),
    });
    async function remind(ids) {
      const res = await fetch(LOCAL_FN, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cronSecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyBookingIds: ids }),
      });
      const json = await res.json();
      return { http: res.status, json };
    }
    const cancelledRun = await remind([canId]);
    const pickupRun = await remind([pickId, tzId]);
    const returnRun = await remind([retId]);
    const pickupAgain = await remind([pickId]);
    report.reminders.runs = {
      unauthorized: unauth.status,
      wrongSecret: wrong.status,
      cancelled: cancelledRun.json,
      pickup: pickupRun.json,
      return: returnRun.json,
      pickupAgain: pickupAgain.json,
    };
    const pickupMail = emailRows(pickId);
    const returnMail = emailRows(retId);
    const tzMail = emailRows(tzId);
    const cancelReminderMail = emailRows(canId);
    report.reminders.mail = {
      pickup: pickupMail.map((r) => r.template_key),
      return: returnMail.map((r) => r.template_key),
      timezoneControl: tzMail.length,
      cancelled: cancelReminderMail.length,
    };
    if (unauth.status !== 401 || wrong.status !== 401) throw new Error('reminder auth gate failed');
    if ((cancelledRun.json.remindersSent || 0) !== 0 || cancelReminderMail.length !== 0) {
      throw new Error('cancelled booking received a reminder');
    }
    if ((pickupRun.json.remindersSent || 0) !== 1 || tzMail.length !== 0) {
      throw new Error(`timezone or pickup selection failed: ${JSON.stringify(pickupRun.json)}`);
    }
    if ((returnRun.json.returnRemindersSent || 0) !== 1) throw new Error('return reminder was not sent');
    if ((pickupAgain.json.remindersSent || 0) !== 0) throw new Error('pickup reminder was sent twice');
    const pickupProvider = pickupMail.find((r) => r.provider_message_id);
    const returnProvider = returnMail.find((r) => r.provider_message_id);
    if (pickupProvider) {
      const got = await resendEmail(resendKey, pickupProvider.provider_message_id);
      const blob = `${got.json.subject || ''}\n${got.json.html || ''}\n${got.json.text || ''}`;
      report.reminders.pickupContent = {
        acceptance: pickupProvider.status,
        lastEvent: got.json.last_event || null,
        hasDate: blob.includes(tomorrowH),
        hasZone: blob.includes('Europe/Helsinki'),
        saysRental: /rental/i.test(blob),
        saysTour: /your tour/i.test(blob),
      };
    }
    if (returnProvider) {
      const got = await resendEmail(resendKey, returnProvider.provider_message_id);
      const blob = `${got.json.subject || ''}\n${got.json.html || ''}\n${got.json.text || ''}`;
      report.reminders.returnContent = {
        acceptance: returnProvider.status,
        lastEvent: got.json.last_event || null,
        hasDate: blob.includes(tomorrowH),
        hasZone: blob.includes('Europe/Helsinki'),
      };
    }
    step('scoped_reminder_invocation', report.reminders.mail);

    denoProc.kill('SIGTERM');
    await sleep(1000);
    denoProc = await bootCheckout(sk, keys);

    const tourExtras = sqlJson({
      departureTimezone: 'Europe/Helsinki',
      inventoryFamily: 'tour',
      bookingOptions: [
        {
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
        },
      ],
    });
    dbQuery(`
      update public.supplier_profiles
      set verification_status = 'verified', payout_verification_status = 'verified'
      where id = '${supplierId}'::uuid;
    `);
    const tour = dbQuery(`
      insert into public.listings (
        supplier_id, title, destination, duration, style, status, price_starting_from, price_currency,
        listing_extras, city, country, image, meeting_point, group_size, experience_kind
      ) values (
        '${supplierId}'::uuid, 'CERT tour ${RUN_ID}', 'Certville', '2 hours', 'adventure', 'published',
        30, 'EUR', '${tourExtras}'::jsonb, 'Certville', 'Testland', '${HERO}',
        'CERT meeting point', '1-4 guests', 'tour'
      ) returning id::text as id, status;
    `).rows?.[0];
    listingIds.push(tour?.id);
    const tourCheckout = await postCheckout(guestJwt, keys.anon, {
      listingId: tour.id,
      customerName: 'CERT Tour Guest',
      checkoutConsentAccepted: true,
      currency: 'EUR',
      bookingDate: '2034-06-13',
      guests: 1,
      bookingOptionId: 'cert-opt',
      startTime: '10:00',
      successPath: '/booking-confirmed',
      cancelPath: '/cart?payment=cancelled',
    });
    const tourSessionId = sessionIdOf(tourCheckout.json);
    if (!tourSessionId) {
      const keysSeen = Object.keys(tourCheckout.json || {}).join(',');
      throw new Error(`tour checkout failed: ${tourCheckout.status} ${tourCheckout.json?.error || keysSeen}`);
    }
    sessionsToExpire.push(tourSessionId);
    dbQuery(`update public.bookings set guest_email = '${SINK}' where id = '${tourCheckout.json.bookingId}'::uuid;`);
    const tourSession = await stripeGet(sk, `/checkout/sessions/${tourSessionId}`);
    await completeHostedCheckout(sk, tourSession);
    const tourPaid = await poll(async () => {
      const row = bookingRow(tourCheckout.json.bookingId);
      return row?.status === 'confirmed' && row?.payment_status === 'paid' ? row : null;
    });
    if (!tourPaid) throw new Error('tour webhook did not confirm');
    dbQuery(`update public.listings set status = 'draft' where id = '${tour.id}'::uuid;`);
    const tourPi = tourPaid.payment_intent_id;
    refundLater.push(tourPi);
    dbQuery(`
      update public.bookings
      set status = 'cancelled', cancelled_at = now(), refund_choice = 'full_refund'
      where id = '${tourCheckout.json.bookingId}'::uuid;
    `);
    const tourRefund = await fetch(`${SUPABASE_URL}/functions/v1/execute-booking-refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guestJwt}`, apikey: keys.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: tourCheckout.json.bookingId }),
    });
    const tourRefundJson = await tourRefund.json().catch(() => ({}));
    report.regression.tour = {
      sessionId: tourSessionId,
      bookingId: tourCheckout.json.bookingId,
      confirmed: true,
      refundHttp: tourRefund.status,
      refundOk: tourRefundJson.success === true,
      unpublishedAfter: dbQuery(`select status from public.listings where id = '${tour.id}'::uuid`).rows?.[0]?.status,
    };
    step('tour_checkout_webhook_refund', report.regression.tour);

    const stayExtras = sqlJson({
      inventoryFamily: 'stay',
      departureTimezone: 'Europe/Helsinki',
      stay: {
        accommodationMode: 'single',
        nightlyPriceUsd: 40,
        maxGuests: 2,
        checkInTime: '15:00',
        checkOutTime: '11:00',
        minNights: 1,
      },
    });
    const stay = dbQuery(`
      insert into public.listings (
        supplier_id, title, destination, duration, style, status, price_starting_from, price_currency,
        listing_extras, city, country, image
      ) values (
        '${supplierId}'::uuid, 'CERT stay ${RUN_ID}', 'Certville', '2 nights', 'cultural', 'draft',
        40, 'EUR', '${stayExtras}'::jsonb, 'Certville', 'Testland', '${HERO}'
      ) returning id::text as id;
    `).rows?.[0];
    listingIds.push(stay?.id);
    dbQuery(`
      insert into public.listing_stay_private (listing_id, check_in_address)
      values ('${stay.id}'::uuid, 'CERT Fixture Street 1');
      update public.listings set status = 'published' where id = '${stay.id}'::uuid;
    `);
    const stayCheckout = await postCheckout(guestJwt, keys.anon, {
      listingId: stay.id,
      customerName: 'CERT Stay Guest',
      checkoutConsentAccepted: true,
      currency: 'EUR',
      bookingDate: '2034-07-01',
      checkoutDate: '2034-07-03',
      guests: 1,
      successPath: '/booking-confirmed',
      cancelPath: '/cart?payment=cancelled',
    });
    const staySessionId = sessionIdOf(stayCheckout.json);
    if (!staySessionId) {
      const keysSeen = Object.keys(stayCheckout.json || {}).join(',');
      throw new Error(`stay checkout failed: ${stayCheckout.status} ${stayCheckout.json?.error || keysSeen}`);
    }
    sessionsToExpire.push(staySessionId);
    dbQuery(`update public.bookings set guest_email = '${SINK}' where id = '${stayCheckout.json.bookingId}'::uuid;`);
    const staySession = await stripeGet(sk, `/checkout/sessions/${staySessionId}`);
    await completeHostedCheckout(sk, staySession);
    const stayPaid = await poll(async () => {
      const row = bookingRow(stayCheckout.json.bookingId);
      return row?.status === 'confirmed' && row?.payment_status === 'paid' ? row : null;
    });
    if (!stayPaid) throw new Error('stay webhook did not confirm');
    dbQuery(`update public.listings set status = 'draft' where id = '${stay.id}'::uuid;`);
    refundLater.push(stayPaid.payment_intent_id);
    dbQuery(`
      update public.bookings
      set status = 'cancelled', cancelled_at = now(), refund_choice = 'full_refund'
      where id = '${stayCheckout.json.bookingId}'::uuid;
    `);
    const stayRefund = await fetch(`${SUPABASE_URL}/functions/v1/execute-booking-refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guestJwt}`, apikey: keys.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: stayCheckout.json.bookingId }),
    });
    const stayRefundJson = await stayRefund.json().catch(() => ({}));
    report.regression.stay = {
      sessionId: staySessionId,
      bookingId: stayCheckout.json.bookingId,
      confirmed: true,
      refundHttp: stayRefund.status,
      refundOk: stayRefundJson.success === true,
    };
    step('stay_checkout_webhook_refund', report.regression.stay);

    const stuck = await postCheckout(guestJwt, keys.anon, {
      listingId: rentalListingId,
      customerName: 'CERT Rental Guest',
      checkoutConsentAccepted: true,
      expectedTotal: 25,
      currency: 'EUR',
      successPath: '/booking-confirmed',
      cancelPath: '/cart?payment=cancelled',
      rental: {
        variantId: 'cert-unit',
        quantity: 1,
        pickupAt: '2034-08-01T09:00:00+03:00',
        returnAt: '2034-08-02T09:00:00+03:00',
        durationCount: 1,
        durationUnit: 'day',
      },
    });
    if (!stuck.json?.bookingId) throw new Error(`stuck-hold checkout failed: ${stuck.json?.error || stuck.status}`);
    if (stuck.json.sessionId) sessionsToExpire.push(stuck.json.sessionId);
    dbQuery(`
      update public.rental_inventory_holds
      set hold_expires_at = now() - interval '2 hours'
      where booking_id = '${stuck.json.bookingId}'::uuid;
      update public.bookings
      set hold_expires_at = now() - interval '2 hours'
      where id = '${stuck.json.bookingId}'::uuid;
    `);
    const orphanPi = await stripeForm(sk, '/payment_intents', {
      amount: '2500',
      currency: 'eur',
      confirm: 'true',
      'payment_method_data[type]': 'card',
      'payment_method_data[card][token]': 'tok_visa',
      'automatic_payment_methods[enabled]': 'false',
      'payment_method_types[0]': 'card',
    }).catch(async () => {
      const pm = await stripeForm(sk, '/payment_methods', { type: 'card', 'card[token]': 'tok_visa' });
      return stripeForm(sk, '/payment_intents', {
        amount: '2500',
        currency: 'eur',
        payment_method: pm.id,
        confirm: 'true',
        'payment_method_types[0]': 'card',
      });
    });
    refundLater.push(orphanPi.id);
    const unconfirmedId = dbQuery(`
      insert into public.bookings (
        listing_id, guest_user_id, guest_email, guest_name, status, payment_status,
        booking_date, public_reference, purchase_snapshot, payment_intent_id, currency, total_amount
      ) values (
        '${rentalListingId}'::uuid, '${guestId}'::uuid, '${SINK}', 'CERT Rental Guest', 'pending', 'pending',
        '2034-09-01', 'CERT-${RUN_ID}-UNCONF',
        '${sqlJson({ inventoryFamily: 'rental', listingTitle: 'CERT paid unconfirmed' })}'::jsonb,
        '${orphanPi.id}', 'EUR', 25
      ) returning id::text as id;
    `).rows?.[0]?.id;
    dbQuery(`
      update public.bookings
      set status = 'cancelled', cancelled_at = now() - interval '1 hour', refund_choice = 'full_refund',
          auto_refund_status = 'failed', auto_refund_error = 'cert forced failure', payment_status = 'paid'
      where id = '${bookingId}'::uuid;
    `);

    const adminEmailRow = dbQuery(`select email from public.admin limit 1`).rows?.[0];
    const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.service}`,
        apikey: keys.service,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'magiclink', email: adminEmailRow.email }),
    });
    const linkJson = await linkRes.json();
    const tokenHash = linkJson?.hashed_token || linkJson?.properties?.hashed_token;
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: keys.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
    });
    const verifyJson = await verifyRes.json();
    const adminJwt = verifyJson.access_token;
    if (!adminJwt) throw new Error(`admin session was not issued (${verifyRes.status})`);
    const guestDenied = await fetch(`${SUPABASE_URL}/functions/v1/admin-supplier-verification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guestJwt}`, apikey: keys.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rental_ops_exceptions' }),
    });
    const adminList = await fetch(`${SUPABASE_URL}/functions/v1/admin-supplier-verification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminJwt}`, apikey: keys.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rental_ops_exceptions', bookingPageSize: 200 }),
    });
    const adminJson = await adminList.json();
    const items = Array.isArray(adminJson.items) ? adminJson.items : [];
    const mine = items.filter((item) =>
      [bookingId, stuck.json.bookingId, unconfirmedId].includes(item.booking_id)
    );
    report.admin = {
      guestHttp: guestDenied.status,
      adminHttp: adminList.status,
      adminError: adminJson.error || null,
      count: adminJson.count ?? null,
      kinds: [...new Set(mine.map((item) => item.exception_kind))],
    };
    const auditBefore = dbQuery(`select count(*)::int as n from public.financial_audit_log`).rows?.[0]?.n;
    dbQuery(`select public.expire_stale_rental_holds('${rentalListingId}'::uuid);`);
    const stuckHold = dbQuery(
      `select status from public.rental_inventory_holds where booking_id = '${stuck.json.bookingId}'::uuid`
    ).rows;
    const auditAfter = dbQuery(`select count(*)::int as n from public.financial_audit_log`).rows?.[0]?.n;
    report.admin.stuckHoldAfterExpire = stuckHold;
    report.admin.financialAuditDelta = Number(auditAfter) - Number(auditBefore);
    report.admin.recoveryEvents = dbQuery(`
      select event_type from public.rental_booking_events
      where listing_id = '${rentalListingId}'::uuid
      order by created_at
    `).rows?.map((r) => r.event_type);
    if (guestDenied.status !== 403) throw new Error('guest reached the admin exception inbox');
    if (!report.admin.kinds.includes('stuck_hold') && !report.admin.kinds.includes('pending_hold_expired')) {
      throw new Error(`admin inbox missed the stuck hold: ${report.admin.kinds.join(',')}`);
    }
    if (!report.admin.kinds.includes('paid_unconfirmed')) throw new Error('admin inbox missed paid_unconfirmed');
    if (!report.admin.kinds.includes('failed_refund') && !report.admin.kinds.includes('earnings_missing')) {
      throw new Error(`admin inbox missed refund/earnings exception: ${report.admin.kinds.join(',')}`);
    }
    if (!stuckHold.every((h) => h.status === 'expired' || h.status === 'released')) {
      throw new Error('stuck hold was not expired');
    }
    step('admin_exception_inbox', report.admin);

    const after = dbQuery(`
      select
        (select count(*)::int from public.bookings b
          where not exists (select 1 from public.listings l where l.id = b.listing_id and l.title like 'CERT %${RUN_ID}%')
        ) as other_bookings,
        (select count(*)::int from public.listings
          where status = 'published'
            and coalesce(listing_extras->>'inventoryFamily','') = 'rental') as published_rentals,
        (select count(*)::int from public.listings
          where id in (${listingIds.map((id) => `'${id}'`).join(',')}) and status = 'published') as cert_still_published
    `).rows?.[0];
    report.safety.after = after;
    if (Number(after.published_rentals) !== 0) throw new Error('a rental was published');
    if (Number(after.cert_still_published) !== 0) throw new Error('a cert tour or stay stayed published');
    report.ok = true;
    step('fixtures_isolated', after);
  } catch (err) {
    fail('run', err);
    report.ok = false;
  } finally {
    try {
      if (denoProc) denoProc.kill('SIGTERM');
      if (notifyProc) notifyProc.kill('SIGTERM');
      if (supplierProc) supplierProc.kill('SIGTERM');
    } catch {
      /* already stopped */
    }
    for (const sessionId of sessionsToExpire) {
      try {
        await stripeForm(sk, `/checkout/sessions/${sessionId}/expire`, {});
      } catch {
        /* already expired or paid */
      }
    }
    for (const pi of refundLater) {
      if (!pi) continue;
      try {
        const current = await stripeGet(sk, `/payment_intents/${pi}`);
        if (current.status === 'succeeded' && Number(current.amount_refunded || 0) < Number(current.amount_received || current.amount || 0)) {
          await stripeForm(sk, '/refunds', { payment_intent: pi });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already been refunded|charge_already_refunded/i.test(msg)) {
          report.refundCleanupError = msg;
        }
      }
    }
    for (const id of listingIds) {
      try {
        cleanupListing(id);
      } catch (err) {
        report.cleanupError = err instanceof Error ? err.message : String(err);
      }
    }
    try {
      if (supplierId) dbQuery(`delete from public.supplier_profiles where id = '${supplierId}'::uuid;`);
    } catch {
      /* profile may already be gone */
    }
    await deleteUser(keys.service, guestId);
    await deleteUser(keys.service, supplierId);
    const flagAfter = spawnSync('npx', ['supabase', 'secrets', 'list', '--project-ref', PROJECT], {
      encoding: 'utf8',
      cwd: resolve('.'),
    });
    report.safety = report.safety || {};
    report.safety.flagStillAbsent = !/RENTAL_CHECKOUT_ENABLED/i.test(
      `${flagAfter.stdout || ''}\n${flagAfter.stderr || ''}`
    );
    writeReport();
  }
  if (report.ok === false) process.exit(1);
}

run().catch((err) => {
  fail('fatal', err);
  writeReport();
  process.exit(1);
});
