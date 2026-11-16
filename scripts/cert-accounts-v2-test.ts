/**
 * Creates exactly one Stripe TEST Accounts v2 recipient account and retrieves it.
 * Refuses sk_live_. Does not create a second account if the configuration mismatches.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACCOUNTS_V2_STRIPE_VERSION,
  assertV2RecipientConfig,
  buildV2RecipientCreateBody,
  v2RequirementBuckets,
  type V2AccountSnapshot,
} from '../src/lib/accounts-v2-config.ts';

const reportPath = resolve(process.cwd(), '.tmp/p96-accounts-v2/retrieve.json');
const idempotencyKey = 'traverion-p96-v2-cert-fi-1';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const line of raw.split('\n')) {
        if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
        const i = line.indexOf('=');
        const k = line.slice(0, i).trim();
        const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        if (!(k in process.env)) process.env[k] = v;
      }
    } catch {
      /* optional */
    }
  }
}

loadEnv();
const secret = (process.env.STRIPE_SECRET_KEY || '').trim();
if (!secret.startsWith('sk_test_')) {
  console.error(JSON.stringify({ ok: false, error: 'Refusing non-TEST Stripe secret' }));
  process.exit(1);
}

async function stripeV2(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': ACCOUNTS_V2_STRIPE_VERSION,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as V2AccountSnapshot & {
    error?: { code?: string; message?: string; type?: string };
  };
  return { status: response.status, payload };
}

const createBody = buildV2RecipientCreateBody({
  email: 'p96-v2-cert@partner-demo.traverion.invalid',
  displayName: 'Traverion P96 disposable',
  supplierId: 'p96-v2-cert-fi',
  environment: 'test',
});

const created = await stripeV2('POST', '/v2/core/accounts', createBody, {
  'Idempotency-Key': idempotencyKey,
});

if (created.status >= 400 || created.payload.error) {
  const report = {
    ok: false,
    created_accounts: 0,
    http_status: created.status,
    error_code: created.payload.error?.code ?? null,
    error_message: created.payload.error?.message ?? null,
    stopped: true,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const accountId = created.payload.id;
const check = assertV2RecipientConfig(created.payload);
const buckets = v2RequirementBuckets(created.payload);
const report = {
  ok: check.ok,
  created_accounts: 1,
  account_id: accountId,
  livemode: created.payload.livemode === true,
  dashboard: created.payload.dashboard ?? null,
  requirements_collector: created.payload.defaults?.responsibilities?.requirements_collector ?? null,
  losses_collector: created.payload.defaults?.responsibilities?.losses_collector ?? null,
  fees_collector: created.payload.defaults?.responsibilities?.fees_collector ?? null,
  applied_configurations: created.payload.applied_configurations ?? [],
  country: created.payload.identity?.country ?? null,
  entity_type: created.payload.identity?.entity_type ?? null,
  stripe_transfers_status:
    created.payload.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null,
  merchant_present: created.payload.configuration?.merchant != null,
  problems: check.ok ? [] : check.problems,
  requirement_statuses: buckets.other.slice(0, 30),
  currently_due: buckets.currentlyDue.slice(0, 40),
  past_due: buckets.pastDue.slice(0, 40),
  stopped: !check.ok,
};
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!check.ok) process.exit(2);
