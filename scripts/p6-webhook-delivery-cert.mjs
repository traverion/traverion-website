#!/usr/bin/env node
/** P6 delivery cert — signed synthetic events against Traverion production webhook. No LIVE transfers. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Stripe from 'stripe';

const outDir = resolve(process.cwd(), '.tmp/p6-webhook-readiness');
mkdirSync(outDir, { recursive: true });
const secrets = Object.fromEntries(
  readFileSync(resolve(outDir, 'webhook-secrets.env'), 'utf8')
    .split(/\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}
const env = loadEnv(resolve(process.cwd(), '.env'));
const URL = 'https://xcopqllkulxfkpunetbc.supabase.co/functions/v1/stripe-webhook';
const stripe = new Stripe(env.STRIPE_SECRET_KEY.trim(), { apiVersion: '2024-06-20' }); // header helper only

/** Match Edge platform mode so events are processed (not ignored). No Stripe money movement. */
const EVENT_LIVEMODE = true;

async function send(name, secret, type, object) {
  const event = {
    id: `evt_p6_${type.replace(/\./g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: EVENT_LIVEMODE,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(URL, {
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
  return { name, type, event_id: event.id, http: res.status, ok: res.status >= 200 && res.status < 300, body };
}

const platform = secrets.STRIPE_WEBHOOK_SECRET_TEST;
const connect = secrets.STRIPE_WEBHOOK_SECRET_CONNECT_TEST;
if (!platform?.startsWith('whsec_') || !connect?.startsWith('whsec_')) {
  console.error('Missing secrets file');
  process.exit(1);
}

const results = [];
results.push(
  await send('transfer.created_unmatched', platform, 'transfer.created', {
    id: 'tr_p6_cert_unmatched',
    object: 'transfer',
    amount: 100,
    currency: 'eur',
    destination: 'acct_p6_cert',
    livemode: false,
    metadata: { traverion_cert: 'p6' },
  })
);
results.push(
  await send('transfer.reversed_unmatched', platform, 'transfer.reversed', {
    id: 'tr_p6_cert_unmatched_rev',
    object: 'transfer',
    amount: 100,
    currency: 'eur',
    destination: 'acct_p6_cert',
    reversed: true,
    amount_reversed: 100,
    livemode: false,
    metadata: { traverion_cert: 'p6' },
  })
);
results.push(
  await send('payout.created_unmatched', connect, 'payout.created', {
    id: 'po_p6_cert_unmatched',
    object: 'payout',
    amount: 100,
    currency: 'eur',
    status: 'pending',
    livemode: false,
    metadata: { traverion_cert: 'p6' },
  })
);
results.push(
  await send('payout.paid_unmatched', connect, 'payout.paid', {
    id: 'po_p6_cert_unmatched_paid',
    object: 'payout',
    amount: 100,
    currency: 'eur',
    status: 'paid',
    livemode: false,
    metadata: { traverion_cert: 'p6' },
  })
);
results.push(
  await send('payout.failed_unmatched', connect, 'payout.failed', {
    id: 'po_p6_cert_unmatched_failed',
    object: 'payout',
    amount: 100,
    currency: 'eur',
    status: 'failed',
    failure_code: 'could_not_process',
    failure_message: 'p6 cert',
    livemode: false,
    metadata: { traverion_cert: 'p6' },
  })
);
results.push(
  await send('account.updated_unlinked', connect, 'account.updated', {
    id: 'acct_p6_cert_unlinked',
    object: 'account',
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    requirements: { currently_due: [], past_due: [] },
    livemode: false,
    metadata: { traverion_cert: 'p6' },
  })
);

// Duplicate delivery of same event id
const dupType = 'transfer.created';
const dupEvent = {
  id: `evt_p6_dup_${Date.now()}`,
  object: 'event',
  api_version: '2024-06-20',
  created: Math.floor(Date.now() / 1000),
  type: dupType,
  livemode: EVENT_LIVEMODE,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  data: {
    object: {
      id: 'tr_p6_dup',
      object: 'transfer',
      amount: 50,
      currency: 'eur',
      destination: 'acct_p6',
      livemode: EVENT_LIVEMODE,
    },
  },
};
const dupPayload = JSON.stringify(dupEvent);
const dupHeader = stripe.webhooks.generateTestHeaderString({ payload: dupPayload, secret: platform });
const r1 = await fetch(URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': dupHeader },
  body: dupPayload,
});
const r2 = await fetch(URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': dupHeader },
  body: dupPayload,
});
const b1 = await r1.json().catch(() => ({}));
const b2 = await r2.json().catch(() => ({}));
results.push({
  name: 'duplicate_event_idempotent',
  http: [r1.status, r2.status],
  ok: r1.status >= 200 && r1.status < 300 && r2.status >= 200 && r2.status < 300,
  first: b1,
  second: b2,
});

const bad = await fetch(URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=nope' },
  body: JSON.stringify({ id: 'evt_bad', type: 'transfer.created', livemode: false, data: { object: {} } }),
});
results.push({ name: 'invalid_signature_rejected', http: bad.status, ok: bad.status === 400 });

const report = {
  ok: results.every((r) => r.ok),
  live_money: false,
  results,
  at: new Date().toISOString(),
};
writeFileSync(resolve(outDir, 'DELIVERY.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, results: results.map((r) => ({ name: r.name, http: r.http, ok: r.ok, status: r.body?.status || r.body?.error || r.second?.status })) }, null, 2));
process.exit(report.ok ? 0 : 1);
