/**
 * P9.32 — Policy modal save. Restores the original policy text before exit.
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
const MARK = '\n\nSaved check.';

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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
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

  async function openLegal() {
    await page.goto(`${PARTNER}/partner/settings#legal`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('text=Policies for travelers', { timeout: 25000 });
  }

  async function editAndSave(title, editIndex, toast, marker) {
    await openLegal();
    await page.getByRole('button', { name: 'Edit' }).nth(editIndex).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 10000 });
    const box = dialog.locator('textarea');
    const before = await box.inputValue();
    await box.fill(`${before}${marker}`);
    const patches = [];
    const onReq = (req) => {
      if (req.method() === 'PATCH' && req.url().includes('supplier_profiles')) patches.push(1);
    };
    page.on('request', onReq);
    const save = dialog.getByRole('button', { name: 'Save changes' });
    await save.dblclick();
    await page.getByRole('status').filter({ hasText: toast }).waitFor({ timeout: 20000 });
    page.off('request', onReq);
    note(`${title} toast`, true, toast);
    note(`${title} modal closes`, (await dialog.count()) === 0, '');
    const status = await page.getByText(title, { exact: true }).locator('xpath=..').innerText();
    note(`${title} page status updates`, status.includes('Saved'), status.split('\n')[1] ?? '');
    note(`${title} ignores a second click`, patches.length === 1, String(patches.length));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Policies for travelers', { timeout: 25000 });
    const afterReload = await page.getByText(title, { exact: true }).locator('xpath=ancestor::div[1]').innerText();
    const digits = (afterReload.match(/Saved · ([^c]+) characters/)?.[1] ?? '').replace(/\D/g, '');
    note(`${title} persists after refresh`, digits === String((before + marker).trim().length), digits || 'missing');
  }

  await editAndSave('Privacy Policy', 0, 'Privacy policy saved', MARK);
  await editAndSave('Terms & Conditions', 1, 'Terms & conditions saved', MARK);

  await openLegal();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('textarea').fill('This should not be saved.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Discard' }).click();
  note('cancel closes without saving', (await dialog.count()) === 0, '');
  const stored = await texts();
  note('cancel leaves stored privacy unchanged', (stored.privacy_policy_text ?? '').includes(MARK.trim()), '');
} finally {
  const restore = await admin
    .from('supplier_profiles')
    .update({
      privacy_policy_text: original.privacy_policy_text,
      terms_conditions_text: original.terms_conditions_text,
    })
    .eq('id', ID);
  if (restore.error) console.log('RESTORE FAIL', restore.error.message);
  const after = await texts();
  const restored =
    after.privacy_policy_text === original.privacy_policy_text &&
    after.terms_conditions_text === original.terms_conditions_text;
  note('original policies restored', restored, restored ? 'same' : 'mismatch');
  await browser.close();
}

writeFileSync(resolve('scripts/cert-p932-policy-save.json'), JSON.stringify({ checks, failed: checks.filter((item) => !item.ok).length }, null, 2));
if (checks.some((item) => !item.ok)) process.exit(1);
