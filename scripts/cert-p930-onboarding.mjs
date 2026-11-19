/**
 * P9.30 — Onboarding resume and status certification.
 * Does not submit identity, accept terms, or attach a bank account.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const EMAIL = 'contact@royalnordic.fi';
const ID = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';
const ACCOUNT = 'acct_1UdHT6C7oDQnLYSF';
const PARTNER = 'https://partner.traverion.com';
const OUT = resolve('scripts/p930-screenshots');
mkdirSync(OUT, { recursive: true });

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
const verified = await pub.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: 'magiclink',
});
if (verified.error || !verified.data.session) throw new Error(verified.error?.message ?? 'no session');
const session = verified.data.session;
const uid = session.user.id;

async function row() {
  const { data, error } = await admin
    .from('supplier_profiles')
    .select('verification_status, stripe_connected_account_id, connect_details_submitted, connect_payouts_enabled, payout_iban, setup_progress, connect_requirements_currently_due')
    .eq('id', ID)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function gates() {
  const { data, error } = await admin
    .from('commercial_runtime_config')
    .select('key, value_int')
    .in('key', ['live_custom_onboarding_enabled', 'payout_execution_enabled', 'stripe_connect_transfers_enabled']);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((item) => [item.key, item.value_int]));
}

const before = await row();
const gatesBefore = await gates();
const checks = [];
const actions = [];
function note(name, ok, detail) {
  checks.push({ name, ok, detail: detail ?? '' });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('request', (req) => {
  if (!req.url().includes('connect-supplier-onboarding')) return;
  try {
    const body = req.postDataJSON();
    if (body?.action) actions.push(body.action);
  } catch {
    actions.push('unparsed');
  }
});

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
  localStorage.removeItem(`tv-payout-wizard:v5:${session.user.id}`);
}, { key: `sb-${PROJECT}-auth-token`, session });

await page.goto(`${PARTNER}/partner/onboarding?phase=status&screen=status`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForSelector('[data-onboarding-screen]', { timeout: 30000 });
await page.waitForFunction(
  () => document.querySelector('[data-onboarding-screen]')?.getAttribute('data-onboarding-screen') !== 'loading',
  { timeout: 20000 }
);
await page.waitForTimeout(800);

async function surface() {
  return page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent?.trim() ?? '',
    screen: document.querySelector('[data-onboarding-screen]')?.getAttribute('data-onboarding-screen'),
    primary: [...document.querySelectorAll('button')].map((button) => button.textContent?.trim()).filter(Boolean),
    text: document.body?.innerText ?? '',
  }));
}

let snap = await surface();
note('reopen does not start at company', snap.screen !== 'company' && snap.screen !== 'loading', snap.screen ?? '');
note('resume is an identity step', snap.screen === 'person' || snap.screen === 'dob', snap.screen ?? '');
await page.screenshot({ path: resolve(OUT, 'resume.png') });
const resumed = snap.screen;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => document.querySelector('[data-onboarding-screen]')?.getAttribute('data-onboarding-screen') !== 'loading',
  { timeout: 20000 }
);
await page.waitForTimeout(800);
snap = await surface();
note('refresh keeps the same step', snap.screen === resumed, `${resumed} -> ${snap.screen}`);

await page.getByRole('button', { name: 'Continue' }).dblclick();
await page.waitForTimeout(800);
snap = await surface();
note('continue moves one step without a provider write', snap.screen !== resumed && snap.screen !== 'status', snap.screen ?? '');
const forbidden = actions.filter((action) => /submit_|accept_tos|attach_bank|ensure_account|create_account/.test(action));
note('no identity or bank submission', forbidden.length === 0, actions.join(',') || 'none');

await page.goBack();
await page.waitForTimeout(600);
snap = await surface();
note('browser back returns to the resumed step', snap.screen === resumed, snap.screen ?? '');

await page.goto(`${PARTNER}/partner`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(1500);
const home = await page.evaluate(() => document.body?.innerText ?? '');
note('dashboard does not say Finish setup', !home.includes('Finish setup'), home.includes('Finish setup') ? 'found' : 'absent');
note(
  'dashboard names the outstanding requirement or pending review',
  /Company director|Director|date of birth|Bank account|Verification pending|Action required/i.test(home),
  ''
);
await page.screenshot({ path: resolve(OUT, 'dashboard.png') });

const after = await row();
const gatesAfter = await gates();
note('verification unchanged', before.verification_status === after.verification_status && after.verification_status === 'verified', after.verification_status);
note('live account unchanged', after.stripe_connected_account_id === ACCOUNT && after.stripe_connected_account_id === before.stripe_connected_account_id, after.stripe_connected_account_id);
note('bank field unchanged', after.payout_iban == null && before.payout_iban == null, 'empty');
note('payouts stay disabled', after.connect_payouts_enabled === false && after.connect_details_submitted === false, '');
note('gates unchanged', JSON.stringify(gatesBefore) === JSON.stringify(gatesAfter), JSON.stringify(gatesAfter));
note('session user matches supplier', uid === ID, uid);

await browser.close();
const failed = checks.filter((item) => !item.ok);
writeFileSync(resolve('scripts/cert-p930-onboarding.json'), JSON.stringify({ checks, actions, failed: failed.length }, null, 2));
if (failed.length) process.exit(1);
