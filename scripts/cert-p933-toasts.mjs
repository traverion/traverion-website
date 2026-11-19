/**
 * P9.33 — Shared partner toasts.
 * Saves a privacy-policy marker, then restores the original text.
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
const MARK = '\n\nToast check.';

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

async function texts() {
  const { data, error } = await admin
    .from('supplier_profiles')
    .select('privacy_policy_text, terms_conditions_text')
    .eq('id', ID)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

const original = await texts();
const checks = [];
function note(name, ok, detail) {
  checks.push({ name, ok, detail: detail ?? '' });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
}

async function signIn(page) {
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
}

async function openLegal(page) {
  await page.goto(`${PARTNER}/partner/settings#legal`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('text=Policies for travelers', { timeout: 25000 });
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  await signIn(page);
  await openLegal(page);
  await page.getByRole('button', { name: 'Edit' }).nth(0).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 10000 });
  const box = dialog.locator('textarea');
  const before = await box.inputValue();
  await box.fill(`${before}${MARK}`);
  let patches = 0;
  const onReq = (req) => {
    if (req.method() === 'PATCH' && req.url().includes('supplier_profiles')) patches += 1;
  };
  page.on('request', onReq);
  await dialog.getByRole('button', { name: 'Save changes' }).dblclick();
  const success = page.locator('.partner-toast--success').filter({ hasText: 'Privacy policy saved' });
  await success.waitFor({ timeout: 20000 });
  page.off('request', onReq);
  note('success toast after save', true, 'Privacy policy saved');
  note('duplicate click sends one save', patches === 1, String(patches));
  note('duplicate message is a single toast', (await success.count()) === 1, String(await success.count()));
  const place = await page.locator('.partner-toast-viewport').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { gap: Math.round(window.innerHeight - rect.bottom), width: Math.round(rect.width) };
  });
  note('sits about 28px above the bottom', Math.abs(place.gap - 28) <= 2, String(place.gap));
  await success.hover();
  await page.waitForTimeout(3400);
  note('hover pauses dismissal', await success.isVisible(), '');
  await page.mouse.move(8, 8);
  await page.waitForTimeout(3400);
  note('success leaves after the pause', (await success.count()) === 0, '');

  await openLegal(page);
  await page.getByRole('button', { name: 'Edit' }).nth(1).click();
  const terms = page.getByRole('dialog');
  const termsBox = terms.locator('textarea');
  const termsBefore = await termsBox.inputValue();
  await termsBox.fill(`${termsBefore}${MARK}`);
  await terms.getByRole('button', { name: 'Save changes' }).click();
  const termsToast = page.locator('.partner-toast--success').filter({ hasText: 'Terms & conditions saved' });
  await termsToast.waitFor({ timeout: 20000 });
  await termsToast.evaluate((el) => el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })));
  await page.getByRole('button', { name: 'Edit' }).nth(0).click();
  const again = page.getByRole('dialog');
  const againBox = again.locator('textarea');
  const againBefore = await againBox.inputValue();
  await againBox.fill(againBefore.endsWith('.') ? `${againBefore} ` : `${againBefore}.`);
  await again.getByRole('button', { name: 'Save changes' }).click();
  await page.locator('.partner-toast--success').filter({ hasText: 'Privacy policy saved' }).waitFor({ timeout: 20000 });
  const stacked = await page.locator('.partner-toast').count();
  note('consecutive toasts stack', stacked >= 2, String(stacked));

  await openLegal(page);
  await page.route('**/rest/v1/supplier_profiles**', (route) => {
    if (route.request().method() === 'PATCH') return route.abort('failed');
    return route.continue();
  });
  await page.getByRole('button', { name: 'Edit' }).nth(0).click();
  const failDialog = page.getByRole('dialog');
  await failDialog.locator('textarea').fill(`${before}${MARK} failed`);
  await failDialog.getByRole('button', { name: 'Save changes' }).click();
  const errorToast = page.locator('.partner-toast--error').filter({ hasText: "Couldn't save changes. Try again." });
  await errorToast.waitFor({ timeout: 20000 });
  note('backend failure shows an error toast', true, '');
  note('failed save keeps the editor open', (await failDialog.count()) > 0, '');
  note('failed save does not announce success', (await page.locator('.partner-toast--success').count()) === 0, '');
  const dismiss = errorToast.getByRole('button', { name: 'Dismiss' });
  await dismiss.focus();
  note('dismiss can take keyboard focus', await dismiss.evaluate((el) => el === document.activeElement), '');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  note('keyboard dismiss removes the error', (await errorToast.count()) === 0, '');
  await page.unroute('**/rest/v1/supplier_profiles**');
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await mobile.newPage();
  await signIn(phone);
  await openLegal(phone);
  await phone.getByRole('button', { name: 'Edit' }).nth(0).click();
  const phoneDialog = phone.getByRole('dialog');
  const phoneBox = phoneDialog.locator('textarea');
  const phoneBefore = await phoneBox.inputValue();
  await phoneBox.fill(`${phoneBefore} `);
  await phoneDialog.getByRole('button', { name: 'Save changes' }).click();
  const phoneToast = phone.locator('.partner-toast-viewport');
  await phone.locator('.partner-toast--success').waitFor({ timeout: 20000 });
  const mobileBox = await phoneToast.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      inside: rect.left >= 8 && rect.right <= window.innerWidth - 8,
      width: Math.round(rect.width),
      view: window.innerWidth,
    };
  });
  note('mobile toast stays inside the screen', mobileBox.inside, `${mobileBox.width}/${mobileBox.view}`);
  await mobile.close();

  const quiet = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const still = await quiet.newPage();
  await signIn(still);
  await openLegal(still);
  await still.getByRole('button', { name: 'Edit' }).nth(0).click();
  const stillDialog = still.getByRole('dialog');
  await stillDialog.locator('textarea').press('End');
  await stillDialog.locator('textarea').press(' ');
  await stillDialog.getByRole('button', { name: 'Save changes' }).click();
  const stillToast = still.locator('.partner-toast--success');
  await stillToast.waitFor({ timeout: 20000 });
  const motion = await stillToast.evaluate((el) => getComputedStyle(el).animationName);
  note('reduced motion skips the slide', motion === 'none', motion);
  await quiet.close();
} finally {
  const restore = await admin
    .from('supplier_profiles')
    .update({
      privacy_policy_text: original.privacy_policy_text,
      terms_conditions_text: original.terms_conditions_text,
    })
    .eq('id', ID)
    .select('privacy_policy_text, terms_conditions_text')
    .single();
  const same =
    restore.data?.privacy_policy_text === original.privacy_policy_text &&
    restore.data?.terms_conditions_text === original.terms_conditions_text;
  note('original policies restored', !restore.error && same, restore.error?.message ?? (same ? 'same' : 'mismatch'));
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
const report = {
  at: new Date().toISOString(),
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
};
writeFileSync(resolve('scripts/cert-p933-toasts.json'), JSON.stringify(report, null, 2));
if (failed.length) process.exit(1);
