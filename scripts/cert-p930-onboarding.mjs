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

async function ready() {
  await page.waitForFunction(() => {
    const screen = document.querySelector('[data-onboarding-screen]')?.getAttribute('data-onboarding-screen');
    return Boolean(screen && screen !== 'loading');
  }, { timeout: 25000 });
  await page.waitForTimeout(500);
}

await ready();
let snap = await surface();
const openRequirements = (before.connect_requirements_currently_due ?? []).length;
note('reopen does not start at company', snap.screen !== 'company', snap.screen ?? '');
note(
  'resume matches the server requirements',
  openRequirements === 0 ? snap.screen === 'status' : snap.screen === 'person' || snap.screen === 'dob' || snap.screen === 'bank' || snap.screen === 'terms',
  snap.screen ?? ''
);
note(
  'status names the real outcome',
  snap.screen !== 'status' || (before.connect_payouts_enabled ? /verified/i.test(snap.h1) : /verification pending|action required/i.test(snap.h1)),
  snap.h1
);
await page.screenshot({ path: resolve(OUT, 'resume.png') });
const resumed = snap.screen;
await page.reload({ waitUntil: 'domcontentloaded' });
await ready();
snap = await surface();
note('refresh keeps the same step', snap.screen === resumed, `${resumed} -> ${snap.screen}`);

if (snap.screen === 'status') {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200);
  const path = await page.evaluate(() => location.pathname);
  note('done returns to the dashboard', path === '/partner' || path === '/partner/', path);
} else {
  await page.getByRole('button', { name: 'Continue' }).dblclick();
  await page.waitForTimeout(800);
  snap = await surface();
  note('duplicate continue does not skip to status', snap.screen !== 'status', snap.screen ?? '');
  await page.goBack();
  await page.waitForTimeout(600);
  snap = await surface();
  note('browser back returns to the resumed step', snap.screen === resumed, snap.screen ?? '');
}

const forbidden = actions.filter((action) => /submit_|accept_tos|attach_bank|ensure_account|create_account/.test(action));
note('no identity, terms, or bank submission', forbidden.length === 0, actions.join(',') || 'none');

await page.goto(`${PARTNER}/partner`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(1500);
const home = await page.evaluate(() => document.body?.innerText ?? '');
const expectsSetup = openRequirements > 0 || !before.connect_payouts_enabled;
note('dashboard does not say Finish setup', !home.includes('Finish setup'), home.includes('Finish setup') ? 'found' : 'absent');
note(
  'dashboard copy matches the server state',
  expectsSetup ? /Verification pending|Action required|Director|Bank account|date of birth/i.test(home) : !/Finish setup|Action required/i.test(home),
  expectsSetup ? 'outstanding' : 'clear'
);
await page.screenshot({ path: resolve(OUT, 'dashboard.png') });

const after = await row();
const gatesAfter = await gates();
note('verification unchanged', after.verification_status === before.verification_status, after.verification_status);
note('live account unchanged', after.stripe_connected_account_id === ACCOUNT && after.stripe_connected_account_id === before.stripe_connected_account_id, 'same');
note('bank field unchanged', after.payout_iban === before.payout_iban, 'same');
note('payout flags unchanged', after.connect_payouts_enabled === before.connect_payouts_enabled && after.connect_details_submitted === before.connect_details_submitted, '');
note('gates unchanged', JSON.stringify(gatesBefore) === JSON.stringify(gatesAfter), JSON.stringify(gatesAfter));
note('session user matches supplier', uid === ID, uid);

await browser.close();
const failed = checks.filter((item) => !item.ok);
writeFileSync(resolve('scripts/cert-p930-onboarding.json'), JSON.stringify({ checks, actions, failed: failed.length }, null, 2));
if (failed.length) process.exit(1);
