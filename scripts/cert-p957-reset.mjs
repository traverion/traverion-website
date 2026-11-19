/**
 * P9.57 — Reset entry certification. Does not submit identity or bank details.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const EMAIL = 'contact@royalnordic.fi';
const ID = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';
const ACCOUNT = 'acct_1UdHT6C7oDQnLYSF';
const PARTNER = 'https://partner.traverion.com';
const OUT = resolve('scripts/p957-screenshots');
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
const checks = [];
const actions = [];
function note(name, ok, detail) {
  checks.push({ name, ok });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
}

async function inject(page) {
  await page.goto(`${PARTNER}/partner/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(({ key, session, userId }) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type ?? 'bearer',
      user: session.user,
    }));
    const stale = {
      step: 'review',
      updatedAt: '2020-01-01T00:00:00.000Z',
      rep_first_name: 'Old',
      rep_last_name: 'Draft',
      verification_consent: true,
      rep_is_owner: true,
      wizardCompletedAt: '2020-01-01T00:00:00.000Z',
      representativeSavedAt: '2020-01-01T00:00:00.000Z',
    };
    localStorage.setItem(`tv-payout-wizard:v5:${userId}`, JSON.stringify(stale));
  }, { key: `sb-${PROJECT}-auth-token`, session, userId: uid });
}

async function openReady(page, search) {
  await page.goto(`${PARTNER}/partner/onboarding${search}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('[data-onboarding-screen]', { timeout: 30000 });
  await page.waitForFunction(() => !(document.body?.innerText ?? '').includes('Loading your details'), { timeout: 20000 });
  await page.waitForTimeout(700);
}

async function surface(page) {
  return page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent?.trim() ?? '',
    screen: document.querySelector('[data-onboarding-screen]')?.getAttribute('data-onboarding-screen'),
    primary: document.querySelectorAll('.tv-btn-primary').length,
    url: location.search,
  }));
}

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await desktop.newPage();
const phonePage = await phone.newPage();
for (const p of [page, phonePage]) {
  p.on('request', (req) => {
    if (!req.url().includes('connect-supplier-onboarding')) return;
    try {
      const body = req.postDataJSON();
      if (body?.action) actions.push(body.action);
    } catch {
      actions.push('unparsed');
    }
  });
}

await inject(page);
await inject(phonePage);
await openReady(page, '?phase=status&screen=status');
await openReady(phonePage, '?phase=representative&screen=dob');
let snap = await surface(page);
note('desktop stale status link opens company', snap.screen === 'company' && /confirm your company/i.test(snap.h1), snap.h1);
note('desktop url rewritten to company', snap.url.includes('screen=company'), snap.url);
note('desktop one primary', snap.primary === 1, String(snap.primary));
await page.screenshot({ path: resolve(OUT, 'desktop-company-from-status-link.png') });
snap = await surface(phonePage);
note('phone stale dob link opens company', snap.screen === 'company' && /confirm your company/i.test(snap.h1), snap.h1);
note('phone one primary', snap.primary === 1, String(snap.primary));
await phonePage.screenshot({ path: resolve(OUT, 'mobile-company-from-dob-link.png') });
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(500);
snap = await surface(page);
const afterContinue = snap.h1;
note('desktop continue leaves company', snap.screen !== 'company' && snap.h1.length > 0, `${snap.screen}:${snap.h1}`);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-onboarding-screen]', { timeout: 30000 });
await page.waitForTimeout(900);
snap = await surface(page);
note('desktop refresh resumes continued screen', snap.h1 === afterContinue, snap.h1);
await page.screenshot({ path: resolve(OUT, 'desktop-refresh-resume.png') });
await page.getByRole('button', { name: 'Back' }).click();
await page.waitForTimeout(400);
snap = await surface(page);
note('desktop back returns to company', snap.screen === 'company', snap.h1);

await phonePage.getByRole('button', { name: 'Continue' }).click();
await phonePage.waitForTimeout(400);
await phonePage.getByRole('button', { name: 'Back' }).click();
await phonePage.waitForTimeout(300);
snap = await surface(phonePage);
note('phone back returns to company', snap.screen === 'company', snap.h1);
await browser.close();

const forbidden = actions.filter((a) => /ensure_account|submit_|attach_bank|accept_tos|create_account/.test(a));
note('no live identity or bank submit', forbidden.length === 0, actions.join(',') || 'none');
const { data: after } = await admin.from('supplier_profiles').select('stripe_connected_account_id, verification_status, connect_details_submitted, connect_payouts_enabled, connect_requirements_currently_due').eq('id', ID).single();
note('account unchanged', after.stripe_connected_account_id === ACCOUNT && after.connect_details_submitted === false && after.connect_payouts_enabled === false && after.verification_status === 'verified');
note('requirements still the live set', Array.isArray(after.connect_requirements_currently_due) && after.connect_requirements_currently_due.includes('external_account') && after.connect_requirements_currently_due.includes('directors.first_name'));
const { data: gates } = await admin.from('commercial_runtime_config').select('key, value_int').in('key', ['live_custom_onboarding_enabled', 'payout_execution_enabled', 'stripe_connect_transfers_enabled']);
note('gates stay closed', (gates ?? []).every((g) => g.value_int === 0) && (gates ?? []).length === 3);

const resetAt = new Date().toISOString();
const { error: upErr } = await admin.from('supplier_profiles').update({
  payout_wizard_draft: { version: 1, step: 'business', rep: {}, owners: [], markers: {} },
  payout_wizard_draft_updated_at: resetAt,
  setup_progress: { version: 1, phase: 'business' },
  setup_progress_updated_at: resetAt,
}).eq('id', ID);
note('draft returned to company reset', !upErr, upErr?.message ?? resetAt);
const failed = checks.filter((c) => !c.ok);
console.log('VERDICT', failed.length ? 'FAIL' : 'PASS', `${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
