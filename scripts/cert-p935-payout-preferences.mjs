/**
 * P9.35 — Payout preferences on the live verified account.
 * Changes frequency, confirms it persisted, then restores the original values.
 * Does not touch the connected account, bank fields, verification, or gates.
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
const PARTNER = 'https://partner.traverion.com';

function apiKeys() {
  const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT}`, { encoding: 'utf8' });
  const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
  const keys = parsed.keys || parsed;
  return {
    anon: keys.find((k) => k.name === 'anon' || k.id === 'anon')?.api_key,
    service: keys.find((k) => k.name === 'service_role' || k.id === 'service_role')?.api_key,
  };
}

const { anon, service } = apiKeys();
const admin = createClient(BASE, service, { auth: { persistSession: false, autoRefreshToken: false } });
const pub = createClient(BASE, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
if (link.error) throw new Error(link.error.message);
const verified = await pub.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
if (verified.error || !verified.data.session) throw new Error(verified.error?.message ?? 'no session');
const session = verified.data.session;

async function row() {
  const { data, error } = await admin
    .from('supplier_profiles')
    .select('payment_cycle, payout_threshold_min, stripe_connected_account_id, payout_iban, verification_status, connect_payouts_enabled')
    .eq('id', ID)
    .single();
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

const original = await row();
const gatesBefore = await gates();
const checks = [];
function note(name, ok, detail) {
  checks.push({ name, ok, detail: detail ?? '' });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${PARTNER}/partner/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type ?? 'bearer',
      user: session.user,
    }));
  }, { key: `sb-${PROJECT}-auth-token`, session });

  await page.goto(`${PARTNER}/partner`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText('Your payout account is approved. Payouts are not available yet.').waitFor({ timeout: 25000 });
  note('home explains that payouts are not available yet', true, '');
  note('home has no take-action button', (await page.getByRole('button', { name: 'Take action' }).count()) === 0, '');

  await page.goto(`${PARTNER}/partner/money?tab=settings`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByRole('radio', { name: 'Monthly' }).waitFor({ timeout: 25000 });
  const settingsText = await page.locator('#income-payout-settings').innerText();
  note('settings has no payout wizard', !settingsText.includes('Set up payouts'), '');
  note('bank status stays visible', settingsText.includes('Connected'), '');

  const nextCycle = original.payment_cycle === 'biweekly' ? 'monthly' : 'biweekly';
  const nextLabel = nextCycle === 'biweekly' ? 'Twice a month' : 'Monthly';
  await page.getByRole('radio', { name: nextLabel }).check();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.locator('.partner-toast--success').filter({ hasText: 'Payout settings saved' }).waitFor({ timeout: 20000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('radio', { name: nextLabel }).waitFor({ timeout: 25000 });
  note('saved frequency stays selected', await page.getByRole('radio', { name: nextLabel }).isChecked(), nextCycle);
  const stored = await row();
  note('saved frequency is stored', stored.payment_cycle === nextCycle, stored.payment_cycle ?? 'empty');

  await page.goto(`${PARTNER}/partner/onboarding`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForURL((url) => !url.pathname.includes('/onboarding'), { timeout: 20000 });
  note('verified supplier leaves onboarding', !page.url().includes('/onboarding'), page.url().replace(PARTNER, ''));
} finally {
  const restore = await admin
    .from('supplier_profiles')
    .update({
      payment_cycle: original.payment_cycle,
      payout_threshold_min: original.payout_threshold_min,
    })
    .eq('id', ID)
    .select('payment_cycle, payout_threshold_min, stripe_connected_account_id, payout_iban, verification_status')
    .single();
  const after = restore.data;
  const gatesAfter = await gates();
  const samePrefs =
    after?.payment_cycle === original.payment_cycle &&
    after?.payout_threshold_min === original.payout_threshold_min;
  const sameAccount =
    after?.stripe_connected_account_id === original.stripe_connected_account_id &&
    after?.payout_iban === original.payout_iban &&
    after?.verification_status === original.verification_status;
  const sameGates = JSON.stringify(gatesBefore) === JSON.stringify(gatesAfter);
  note('original payout preferences restored', !restore.error && samePrefs, samePrefs ? 'same' : 'mismatch');
  note('connected account and verification unchanged', sameAccount, '');
  note('payout gates unchanged', sameGates, JSON.stringify(gatesAfter));
  await browser.close();
}

const report = {
  at: new Date().toISOString(),
  passed: checks.filter((c) => c.ok).length,
  failed: checks.filter((c) => !c.ok).length,
  checks,
};
writeFileSync(resolve('scripts/cert-p935-payout-preferences.json'), JSON.stringify(report, null, 2));
if (report.failed) process.exit(1);
