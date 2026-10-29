/**
 * Measures create-booking-checkout-session stage timings for a rental listing.
 * Uses CERT_* staging env only. Does not complete payment.
 *
 *   node scripts/measure-rental-checkout-latency.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  PRODUCTION_PROJECT_REF,
  loadCertEnv,
  resolveCertTarget,
} from './cert-rental-target-guard.mjs';

const certEnv = loadCertEnv();
const target = resolveCertTarget(certEnv);
if (target.projectRef === PRODUCTION_PROJECT_REF) {
  throw new Error('Refusing to measure against production');
}

const SUPABASE_URL = target.supabaseUrl;
const ANON = String(certEnv.CERT_SUPABASE_ANON_KEY || '').trim();
const SERVICE = String(certEnv.CERT_SUPABASE_SERVICE_ROLE_KEY || '').trim();
const STRIPE_SK = target.stripeSecret;
const DATABASE_URL = target.databaseUrl;
if (!ANON || !SERVICE) {
  throw new Error('CERT_SUPABASE_ANON_KEY and CERT_SUPABASE_SERVICE_ROLE_KEY are required');
}

function dbQuery(sql) {
  const r = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'psql failed');
  return r.stdout.trim();
}

async function createUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json.access_token;
}

async function invokeCheckout(token, body) {
  const t0 = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-booking-checkout-session`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const clientMs = Date.now() - t0;
  const json = await res.json().catch(() => ({}));
  return { status: res.status, clientMs, json };
}

async function main() {
  const runId = randomUUID().slice(0, 8);
  const email = `rental-speed-${runId}@example.com`;
  const password = `Speed-${runId}-Aa1!`;
  const listingId = dbQuery(`
    select id::text from public.listings
    where listing_extras->>'inventoryFamily' = 'rental'
      and status in ('published','draft')
    order by updated_at desc nulls last
    limit 1
  `);
  if (!listingId) throw new Error('No rental listing on staging');

  const extras = JSON.parse(
    dbQuery(`select listing_extras::text from public.listings where id = '${listingId}'`) || '{}'
  );
  const rental = extras.rental || {};
  const variant = Array.isArray(rental.variants) ? rental.variants[0] : null;
  if (!variant?.id) throw new Error('Rental listing missing variant');

  const supplierId = dbQuery(
    `select supplier_id::text from public.listings where id = '${listingId}'`
  );
  const termsSql = `
    insert into public.supplier_commercial_terms (
      supplier_id, plan_code, commission_bps, payout_cadence, effective_from, status, note
    )
    select '${supplierId}'::uuid, 'standard', 1500, 'monthly', now() - interval '1 day', 'active',
           'speed measure'
    where not exists (
      select 1 from public.supplier_commercial_terms t
      where t.supplier_id = '${supplierId}'::uuid
        and t.status = 'active'
        and t.effective_until is null
    );
  `;
  const terms = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', termsSql], {
    encoding: 'utf8',
  });
  if (terms.status !== 0) throw new Error(terms.stderr || 'terms upsert failed');

  await createUser(email, password);
  const token = await signIn(email, password);

  // Prefer a weekday pickup in Europe/Helsinki so operating-day gates pass.
  const pickup = new Date(Date.now() + 14 * 86400000);
  while (pickup.getUTCDay() === 0 || pickup.getUTCDay() === 6) {
    pickup.setUTCDate(pickup.getUTCDate() + 1);
  }
  pickup.setUTCHours(10, 0, 0, 0);
  const ret = new Date(pickup.getTime() + 86400000);

  const body = {
    listingId,
    listingTitle: 'Speed measure',
    bookingDate: pickup.toISOString().slice(0, 10),
    guests: 1,
    customerName: 'Speed Measure',
    currency: 'EUR',
    checkoutConsentAccepted: true,
    successPath: '/booking-confirmed',
    cancelPath: '/rentals?payment=cancelled',
    rental: {
      variantId: variant.id,
      quantity: 1,
      pickupAt: pickup.toISOString(),
      returnAt: ret.toISOString(),
      durationCount: 1,
      durationUnit: 'day',
    },
  };

  const cold = await invokeCheckout(token, body);

  // Same weekday + 7 days keeps operating-day rules happy for warm/retry.
  const pickup2 = new Date(pickup.getTime() + 7 * 86400000);
  const ret2 = new Date(pickup2.getTime() + 86400000);
  const warmBody = {
    ...body,
    bookingDate: pickup2.toISOString().slice(0, 10),
    rental: {
      ...body.rental,
      pickupAt: pickup2.toISOString(),
      returnAt: ret2.toISOString(),
    },
  };
  const warm = await invokeCheckout(token, warmBody);
  const retry = await invokeCheckout(token, warmBody);

  const report = {
    ok: cold.json?.success === true && warm.json?.success === true,
    project: target.projectRef,
    stripeMode: STRIPE_SK?.startsWith('sk_test') ? 'test' : 'unknown',
    listingId,
    cold: {
      clientMs: cold.clientMs,
      status: cold.status,
      timings: cold.json?.timings,
      error: cold.json?.error,
    },
    warm: {
      clientMs: warm.clientMs,
      status: warm.status,
      timings: warm.json?.timings,
      error: warm.json?.error,
    },
    retry: {
      clientMs: retry.clientMs,
      status: retry.status,
      timings: retry.json?.timings,
      error: retry.json?.error,
    },
    measuredAt: new Date().toISOString(),
  };

  mkdirSync(resolve('.local'), { recursive: true });
  writeFileSync(
    resolve('.local/rental-checkout-latency.report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
