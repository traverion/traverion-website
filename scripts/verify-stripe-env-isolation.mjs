/**
 * Non-destructive Stripe environment isolation checks.
 * Never disables webhooks. Never touches production bookings.
 *
 *   node --env-file=.local/rental-cert-staging.env scripts/verify-stripe-env-isolation.mjs
 *   (or rely on loadCertEnv reading .local/rental-cert-staging.env)
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  PRODUCTION_PROJECT_REF,
  loadCertEnv,
  resolveCertTarget,
} from './cert-rental-target-guard.mjs';

const report = {
  ok: false,
  startedAt: new Date().toISOString(),
  checks: [],
  errors: [],
};

function check(name, pass, detail) {
  report.checks.push({ name, pass, detail });
  if (!pass) report.errors.push({ name, detail });
  console.log(pass ? `PASS ${name}` : `FAIL ${name}`, detail ?? '');
}

function projectRefFromSupabaseUrl(supabaseUrl) {
  const raw = String(supabaseUrl ?? '').trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(host);
    if (m?.[1]) return m[1];
  } catch {
    /* fall through */
  }
  return null;
}

function stripeEventOwnershipDecision(params) {
  const expected = String(params.expectedProjectRef ?? '').trim();
  const stamped = String(params.metadataProjectRef ?? '').trim();
  if (stamped && expected && stamped !== expected) {
    return { action: 'ignore', reason: 'foreign_project_ref' };
  }
  if (!params.bookingFound) {
    return { action: 'ignore', reason: 'booking_not_in_this_environment' };
  }
  return { action: 'accept', reason: 'owned' };
}

async function stripeGet(sk, path) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${sk}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe GET ${path}: ${json?.error?.message || res.status}`);
  return json;
}

async function main() {
  const env = loadCertEnv();
  const target = resolveCertTarget(env);
  const sk = target.stripeSecret;
  if (!sk.startsWith('sk_test_')) {
    check('stripe_test_mode', false, 'CERT Stripe secret must be sk_test_');
    finish(2);
    return;
  }
  check('stripe_test_mode', true, 'sk_test_');

  check(
    'staging_target',
    target.projectRef !== PRODUCTION_PROJECT_REF,
    target.projectRef
  );

  const foreign = stripeEventOwnershipDecision({
    expectedProjectRef: PRODUCTION_PROJECT_REF,
    metadataProjectRef: target.projectRef,
    bookingFound: false,
  });
  check(
    'foreign_project_ignored',
    foreign.action === 'ignore' && foreign.reason === 'foreign_project_ref',
    foreign
  );

  const missing = stripeEventOwnershipDecision({
    expectedProjectRef: PRODUCTION_PROJECT_REF,
    metadataProjectRef: PRODUCTION_PROJECT_REF,
    bookingFound: false,
  });
  check(
    'missing_booking_ignored',
    missing.action === 'ignore' && missing.reason === 'booking_not_in_this_environment',
    missing
  );

  const owned = stripeEventOwnershipDecision({
    expectedProjectRef: PRODUCTION_PROJECT_REF,
    metadataProjectRef: PRODUCTION_PROJECT_REF,
    bookingFound: true,
  });
  check('owned_accepted', owned.action === 'accept', owned);

  const parsed = projectRefFromSupabaseUrl(target.supabaseUrl);
  check('staging_url_parses', parsed === target.projectRef, { parsed, expected: target.projectRef });

  const prodSecrets = spawnSync(
    'npx',
    ['supabase', 'secrets', 'list', '--project-ref', PRODUCTION_PROJECT_REF],
    { encoding: 'utf8', cwd: resolve('.') }
  );
  const listed = `${prodSecrets.stdout || ''}\n${prodSecrets.stderr || ''}`;
  check(
    'production_rental_checkout_absent',
    !/RENTAL_CHECKOUT_ENABLED/i.test(listed),
    'RENTAL_CHECKOUT_ENABLED must stay unset on production'
  );

  try {
    const hooks = await stripeGet(sk, '/webhook_endpoints?limit=100');
    const prod = (hooks.data || []).filter((e) =>
      String(e.url || '').includes(PRODUCTION_PROJECT_REF)
    );
    const disabled = prod.filter((e) => e.status === 'disabled');
    check(
      'production_webhooks_enabled',
      disabled.length === 0 && prod.length > 0,
      { count: prod.length, disabled: disabled.map((e) => e.id) }
    );
  } catch (err) {
    check('production_webhooks_enabled', false, err instanceof Error ? err.message : String(err));
  }

  finish(report.errors.length ? 1 : 0);
}

function finish(code) {
  report.ok = code === 0;
  report.finishedAt = new Date().toISOString();
  const out = resolve('scripts/verify-stripe-env-isolation.report.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('report →', out);
  console.log(report.ok ? '\nPASS' : '\nFAIL');
  process.exit(code);
}

main().catch((err) => {
  check('fatal', false, err instanceof Error ? err.message : String(err));
  finish(2);
});
