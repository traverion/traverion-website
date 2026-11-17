#!/usr/bin/env node
/**
 * P9.25 — Authorized isolated confirmed-payout fixture for partner-demo ONLY.
 *
 * Inserts presentation-only supplier_payout_periods rows for aurora-ops so
 * Payouts + Documents UI can be browser-certified. Does NOT:
 * - touch production (xcopqllkulxfkpunetbc)
 * - run Stripe payouts / transfers
 * - mutate supplier_earning_items balances or statuses
 * - allocate earnings into periods
 *
 * Usage:
 *   ALLOW_PARTNER_DEMO_CERT_FIXTURE=1 node scripts/cert-p925-seed-demo-payout-fixture.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DEMO_REF = 'gedktutbpfwnstcbffsc';
const DEMO_SUPPLIER_ID = 'a11ce001-d000-4000-8000-000000000001';
const NOTE = 'P9.25 cert fixture — presentation only; no Stripe payout executed';

function loadEnvFile(name) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvFile('.env.partner-demo.local');

if (process.env.ALLOW_PARTNER_DEMO_CERT_FIXTURE !== '1') {
  console.error('Refusing: set ALLOW_PARTNER_DEMO_CERT_FIXTURE=1');
  process.exit(1);
}

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url.includes(DEMO_REF)) {
  console.error(`Refusing: SUPABASE_URL must be partner-demo (${DEMO_REF}). Got: ${url}`);
  process.exit(1);
}
if (!key) {
  console.error('Refusing: SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}

async function rest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation,resolution=merge-duplicates' : 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const paid = {
  supplier_id: DEMO_SUPPLIER_ID,
  currency: 'EUR',
  cadence: 'monthly',
  period_key: 'p925-cert-2026-10',
  period_start: '2026-10-01',
  period_end: '2026-10-31',
  scheduled_for: '2026-11-05',
  status: 'paid',
  amount_minor: 10115,
  item_count: 1,
  paid_at: '2026-11-05T12:00:00Z',
  paid_via: 'cert_fixture',
  note: NOTE,
  connect_lifecycle: 'bank_payout_paid',
};

const prepared = {
  supplier_id: DEMO_SUPPLIER_ID,
  currency: 'EUR',
  cadence: 'monthly',
  period_key: 'p925-cert-2026-11-ready',
  period_start: '2026-11-01',
  period_end: '2026-11-15',
  scheduled_for: '2026-11-20',
  status: 'ready',
  amount_minor: 3825,
  item_count: 1,
  paid_at: null,
  paid_via: null,
  note: NOTE,
  connect_lifecycle: 'internal_only',
};

const upserted = await rest(
  'supplier_payout_periods?on_conflict=supplier_id,currency,period_key',
  { method: 'POST', body: [paid, prepared] }
);

console.log(
  JSON.stringify(
    {
      project: DEMO_REF,
      supplier_id: DEMO_SUPPLIER_ID,
      rows: (upserted || []).map((r) => ({
        id: r.id,
        period_key: r.period_key,
        status: r.status,
        amount_minor: r.amount_minor,
        paid_at: r.paid_at,
        connect_lifecycle: r.connect_lifecycle,
      })),
      safety: {
        earning_items_mutated: false,
        stripe_payout_executed: false,
        production_touched: false,
      },
    },
    null,
    2
  )
);
