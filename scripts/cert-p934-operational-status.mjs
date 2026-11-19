/**
 * P9.34 — Operational indicators on the live verified account.
 * Reads gates and profile flags. Does not write them.
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

const { data: profile, error: profileError } = await admin
  .from('supplier_profiles')
  .select(
    'verification_status, payout_verification_status, payout_iban, payout_bic, stripe_connected_account_id, connect_payouts_enabled, connect_details_submitted, connect_onboarding_status'
  )
  .eq('id', ID)
  .single();
if (profileError) throw new Error(profileError.message);
const { data: gates, error: gateError } = await admin
  .from('commercial_runtime_config')
  .select('key, value_int')
  .in('key', ['payout_execution_enabled', 'stripe_connect_transfers_enabled', 'live_custom_onboarding_enabled']);
if (gateError) throw new Error(gateError.message);

const checks = [];
function note(name, ok, detail) {
  checks.push({ name, ok, detail: detail ?? '' });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
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
  await page.locator('[data-ops="account"]').waitFor({ timeout: 25000 });
  const accountOn = await page.locator('[data-ops="account"]').getAttribute('data-ops-on');
  const payoutOn = await page.locator('[data-ops="payouts"]').getAttribute('data-ops-on');
  const payoutKind = await page.locator('[data-ops="payouts"]').getAttribute('data-ops-kind');
  note('home account operational', accountOn === '1', accountOn ?? '');
  note('home payouts not operational while gates are closed', payoutOn === '0' && payoutKind === 'closed', `${payoutOn}/${payoutKind}`);
  note('home does not offer an action button', (await page.locator('.partner-ops button').count()) === 0, '');
  note('home has no verification page link', (await page.getByRole('button', { name: 'View verification' }).count()) === 0, '');
  const box = await page.locator('.partner-ops').boundingBox();
  const metrics = await page.locator('.partner-home__metrics').boundingBox();
  note('status sits below the KPI cards', Boolean(box && metrics && box.y > metrics.y), '');

  await page.goto(`${PARTNER}/partner/settings`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('[data-verification-status="verified"]').waitFor({ timeout: 25000 });
  const settingsText = await page.locator('body').innerText();
  note('business settings shows one verified status', settingsText.includes('Verified'), '');
  note('business settings bank is connected', settingsText.includes('Connected'), '');
  note('business settings does not say payouts are incomplete', !/Payouts[\s\S]{0,180}Incomplete/.test(settingsText), '');
  note('business settings does not say the bank account is missing', !settingsText.includes('bank account missing') && !settingsText.includes('No bank account'), '');

  await page.goto(`${PARTNER}/partner/money`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('[data-payouts-operational="0"]').first().waitFor({ timeout: 25000 });
  note('income overview matches payouts not operational', true, '');
  await page.goto(`${PARTNER}/partner/money?tab=settings`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByText('Payouts not operational').waitFor({ timeout: 25000 });
  const incomeText = await page.locator('#income-payout-settings').innerText();
  note('income settings drops the verification card', !incomeText.includes('Nothing else is needed for verification'), '');
  note('income settings does not claim a missing bank', !incomeText.includes('No bank account linked'), '');

  await page.goto(`${PARTNER}/partner/verification`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForURL(/\/partner\/settings/, { timeout: 20000 });
  note('verification route opens business settings', page.url().includes('/settings'), page.url().replace(PARTNER, ''));

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await phone.newPage();
  await mobile.goto(`${PARTNER}/partner/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await mobile.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type ?? 'bearer',
      user: session.user,
    }));
  }, { key: `sb-${PROJECT}-auth-token`, session });
  await mobile.goto(`${PARTNER}/partner`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await mobile.locator('.partner-ops').waitFor({ timeout: 25000 });
  const fit = await mobile.locator('.partner-ops').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth + 1;
  });
  note('status fits a phone width', fit, '');
  await phone.close();

  const quiet = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const still = await quiet.newPage();
  await still.goto(`${PARTNER}/partner/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await still.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type ?? 'bearer',
      user: session.user,
    }));
  }, { key: `sb-${PROJECT}-auth-token`, session });
  await still.goto(`${PARTNER}/partner`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await still.locator('.partner-ops__dot').first().waitFor({ timeout: 25000 });
  const motion = await still.locator('.partner-ops__dot').first().evaluate((el) => getComputedStyle(el).animationName);
  note('reduced motion skips the pulse', motion === 'none', motion);
  await quiet.close();
} finally {
  await browser.close();
}

const gateMap = Object.fromEntries((gates ?? []).map((row) => [row.key, row.value_int]));
const report = {
  at: new Date().toISOString(),
  rootCause: {
    verification_status: profile.verification_status,
    payout_verification_status: profile.payout_verification_status,
    legacy_iban_present: Boolean((profile.payout_iban ?? '').trim()),
    legacy_bic_present: Boolean((profile.payout_bic ?? '').trim()),
    connect_account_present: Boolean(profile.stripe_connected_account_id),
    connect_payouts_enabled: profile.connect_payouts_enabled,
    connect_details_submitted: profile.connect_details_submitted,
    connect_onboarding_status: profile.connect_onboarding_status,
    gates: gateMap,
  },
  passed: checks.filter((c) => c.ok).length,
  failed: checks.filter((c) => !c.ok).length,
  checks,
};
writeFileSync(resolve('scripts/cert-p934-operational-status.json'), JSON.stringify(report, null, 2));
if (report.failed) process.exit(1);
