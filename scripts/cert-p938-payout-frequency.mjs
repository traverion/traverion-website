/**
 * Payout frequency cards on the live supplier.
 * Switches frequency, confirms the saved choice, then restores it.
 * Does not change the agreement rate, bank, verification, gates, or send money.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const EMAIL = 'contact@royalnordic.fi';
const ID = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:5173';

function apiKeys() {
  const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT}`, { encoding: 'utf8' });
  const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
  const keys = parsed.keys || parsed;
  return {
    anon: keys.find((k) => k.name === 'anon' || k.id === 'anon')?.api_key,
    service: keys.find((k) => k.name === 'service_role' || k.id === 'service_role')?.api_key,
  };
}

function bpsLabel(bps) {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  if (frac === 0) return `${whole}%`;
  return `${whole}.${String(frac).padStart(2, '0').replace(/0+$/, '')}%`;
}

const { anon, service } = apiKeys();
const admin = createClient(BASE, service, { auth: { persistSession: false, autoRefreshToken: false } });
const pub = createClient(BASE, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
if (link.error) throw new Error(link.error.message);
const verified = await pub.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
if (verified.error || !verified.data.session) throw new Error(verified.error?.message ?? 'no session');
const session = verified.data.session;

async function profile() {
  const { data, error } = await admin
    .from('supplier_profiles')
    .select('payment_cycle, payout_threshold_min, stripe_connected_account_id, payout_iban, verification_status')
    .eq('id', ID)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function terms() {
  const { data, error } = await admin
    .from('supplier_commercial_terms')
    .select('commission_bps, payout_cadence, plan_code, status')
    .eq('supplier_id', ID)
    .eq('status', 'active')
    .is('effective_until', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function gates() {
  const { data, error } = await admin
    .from('commercial_runtime_config')
    .select('key, value_int')
    .in('key', ['payout_execution_enabled', 'stripe_connect_transfers_enabled']);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((item) => [item.key, item.value_int]));
}

const original = await profile();
const agreement = await terms();
const gatesBefore = await gates();
const checks = [];
function note(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail: detail ?? '' });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
}

const standardBps = agreement?.commission_bps;
const quoteReady = Number.isInteger(standardBps) && standardBps >= 0 && standardBps <= 9700;
const monthlyLabel = quoteReady ? bpsLabel(standardBps) : '';
const twiceLabel = quoteReady ? bpsLabel(standardBps + 300) : '';

const browser = await chromium.launch({ headless: true });
try {
  async function openSettings(page) {
    await page.goto(`${ORIGIN}/partner/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(
      ({ key, session }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            expires_in: session.expires_in,
            token_type: session.token_type ?? 'bearer',
            user: session.user,
          }),
        );
      },
      { key: `sb-${PROJECT}-auth-token`, session },
    );
    await page.goto(`${ORIGIN}/partner/money?tab=settings`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByRole('radio', { name: /Monthly/ }).waitFor({ timeout: 25000 });
    await page
      .locator('[data-frequency="monthly"]')
      .getByText(/Standard commission|Commission rate unavailable|Loading commission rate/)
      .waitFor({ timeout: 20000 });
    await page.getByText('Loading commission rate').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openSettings(mobile);
  note('mobile shows both frequency cards', (await mobile.locator('[data-frequency]').count()) === 2);
  await mobile.close();

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openSettings(page);
  const monthly = page.locator('[data-frequency="monthly"]');
  const twice = page.locator('[data-frequency="biweekly"]');
  if (quoteReady) {
    const monthlyText = await monthly.innerText();
    const twiceText = await twice.innerText();
    note('monthly shows the agreement rate and no extra fee', monthlyText.includes(`Standard commission ${monthlyLabel}`) && monthlyText.includes('No additional fee') && monthlyText.includes(`Total ${monthlyLabel}`), monthlyText.replace(/\s+/g, ' ').slice(0, 180));
    note('twice a month adds 3 points to that rate', twiceText.includes(`Standard commission ${monthlyLabel}`) && twiceText.includes('Additional fee 3%') && twiceText.includes(`Total ${twiceLabel}`), twiceText.replace(/\s+/g, ' ').slice(0, 180));
    note('cards do not invent a catalog rate', !monthlyText.includes('catalog'), '');
  } else {
    note('missing agreement shows unavailable instead of a percentage', (await page.getByText('Commission rate unavailable').count()) === 2, '');
  }

  const next = original.payment_cycle === 'biweekly' ? 'monthly' : 'biweekly';
  const nextName = next === 'biweekly' ? /Twice a month/ : /Monthly/;
  await page.getByRole('radio', { name: nextName }).check();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.locator('.partner-toast--success').filter({ hasText: 'Payout settings saved' }).waitFor({ timeout: 20000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('radio', { name: nextName }).waitFor({ timeout: 25000 });
  note('saved frequency stays selected', await page.getByRole('radio', { name: nextName }).isChecked(), next);
  const stored = await profile();
  note('saved frequency is stored', stored.payment_cycle === next, stored.payment_cycle ?? 'empty');
  note('minimum payout was not changed', stored.payout_threshold_min === original.payout_threshold_min, '');
  const termsAfterSave = await terms();
  note(
    'agreement commission was not rewritten',
    termsAfterSave?.commission_bps === agreement?.commission_bps && termsAfterSave?.payout_cadence === agreement?.payout_cadence,
    '',
  );
} finally {
  const restore = await admin
    .from('supplier_profiles')
    .update({ payment_cycle: original.payment_cycle, payout_threshold_min: original.payout_threshold_min })
    .eq('id', ID)
    .select('payment_cycle, payout_threshold_min, stripe_connected_account_id, payout_iban, verification_status')
    .single();
  const after = restore.data;
  const gatesAfter = await gates();
  note(
    'original frequency restored',
    !restore.error && after?.payment_cycle === original.payment_cycle && after?.payout_threshold_min === original.payout_threshold_min,
    after?.payment_cycle ?? 'empty',
  );
  note(
    'account and verification unchanged',
    after?.stripe_connected_account_id === original.stripe_connected_account_id &&
      after?.payout_iban === original.payout_iban &&
      after?.verification_status === original.verification_status,
    '',
  );
  note('payout gates unchanged', JSON.stringify(gatesBefore) === JSON.stringify(gatesAfter), JSON.stringify(gatesAfter));
  await browser.close();
}

const failed = checks.filter((item) => !item.ok);
writeFileSync(
  resolve('scripts/cert-p938-payout-frequency.json'),
  JSON.stringify(
    {
      origin: ORIGIN,
      agreement_bps_present: quoteReady,
      passed: checks.length - failed.length,
      failed: failed.length,
      checks,
    },
    null,
    2,
  ),
);
if (failed.length) process.exit(1);
console.log(`RESULT ${checks.length}/${checks.length} PASS`);
