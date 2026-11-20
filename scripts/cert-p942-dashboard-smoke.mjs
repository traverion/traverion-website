/**
 * Read-only partner page smoke after the API recovery.
 * Does not save settings, submit verification, or move money.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROJECT = 'xcopqllkulxfkpunetbc';
const EMAIL = 'contact@royalnordic.fi';
const PARTNER = 'https://partner.traverion.com';
const PAGES = [
  ['/partner', 'Home'],
  ['/partner/calendar', 'Calendar'],
  ['/partner/bookings', 'Bookings'],
  ['/partner/listings', 'Listings'],
  ['/partner/inbox', 'Inbox'],
  ['/partner/earnings', 'Income'],
  ['/partner/performance', 'Analytics'],
  ['/partner/business-profile', 'Business settings'],
  ['/partner/account-settings', 'Account settings'],
];

const raw = execFileSync('/opt/homebrew/bin/supabase', ['projects', 'api-keys', '--project-ref', PROJECT, '-o', 'json'], { encoding: 'utf8' });
const keys = JSON.parse(raw.slice(raw.indexOf('[')));
const anon = keys.find((k) => k.name === 'anon').api_key;
const service = keys.find((k) => k.name === 'service_role').api_key;
const admin = createClient(`https://${PROJECT}.supabase.co`, service, { auth: { persistSession: false } });
const pub = createClient(`https://${PROJECT}.supabase.co`, anon, { auth: { persistSession: false } });
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
if (link.error || !link.data?.properties?.hashed_token) throw new Error(link.error?.message ?? 'no link');
const verified = await pub.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
if (verified.error || !verified.data.session) throw new Error(verified.error?.message ?? 'no session');
const session = verified.data.session;

const checks = [];
const note = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};

const browser = await chromium.launch({ headless: true });
try {
  for (const [width, label] of [[1440, 'desktop'], [390, 'mobile']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message.slice(0, 140)));
    await page.goto(`${PARTNER}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `sb-${PROJECT}-auth-token`,
      value: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type ?? 'bearer',
        user: session.user,
      },
    });
    for (const [path, title] of PAGES) {
      const response = await page.goto(`${PARTNER}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('h1, h2').first().waitFor({ timeout: 20000 }).catch(() => undefined);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      const text = await page.locator('body').innerText();
      const onLogin = page.url().includes('/login');
      note(`${label} ${title} renders`, Boolean(response && response.status() < 400) && !onLogin && text.trim().length > 40 && !overflow, `status ${response?.status()} chars ${text.trim().length} overflow ${overflow}`);
    }
    note(`${label} console`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${PARTNER}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${PROJECT}-auth-token`,
    value: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type ?? 'bearer',
      user: session.user,
    },
  });
  await page.goto(`${PARTNER}/partner/earnings`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);
  const income = await page.locator('body').innerText();
  note('income does not say payouts operational', !/Payouts operational/.test(income) || /Payouts not operational/.test(income), '');
  note('income keeps the closed-gate sentence or not-operational headline', /Payouts not operational|Payouts are not available yet/.test(income), '');
  await page.goto(`${PARTNER}/partner/onboarding`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);
  note('verified supplier leaves onboarding', !page.url().includes('/onboarding'), page.url());
  await context.close();
} finally {
  await browser.close();
}

const failed = checks.filter((check) => !check.ok);
const report = { at: new Date().toISOString(), passed: checks.length - failed.length, total: checks.length, checks };
writeFileSync('scripts/cert-p942-dashboard-smoke.json', JSON.stringify(report, null, 2));
if (failed.length) process.exit(1);
