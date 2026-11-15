#!/usr/bin/env node
/**
 * P7 — LIVE Stripe webhook setup evidence + signed delivery cert (no money movement).
 *
 * Expects Stripe LIVE endpoints already configured for Traverionapp.
 * Reads signing secrets only from .tmp/p7-live-webhook/webhook-secrets.env (gitignored).
 * Does not print secret values. Does not flip payout flags. Does not create LIVE transfers.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Stripe from 'stripe';

const TRAVERION_HOST = 'xcopqllkulxfkpunetbc.supabase.co';
const TRAVERION_WEBHOOK_URL = `https://${TRAVERION_HOST}/functions/v1/stripe-webhook`;
const LIVE_ACCOUNT = 'acct_1TFXp1CJawbWge6X';

const PLATFORM_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
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

const outDir = resolve(process.cwd(), '.tmp/p7-live-webhook');
mkdirSync(outDir, { recursive: true });

function loadKv(path) {
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

const secrets = loadKv(resolve(outDir, 'webhook-secrets.env'));
const platformSecret = (secrets.STRIPE_WEBHOOK_SECRET_LIVE || '').trim();
const connectSecret = (secrets.STRIPE_WEBHOOK_SECRET_CONNECT_LIVE || '').trim();
if (!platformSecret.startsWith('whsec_') || !connectSecret.startsWith('whsec_')) {
  console.error(JSON.stringify({ ok: false, error: 'Missing LIVE webhook secrets file' }));
  process.exit(2);
}

const env = loadKv(resolve(process.cwd(), '.env'));
// Header helper only — TEST key is fine for generateTestHeaderString.
const stripe = new Stripe((env.STRIPE_SECRET_KEY || 'sk_test_placeholder').trim(), {
  apiVersion: '2024-06-20',
});

const report = {
  ok: false,
  live_money: false,
  live_account: LIVE_ACCOUNT,
  traverion_host: TRAVERION_HOST,
  endpoint_url: TRAVERION_WEBHOOK_URL,
  platform_endpoint: 'we_1UcAW0CJawbWge6XTJ6PhWqN',
  connect_endpoint: 'we_1UcAVXCJawbWge6X5kDW9Zxv',
  legacy_disabled: 'we_1UZe1mCJawbWge6XfYimcDMk',
  secrets: {
    platform_live_set: true,
    connect_live_set: true,
    platform_prefix: platformSecret.slice(0, 6),
    connect_prefix: connectSecret.slice(0, 6),
    platform_len: platformSecret.length,
    connect_len: connectSecret.length,
  },
  event_matrix: {
    platform: PLATFORM_EVENTS,
    connect: CONNECT_EVENTS,
  },
  delivery_tests: [],
  blockers: [],
  at: new Date().toISOString(),
};

async function send(name, secret, type, object, extra = {}) {
  const event = {
    id: `evt_p7_${type.replace(/\./g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: true,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
    ...extra,
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(TRAVERION_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  const row = {
    name,
    type,
    event_id: event.id,
    http: res.status,
    ok: res.status >= 200 && res.status < 300,
    body,
  };
  report.delivery_tests.push(row);
  return row;
}

// Platform — transfer must never bank-pay
await send('transfer.created_unmatched', platformSecret, 'transfer.created', {
  id: 'tr_p7_cert_unmatched',
  object: 'transfer',
  amount: 100,
  currency: 'eur',
  destination: 'acct_p7_cert',
  livemode: true,
  metadata: { traverion_cert: 'p7' },
});

await send('transfer.reversed_unmatched', platformSecret, 'transfer.reversed', {
  id: 'tr_p7_cert_unmatched_rev',
  object: 'transfer',
  amount: 100,
  currency: 'eur',
  destination: 'acct_p7_cert',
  reversed: true,
  livemode: true,
  metadata: { traverion_cert: 'p7' },
});

// Connect — payout.paid unmatched must not mark periods paid
await send('payout.created_unmatched', connectSecret, 'payout.created', {
  id: 'po_p7_cert_unmatched',
  object: 'payout',
  amount: 100,
  currency: 'eur',
  status: 'pending',
  livemode: true,
  metadata: { traverion_cert: 'p7' },
});

await send('payout.paid_unmatched', connectSecret, 'payout.paid', {
  id: 'po_p7_cert_unmatched_paid',
  object: 'payout',
  amount: 100,
  currency: 'eur',
  status: 'paid',
  livemode: true,
  metadata: { traverion_cert: 'p7' },
});

await send('payout.failed_unmatched', connectSecret, 'payout.failed', {
  id: 'po_p7_cert_unmatched_failed',
  object: 'payout',
  amount: 100,
  currency: 'eur',
  status: 'failed',
  livemode: true,
  metadata: { traverion_cert: 'p7' },
});

await send('account.updated_unlinked', connectSecret, 'account.updated', {
  id: 'acct_p7_cert_unlinked',
  object: 'account',
  charges_enabled: false,
  payouts_enabled: false,
  details_submitted: false,
  livemode: true,
  metadata: { traverion_cert: 'p7' },
});

// Duplicate idempotency
{
  const type = 'transfer.created';
  const event = {
    id: `evt_p7_dup_${Date.now()}`,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: true,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: 'tr_p7_dup',
        object: 'transfer',
        amount: 50,
        currency: 'eur',
        destination: 'acct_p7_dup',
        livemode: true,
      },
    },
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: platformSecret });
  const post = async () => {
    const res = await fetch(TRAVERION_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': header },
      body: payload,
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { http: res.status, body };
  };
  const first = await post();
  const second = await post();
  report.delivery_tests.push({
    name: 'duplicate_event_idempotent',
    http: [first.http, second.http],
    ok: first.http === 200 && second.http === 200 && second.body?.duplicate === true,
    first: first.body,
    second: second.body,
  });
}

// Bad signature
{
  const event = {
    id: `evt_p7_bad_sig_${Date.now()}`,
    object: 'event',
    type: 'transfer.created',
    livemode: true,
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

const deliveriesOk = report.delivery_tests.every((t) => t.ok);
const transferStatuses = report.delivery_tests
  .filter((t) => String(t.type || '').startsWith('transfer.'))
  .map((t) => t.body?.status);
const payoutPaid = report.delivery_tests.find((t) => t.name === 'payout.paid_unmatched');

report.rules = {
  transfer_never_bank_paid: transferStatuses.every((s) => s === 'unmatched_transfer'),
  payout_paid_unmatched_no_mutation: payoutPaid?.body?.status === 'unmatched_payout',
};

if (!deliveriesOk) report.blockers.push('One or more signed LIVE delivery tests failed');
if (!report.rules.transfer_never_bank_paid) {
  report.blockers.push('transfer.* response did not stay unmatched_transfer');
}
if (!report.rules.payout_paid_unmatched_no_mutation) {
  report.blockers.push('payout.paid unmatched did not return unmatched_payout');
}

report.ok = deliveriesOk && report.rules.transfer_never_bank_paid && report.rules.payout_paid_unmatched_no_mutation;

writeFileSync(resolve(outDir, 'DELIVERY.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ok: report.ok,
      live_money: false,
      platform_endpoint: report.platform_endpoint,
      connect_endpoint: report.connect_endpoint,
      legacy_disabled: report.legacy_disabled,
      delivery: report.delivery_tests.map((t) => ({
        name: t.name,
        http: t.http,
        ok: t.ok,
        status: t.body?.status ?? t.second?.status,
      })),
      rules: report.rules,
      blockers: report.blockers,
    },
    null,
    2
  )
);
