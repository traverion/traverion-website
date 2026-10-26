/**
 * Shared safety gates for Traverion rental certification scripts.
 * Production Traverionapp must never be the certification target.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PRODUCTION_PROJECT_REF = 'xcopqllkulxfkpunetbc';

export function loadCertEnv() {
  const env = { ...process.env };
  for (const name of ['.env', '.env.local', '.local/rental-cert-staging.env']) {
    try {
      for (const line of readFileSync(resolve(name), 'utf8').split('\n')) {
        if (!line.includes('=') || line.trim().startsWith('#')) continue;
        const i = line.indexOf('=');
        const key = line.slice(0, i).trim();
        const value = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!env[key]) env[key] = value;
      }
    } catch {
      /* missing */
    }
  }
  return env;
}

export function assertStripeTestSecret(sk) {
  if (!sk || typeof sk !== 'string') {
    throw new Error(
      'ABORT: Stripe secret missing. Set CERT_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY (sk_test only).'
    );
  }
  if (sk.startsWith('sk_live')) {
    throw new Error('ABORT: live Stripe keys are forbidden for rental certification.');
  }
  if (!sk.startsWith('sk_test')) {
    throw new Error('ABORT: Stripe secret must start with sk_test.');
  }
  return sk;
}

export function assertStagingProjectRef(ref) {
  const projectRef = String(ref || '').trim();
  if (!projectRef) {
    throw new Error(
      'ABORT: set CERT_SUPABASE_PROJECT_REF to an isolated staging project. Production is refused.'
    );
  }
  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error(
      `ABORT: refusing production Traverionapp (${PRODUCTION_PROJECT_REF}). Use a staging project.`
    );
  }
  return projectRef;
}

export function assertDbUrlNotProduction(dbUrl) {
  const url = String(dbUrl || '').trim();
  if (!url) {
    throw new Error(
      'ABORT: set CERT_DATABASE_URL (or CERT_DB_URL) to the staging Postgres URI. Linked production is refused.'
    );
  }
  if (url.includes(PRODUCTION_PROJECT_REF) || /xcopqllkulxfkpunetbc/i.test(url)) {
    throw new Error('ABORT: database URL points at production Traverionapp.');
  }
  return url;
}

export function assertSupabaseUrlNotProduction(url) {
  const u = String(url || '').trim();
  if (!u) throw new Error('ABORT: CERT_SUPABASE_URL is required.');
  if (u.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('ABORT: CERT_SUPABASE_URL points at production Traverionapp.');
  }
  return u.replace(/\/$/, '');
}

export function resolveCertTarget(env = loadCertEnv()) {
  const projectRef = assertStagingProjectRef(env.CERT_SUPABASE_PROJECT_REF);
  const databaseUrl = assertDbUrlNotProduction(env.CERT_DATABASE_URL || env.CERT_DB_URL);
  const supabaseUrl = assertSupabaseUrlNotProduction(
    env.CERT_SUPABASE_URL || `https://${projectRef}.supabase.co`
  );
  const stripeSecret = assertStripeTestSecret(env.CERT_STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY);
  return {
    projectRef,
    databaseUrl,
    supabaseUrl,
    stripeSecret,
    allowCheckoutEnabledOnStaging: (env.CERT_ALLOW_RENTAL_CHECKOUT || '').trim() === '1',
  };
}
