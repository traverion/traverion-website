#!/usr/bin/env node
/**
 * P6 — Restore Traverion production Supabase webhook endpoints (Stripe TEST mode API).
 *
 * - Does NOT modify endpoints pointing at other Supabase projects.
 * - Does NOT enable LIVE money or flip Traverion payout flags.
 * - Creates/updates Traverionapp (xcopqllkulxfkpunetbc) endpoints for platform + Connect events.
 * - Writes signing secrets only under .tmp/ (gitignored) for Edge secret injection.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Stripe from 'stripe';

const TRAVERION_HOST = 'xcopqllkulxfkpunetbc.supabase.co';
const TRAVERION_WEBHOOK_URL = `https://${TRAVERION_HOST}/functions/v1/stripe-webhook`;
const OTHER_HOST = 'gedktutbpfwnstcbffsc.supabase.co';

const PLATFORM_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.payment_failed',
  'payment_intent.succeeded',
  'charge.refunded',
  'transfer.created',
  'transfer.updated',
  'transfer.reversed',
];

const CONNECT_EVENTS = [
  'account.updated',
  'payout.created',
  'payout.paid',
  'payout.failed',
  'payout.canceled',
  'payout.updated',
];

const outDir = resolve(process.cwd(), '.tmp/p6-webhook-readiness');
mkdirSync(outDir, { recursive: true });

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

const env = loadEnv(resolve(process.cwd(), '.env'));
const secret = (env.STRIPE_SECRET_KEY || '').trim();
if (!secret.startsWith('sk_test_')) {
  console.error(JSON.stringify({ ok: false, blocked: true, error: 'sk_test_ required; refusing LIVE' }));
  process.exit(2);
}

const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });
const report = {
  ok: false,
  live_money: false,
  traverion_host: TRAVERION_HOST,
  other_host_left_untouched: OTHER_HOST,
  actions: [],
  endpoints_before: [],
  endpoints_after: [],
  secrets_written: false,
  delivery_tests: [],
  blockers: [],
  at: new Date().toISOString(),
};

const before = await stripe.webhookEndpoints.list({ limit: 30 });
report.endpoints_before = before.data.map((e) => ({
  id: e.id,
  host: hostOf(e.url),
  status: e.status,
  api_version: e.api_version,
  connect: Boolean(e.application) || e.metadata?.traverion_listener === 'connect',
  enabled_events: e.enabled_events,
}));

// Never mutate other-project endpoints
const otherEndpoints = before.data.filter((e) => hostOf(e.url) === OTHER_HOST);
report.actions.push({
  action: 'preserve_other_project_endpoints',
  ids: otherEndpoints.map((e) => e.id),
  note: 'Left enabled/disabled state unchanged',
});

let platformSecret = null;
let connectSecret = null;
let platformEndpointId = null;
const connectEndpointId = null;

// Prefer creating fresh Traverion endpoints so we obtain signing secrets.
// Disable older Traverionapp endpoints afterward (same host only).
const existingTraverion = before.data.filter((e) => hostOf(e.url) === TRAVERION_HOST);

const platform = await stripe.webhookEndpoints.create({
  url: TRAVERION_WEBHOOK_URL,
  enabled_events: PLATFORM_EVENTS,
  description: 'Traverionapp platform (P6) — checkout + Connect transfers',
  metadata: {
    traverion_project: 'xcopqllkulxfkpunetbc',
    traverion_listener: 'platform',
    traverion_p6: '1',
  },
});
platformEndpointId = platform.id;
platformSecret = platform.secret;
report.actions.push({
  action: 'create_platform_endpoint',
  id: platform.id,
  events: PLATFORM_EVENTS,
  status: platform.status,
});

const connectEp = await stripe.webhookEndpoints.create({
  url: TRAVERION_WEBHOOK_URL,
  enabled_events: CONNECT_EVENTS,
  connect: true,
  description: 'Traverionapp Connect (P6) — account.updated + connected payouts',
  metadata: {
    traverion_project: 'xcopqllkulxfkpunetbc',
    traverion_listener: 'connect',
    traverion_p6: '1',
  },
});
report.actions.push({
  action: 'create_connect_endpoint',
  id: connectEp.id,
  events: CONNECT_EVENTS,
  status: connectEp.status,
  connect: true,
});
connectSecret = connectEp.secret;

// Disable prior Traverion-host endpoints that are not the new ones (avoid duplicate delivery).
for (const e of existingTraverion) {
  if (e.id === platform.id || e.id === connectEp.id) continue;
  if (e.status === 'disabled') continue;
  await stripe.webhookEndpoints.update(e.id, { disabled: true });
  report.actions.push({
    action: 'disable_stale_traverion_endpoint',
    id: e.id,
    previous_status: e.status,
  });
}
// Also disable any previously disabled duplicates? leave disabled as-is.
for (const e of existingTraverion) {
  if (e.id === platform.id || e.id === connectEp.id) continue;
  if (e.status === 'enabled') continue;
  report.actions.push({
    action: 'leave_disabled_traverion_endpoint',
    id: e.id,
  });
}

writeFileSync(
  resolve(outDir, 'webhook-secrets.env'),
  [
    `# Generated ${new Date().toISOString()} — do not commit`,
    `STRIPE_WEBHOOK_SECRET_TEST=${platformSecret}`,
    `STRIPE_WEBHOOK_SECRET_CONNECT_TEST=${connectSecret}`,
    '',
  ].join('\n'),
  { mode: 0o600 }
);
report.secrets_written = true;
report.secret_file = '.tmp/p6-webhook-readiness/webhook-secrets.env';

const after = await stripe.webhookEndpoints.list({ limit: 30 });
report.endpoints_after = after.data.map((e) => ({
  id: e.id,
  host: hostOf(e.url),
  status: e.status,
  connect_metadata: e.metadata?.traverion_listener ?? null,
  has_transfer: (e.enabled_events || []).some((x) => x === '*' || x.startsWith('transfer.')),
  has_payout: (e.enabled_events || []).some((x) => x === '*' || x.startsWith('payout.')),
  has_account_updated: (e.enabled_events || []).includes('account.updated'),
  has_checkout: (e.enabled_events || []).includes('checkout.session.completed'),
  enabled_events: e.enabled_events,
}));

// Safe delivery tests: signed synthetic events (no LIVE transfers).
async function deliveryTest(name, secretWhsec, type, object) {
  const event = {
    id: `evt_p6_cert_${type.replace(/\./g, '_')}_${Date.now()}`,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: secretWhsec,
  });
  const res = await fetch(TRAVERION_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': header,
    },
    body: payload,
  });
  const bodyText = await res.text();
  let bodyJson = null;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
    bodyJson = { raw: bodyText.slice(0, 300) };
  }
  const row = {
    name,
    type,
    http: res.status,
    ok: res.status >= 200 && res.status < 300,
    body: bodyJson,
  };
  report.delivery_tests.push(row);
  return row;
}

// Unknown transfer → should process as unmatched_transfer (200), not mark paid.
await deliveryTest('transfer.created_unmatched', platformSecret, 'transfer.created', {
  id: 'tr_p6_cert_unmatched',
  object: 'transfer',
  amount: 100,
  currency: 'eur',
  destination: 'acct_p6_cert',
  livemode: false,
  metadata: { traverion_cert: 'p6' },
});

await deliveryTest('transfer.reversed_unmatched', platformSecret, 'transfer.reversed', {
  id: 'tr_p6_cert_unmatched_rev',
  object: 'transfer',
  amount: 100,
  currency: 'eur',
  destination: 'acct_p6_cert',
  reversed: true,
  livemode: false,
  metadata: { traverion_cert: 'p6' },
});

await deliveryTest('payout.paid_unmatched', connectSecret, 'payout.paid', {
  id: 'po_p6_cert_unmatched',
  object: 'payout',
  amount: 100,
  currency: 'eur',
  status: 'paid',
  livemode: false,
  metadata: { traverion_cert: 'p6' },
});

await deliveryTest('account.updated_unlinked', connectSecret, 'account.updated', {
  id: 'acct_p6_cert_unlinked',
  object: 'account',
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: false,
  livemode: false,
  metadata: { traverion_cert: 'p6' },
});

// Bad signature must fail
{
  const event = {
    id: `evt_p6_bad_sig_${Date.now()}`,
    object: 'event',
    type: 'transfer.created',
    livemode: false,
    data: { object: { id: 'tr_bad', object: 'transfer', amount: 1, currency: 'eur' } },
  };
  const payload = JSON.stringify(event);
  const res = await fetch(TRAVERION_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': 't=1,v1=deadbeef',
    },
    body: payload,
  });
  report.delivery_tests.push({
    name: 'invalid_signature_rejected',
    http: res.status,
    ok: res.status === 400,
  });
}

const traverionEnabled = report.endpoints_after.filter(
  (e) => e.host === TRAVERION_HOST && e.status === 'enabled'
);
const otherStillOk = report.endpoints_after.some((e) => e.host === OTHER_HOST);
const platformOk = traverionEnabled.some((e) => e.has_transfer && e.has_checkout);
const connectOk = traverionEnabled.some((e) => e.has_payout && e.has_account_updated);
const deliveriesOk = report.delivery_tests.every((t) => t.ok);

report.ok = platformOk && connectOk && deliveriesOk && report.secrets_written;
report.summary = {
  traverion_enabled_endpoints: traverionEnabled.length,
  platform_events_ready: platformOk,
  connect_events_ready: connectOk,
  other_project_endpoints_preserved: otherStillOk,
  delivery_tests_passed: deliveriesOk,
  live_webhook_api: 'BLOCKED — no sk_live_ in local env; STRIPE_WEBHOOK_SECRET_LIVE already present in Edge secrets',
};

if (!platformOk) report.blockers.push('Traverion platform webhook missing transfer/checkout events');
if (!connectOk) report.blockers.push('Traverion Connect webhook missing payout/account events');
if (!deliveriesOk) report.blockers.push('One or more signed delivery tests failed — set Edge secrets then redeploy/retest');

writeFileSync(resolve(outDir, 'RESTORE.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ok: report.ok,
      platform_endpoint: platformEndpointId,
      connect_endpoint: connectEp.id,
      secret_file: report.secret_file,
      delivery_tests: report.delivery_tests.map((t) => ({ name: t.name, http: t.http, ok: t.ok })),
      blockers: report.blockers,
      summary: report.summary,
    },
    null,
    2
  )
);

void connectEndpointId;
