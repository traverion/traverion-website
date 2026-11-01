/**
 * Staging verification for Mission 06.3 (rental returnAt → earnings completion).
 * Applies migration SQL to staging CERT_DATABASE_URL only. No production.
 *
 *   node scripts/cert-rental-earnings-completion-staging.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
const SUPABASE_URL = target.supabaseUrl;
const RUN_ID = randomUUID().slice(0, 8);
const OUT = resolve('scripts/cert-rental-earnings-completion-staging.report.json');
const MIG = resolve('supabase/migrations/296_rental_earnings_completion_return_at.sql');

const report = {
  ok: false,
  phase: 'rental_earnings_completion_return_at',
  mission: '06.3',
  startedAt: new Date().toISOString(),
  runId: RUN_ID,
  environment: {
    project: target.projectRef,
    productionRefRejected: PRODUCTION_PROJECT_REF,
  },
  steps: [],
  errors: [],
  backfill: {},
  verdict: 'UNVERIFIED',
};

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
  console.log('report →', OUT);
}

function dbQuery(sql) {
  if (target.databaseUrl.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('ABORT: refusing production database');
  }
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '--db-url', target.databaseUrl, '--output', 'json', sql],
    { encoding: 'utf8', cwd: resolve('.'), maxBuffer: 20 * 1024 * 1024 }
  );
  if (r.status !== 0) throw new Error(`db query failed: ${(r.stderr || r.stdout || '').slice(-2000)}`);
  const out = (r.stdout || '').trim();
  if (!out || /^(DO|OK|UPDATE \d+|INSERT \d+|SELECT \d+|NOTICE)/i.test(out.split('\n').pop() || '')) {
    // May still contain JSON earlier
  }
  const objStart = out.indexOf('{');
  const arrStart = out.indexOf('[');
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    return JSON.parse(out.slice(objStart));
  }
  if (arrStart >= 0) {
    return { rows: JSON.parse(out.slice(arrStart)) };
  }
  return { rows: [], raw: out.slice(-500) };
}

/** Multi-statement SQL via psql (supabase db query refuses multiple commands). */
function dbExec(sql, { asFile = false } = {}) {
  if (target.databaseUrl.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('ABORT: refusing production database');
  }
  const args = [target.databaseUrl, '-v', 'ON_ERROR_STOP=1'];
  if (asFile) {
    const tmp = resolve(`.tmp/cert-earn-${RUN_ID}.sql`);
    writeFileSync(tmp, sql);
    args.push('-f', tmp);
  } else {
    args.push('-c', sql);
  }
  const r = spawnSync('psql', args, {
    encoding: 'utf8',
    cwd: resolve('.'),
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`psql failed: ${(r.stderr || r.stdout || '').slice(-2500)}`);
  }
  return `${r.stdout || ''}\n${r.stderr || ''}`;
}

function loadApiKeys() {
  return {
    service: certEnv.CERT_SUPABASE_SERVICE_ROLE_KEY || '',
  };
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
  return json.id;
}

