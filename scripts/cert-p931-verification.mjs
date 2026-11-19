/**
 * P9.31 — The live supplier sees one verification status on every page.
 * Does not change verification, bank details, or payout gates.
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
const ACCOUNT = 'acct_1UdHT6C7oDQnLYSF';
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
    .select('verification_status, stripe_connected_account_id, connect_payouts_enabled, connect_details_submitted, payout_iban')
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
function note(name, ok, detail) {
  checks.push({ name, ok, detail: detail ?? '' });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const actions = [];
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
}, { key: `sb-${PROJECT}-auth-token`, session });

async function readStatus(path) {
  await page.goto(`${PARTNER}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('[data-verification-status]', { timeout: 25000 });
  return page.evaluate(() => {
    const node = document.querySelector('[data-verification-status]');
    return {
      status: node?.getAttribute('data-verification-status') ?? '',
      text: node?.innerText ?? '',
      page: document.body?.innerText ?? '',
    };
  });
}

const pages = [
  ['/partner', 'home'],
  ['/partner/verification', 'verification'],
  ['/partner/settings', 'business settings'],
  ['/partner/money?tab=settings', 'income'],
];
const seen = [];
for (const [path, name] of pages) {
  const snap = await readStatus(path);
  seen.push(snap.status);
  note(`${name} shows one status`, snap.status === 'verified', snap.status);
  note(`${name} uses the verified explanation`, snap.text.includes('Your business is verified and your payout account is approved.'), '');
  note(`${name} does not say Incomplete`, !snap.text.includes('Incomplete'), '');
}
note('all four pages match', seen.every((status) => status === seen[0]), seen.join(','));
const income = await readStatus('/partner/money?tab=settings');
note('income does not promise active payouts', income.text.includes('Payouts are not being sent yet.'), '');
const forbidden = actions.filter((action) => /submit_|accept_tos|attach_bank|ensure_account|create_account/.test(action));
note('no verification or bank submission', forbidden.length === 0, actions.join(',') || 'none');

const after = await row();
const gatesAfter = await gates();
note('verification unchanged', after.verification_status === before.verification_status, after.verification_status);
note('account unchanged', after.stripe_connected_account_id === ACCOUNT, 'same');
note('payout flags unchanged', after.connect_payouts_enabled === before.connect_payouts_enabled && after.connect_details_submitted === before.connect_details_submitted, '');
note('bank unchanged', after.payout_iban === before.payout_iban, 'same');
note('gates unchanged', JSON.stringify(gatesBefore) === JSON.stringify(gatesAfter), JSON.stringify(gatesAfter));

await browser.close();
writeFileSync(resolve('scripts/cert-p931-verification.json'), JSON.stringify({ checks, actions, failed: checks.filter((item) => !item.ok).length }, null, 2));
if (checks.some((item) => !item.ok)) process.exit(1);