async function deleteUser(service, id) {
  if (!id) return;
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${service}`, apikey: service },
  });
}

async function main() {
  if (target.projectRef === PRODUCTION_PROJECT_REF) {
    fail('target', new Error('ABORT: staging only'));
    writeReport();
    process.exit(2);
  }

  const beforeNull = dbQuery(`
    select count(*)::int as n
    from public.supplier_earning_items e
    join public.bookings b on b.id = e.booking_id
    where coalesce(b.purchase_snapshot->>'inventoryFamily','') = 'rental'
      and e.status in ('pending','eligible')
      and e.amount_minor > 0
      and e.service_completed_at is null
  `).rows?.[0]?.n;
  report.backfill.beforeNullCompletion = Number(beforeNull || 0);
  step('baseline_null_rental_completions', { count: report.backfill.beforeNullCompletion });

  // Apply migration to staging via file (SQL is too large for argv).
  const migSql = readFileSync(MIG, 'utf8');
  const applied = dbExec(migSql, { asFile: true });
  const touchMatch = applied.match(/backfill_touched=(\d+)/);
  report.backfill.migrationNoticeTouched = touchMatch ? Number(touchMatch[1]) : null;
  step('migration_296_applied_staging', {
    noticeTouched: report.backfill.migrationNoticeTouched,
  });

  const afterNull = dbQuery(`
    select count(*)::int as n
    from public.supplier_earning_items e
    join public.bookings b on b.id = e.booking_id
    where coalesce(b.purchase_snapshot->>'inventoryFamily','') = 'rental'
      and e.status in ('pending','eligible')
      and e.amount_minor > 0
      and e.service_completed_at is null
      and nullif(trim(coalesce(b.purchase_snapshot->>'returnAt','')), '') is not null
  `).rows?.[0]?.n;
  report.backfill.afterNullWithReturnAt = Number(afterNull || 0);
  step('post_migration_null_with_return_at', { count: report.backfill.afterNullWithReturnAt });

  const keys = loadApiKeys();
  if (!keys.service) {
    fail('api_keys', new Error('CERT_SUPABASE_SERVICE_ROLE_KEY missing'));
    report.verdict = 'UNVERIFIED';
    writeReport();
    process.exit(2);
  }

  // Synthetic fixtures for before/after return + tour/stay regression.
  let supplierId = null;
  const listingId = randomUUID();
  const rentalFutureId = randomUUID();
  const rentalPastId = randomUUID();
  const rentalRefundedId = randomUUID();
  const tourId = randomUUID();
  const stayId = randomUUID();
  const futureReturn = '2099-06-15T15:00:00+03:00';
  const pastReturn = '2020-06-15T15:00:00+03:00';
  const password = randomBytes(18).toString('base64url');

  try {
    supplierId = await createConfirmedUser(
      keys.service,
      `cert-earn-supplier-${RUN_ID}@example.com`,
      password
    );
    dbExec(`
INSERT INTO public.supplier_profiles (id)
VALUES ('${supplierId}'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.listings (
  id, supplier_id, title, destination, duration, style, status, price_starting_from, price_currency, listing_extras
) VALUES (
  '${listingId}'::uuid, '${supplierId}'::uuid, 'CERT earn ${RUN_ID}', 'Test', '1 day', 'adventure', 'draft', 25, 'EUR',
  jsonb_build_object('inventoryFamily','rental')
);

INSERT INTO public.bookings (
  id, listing_id, guest_email, guest_name, guests, booking_date, status, payment_status,
  total_amount, currency, paid_at, purchase_snapshot
) VALUES
(
  '${rentalFutureId}'::uuid, '${listingId}'::uuid, 'cert-earn-f-${RUN_ID}@example.com', 'Future', 1,
  '2099-06-14', 'confirmed', 'paid', 25, 'EUR', now() - interval '1 day',
  jsonb_build_object(
    'inventoryFamily','rental',
    'returnAt','${futureReturn}',
    'pickupAt','2099-06-14T09:00:00+03:00',
    'departureTimezone','Europe/Helsinki'
  )
),
(
  '${rentalPastId}'::uuid, '${listingId}'::uuid, 'cert-earn-p-${RUN_ID}@example.com', 'Past', 1,
  '2020-06-14', 'confirmed', 'paid', 25, 'EUR', '2020-06-01'::timestamptz,
  jsonb_build_object(
    'inventoryFamily','rental',
    'returnAt','${pastReturn}',
    'pickupAt','2020-06-14T09:00:00+03:00',
    'departureTimezone','Europe/Helsinki'
  )
),
(
  '${rentalRefundedId}'::uuid, '${listingId}'::uuid, 'cert-earn-r-${RUN_ID}@example.com', 'Refunded', 1,
  '2020-06-14', 'cancelled', 'refunded', 25, 'EUR', '2020-06-01'::timestamptz,
  jsonb_build_object(
    'inventoryFamily','rental',
    'returnAt','${pastReturn}',
    'departureTimezone','Europe/Helsinki'
  )
),
(
  '${tourId}'::uuid, '${listingId}'::uuid, 'cert-earn-t-${RUN_ID}@example.com', 'Tour', 1,
  '2099-07-01', 'confirmed', 'paid', 99, 'EUR', now() - interval '1 day',
  jsonb_build_object(
    'inventoryFamily','tour',
    'startTimeHm','20:00',
    'duration','3 hours',
    'departureTimezone','Europe/Helsinki'
  )
),
(
  '${stayId}'::uuid, '${listingId}'::uuid, 'cert-earn-s-${RUN_ID}@example.com', 'Stay', 2,
  '2099-08-01', 'confirmed', 'paid', 120, 'EUR', now() - interval '1 day',
  jsonb_build_object(
    'inventoryFamily','stay',
    'checkOut','2099-08-03',
    'checkOutTime','11:00',
    'departureTimezone','Europe/Helsinki'
  )
);

UPDATE public.bookings SET check_out = '2099-08-03', nights = 2 WHERE id = '${stayId}'::uuid;
`);

    const clocks = dbQuery(`
      select
        public.booking_service_completion_at('${rentalFutureId}'::uuid) as rental_future,
        public.booking_service_completion_at('${rentalPastId}'::uuid) as rental_past,
        public.booking_service_completion_at('${tourId}'::uuid) as tour_at,
        public.booking_service_completion_at('${stayId}'::uuid) as stay_at
    `).rows?.[0];

    if (!clocks?.rental_future || !clocks?.rental_past) {
      throw new Error(`rental clocks null: ${JSON.stringify(clocks)}`);
    }
    if (Date.parse(clocks.rental_future) !== Date.parse(futureReturn)) {
      throw new Error(`future return mismatch: ${clocks.rental_future} vs ${futureReturn}`);
    }
    if (Date.parse(clocks.rental_past) !== Date.parse(pastReturn)) {
      throw new Error(`past return mismatch: ${clocks.rental_past} vs ${pastReturn}`);
    }
    if (!clocks.tour_at || !clocks.stay_at) {
      throw new Error(`tour/stay clocks missing: ${JSON.stringify(clocks)}`);
    }
    // Tour ~ start 20:00 + 3h on 2099-07-01 Helsinki
    if (Date.parse(clocks.tour_at) <= Date.now()) {
      throw new Error(`tour completion unexpectedly in the past: ${clocks.tour_at}`);
    }
    if (Date.parse(clocks.stay_at) <= Date.now()) {
      throw new Error(`stay completion unexpectedly in the past: ${clocks.stay_at}`);
    }
    step('completion_clocks', {
      rentalFuture: clocks.rental_future,
      rentalPast: clocks.rental_past,
      tourAt: clocks.tour_at,
      stayAt: clocks.stay_at,
    });

    // Insert earning rows with NULL completion (simulates pre-fix state), then refresh.
    const earnFuture = randomUUID();
    const earnPast = randomUUID();
    const earnRefunded = randomUUID();
    dbExec(`
INSERT INTO public.supplier_earning_items (
  id, booking_id, supplier_id, currency, amount_minor, status,
  sold_at, service_completed_at, experience_at, eligible_at, gross_minor, commission_minor, commission_bps
) VALUES
(
  '${earnFuture}'::uuid, '${rentalFutureId}'::uuid, '${supplierId}'::uuid, 'EUR', 2125, 'pending',
  now() - interval '1 day', null, null, null, 2500, 375, 1500
),
(
  '${earnPast}'::uuid, '${rentalPastId}'::uuid, '${supplierId}'::uuid, 'EUR', 2125, 'pending',
  '2020-06-01'::timestamptz, null, null, null, 2500, 375, 1500
),
(
  '${earnRefunded}'::uuid, '${rentalRefundedId}'::uuid, '${supplierId}'::uuid, 'EUR', 2125, 'pending',
  '2020-06-01'::timestamptz, null, null, null, 2500, 375, 1500
);
`);

    // Mimic migration backfill for these fixtures.
    dbExec(`
DO $$
DECLARE v_hold integer;
BEGIN
  SELECT value_int INTO v_hold FROM public.commercial_runtime_config WHERE key = 'payout_hold_hours';
  v_hold := coalesce(v_hold, 48);
  UPDATE public.supplier_earning_items e
  SET
    service_completed_at = public.booking_service_completion_at(e.booking_id),
    experience_at = coalesce(e.experience_at, public.booking_service_completion_at(e.booking_id)),
    eligible_at = public.booking_service_completion_at(e.booking_id) + make_interval(hours => v_hold),
    updated_at = now()
  WHERE e.id IN ('${earnFuture}'::uuid, '${earnPast}'::uuid, '${earnRefunded}'::uuid);
END $$;
SELECT public.refresh_supplier_earning_eligibility(now());
`);

    const states = dbQuery(`
      select e.id::text, e.status, e.service_completed_at::text, e.eligible_at::text,
             b.payment_status, b.purchase_snapshot->>'returnAt' as return_at
      from public.supplier_earning_items e
      join public.bookings b on b.id = e.booking_id
      where e.id in ('${earnFuture}'::uuid, '${earnPast}'::uuid, '${earnRefunded}'::uuid)
      order by e.id
    `).rows;

    const byId = Object.fromEntries((states || []).map((r) => [r.id, r]));
    const f = byId[earnFuture];
    const p = byId[earnPast];
    const rfd = byId[earnRefunded];
    if (!f?.service_completed_at || f.status !== 'pending') {
      throw new Error(`future rental should stay pending: ${JSON.stringify(f)}`);
    }
    if (Date.parse(f.eligible_at) <= Date.now()) {
      throw new Error(`future eligible_at should be in the future: ${f.eligible_at}`);
    }
    // Past return + hold window (48h) from 2020 → eligible unless blocked.
    if (!p?.service_completed_at || p.status !== 'eligible') {
      throw new Error(`past rental should be eligible: ${JSON.stringify(p)}`);
    }
    if (rfd?.status === 'eligible') {
      throw new Error(`refunded rental must not be eligible: ${JSON.stringify(rfd)}`);
    }
    step('eligibility_transitions', {
      future: { status: f.status, completed: f.service_completed_at, eligibleAt: f.eligible_at },
      past: { status: p.status, completed: p.service_completed_at, eligibleAt: p.eligible_at },
      refunded: { status: rfd?.status, payment: rfd?.payment_status },
    });

    // Amounts unchanged
    const amounts = dbQuery(`
      select amount_minor, gross_minor, commission_minor
      from public.supplier_earning_items
      where id = '${earnPast}'::uuid
    `).rows?.[0];
    if (Number(amounts?.amount_minor) !== 2125 || Number(amounts?.gross_minor) !== 2500) {
      throw new Error(`amounts mutated: ${JSON.stringify(amounts)}`);
    }
    step('amounts_unchanged', amounts);

    report.ok = true;
    report.verdict = 'PASS';
    step('mission_06_3_staging_pass');
  } catch (err) {
    fail('verification', err);
    report.ok = false;
    report.verdict = 'FAIL';
  } finally {
    try {
      dbExec(`
DELETE FROM public.supplier_earning_items
  WHERE booking_id IN (
    '${rentalFutureId}'::uuid, '${rentalPastId}'::uuid, '${rentalRefundedId}'::uuid,
    '${tourId}'::uuid, '${stayId}'::uuid
  );
DELETE FROM public.bookings
  WHERE id IN (
    '${rentalFutureId}'::uuid, '${rentalPastId}'::uuid, '${rentalRefundedId}'::uuid,
    '${tourId}'::uuid, '${stayId}'::uuid
  );
DELETE FROM public.listings WHERE id = '${listingId}'::uuid;
DELETE FROM public.supplier_profiles WHERE id = '${supplierId}'::uuid;
`);
      await deleteUser(keys.service, supplierId);
      step('cleanup_fixtures');
    } catch (err) {
      fail('cleanup', err);
    }
    writeReport();
  }

  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  fail('fatal', err);
  report.verdict = 'UNVERIFIED';
  writeReport();
  process.exit(2);
});
