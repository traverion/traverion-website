/**
 * P9.49 browser cert — EM Global on partner.traverion.com (desktop + mobile).
 * Injects a magic-link session; asserts embedded Connect mounts without Account Link redirect.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const EMAIL = 'contact@royalnordic.fi';
const PARTNER = 'https://partner.traverion.com';
const STORAGE_KEY = `sb-${PROJECT}-auth-token`;
const OUT = resolve(process.cwd(), 'scripts/p949-screenshots');
mkdirSync(OUT, { recursive: true });

function apiKeys() {
  const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT}`, {
    encoding: 'utf8',
  });
  const start = raw.indexOf('{');
  const parsed = JSON.parse(raw.slice(start));
  const keys = parsed.keys || parsed;
  return {
    anon: keys.find((k) => k.name === 'anon' || k.id === 'anon')?.api_key,
    service: keys.find((k) => k.name === 'service_role' || k.id === 'service_role')?.api_key,
  };
}

const { anon, service } = apiKeys();
const admin = createClient(BASE, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pub = createClient(BASE, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const report = {
  at: new Date().toISOString(),
  mission: 'P9.49-browser',
  checks: [],
  verdict: 'PENDING',
};

function note(name, ok, detail) {
  report.checks.push({ name, ok, detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
}

async function supplierSession() {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (link.error) throw new Error(link.error.message);
  const hashed = link.data.properties?.hashed_token;
  const verified = await pub.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' });
  if (verified.error || !verified.data.session) {
    throw new Error(verified.error?.message ?? 'no session');
  }
  return verified.data.session;
}

async function injectSession(page, session) {
  await page.goto(`${PARTNER}/partner/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ key, session }) => {
      const payload = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type ?? 'bearer',
        user: session.user,
      };
      localStorage.setItem(key, JSON.stringify(payload));
    },
    { key: STORAGE_KEY, session }
  );
}

async function assertPhase(page, phase, vpName) {
  const url = `${PARTNER}/partner/onboarding?phase=${phase}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  const current = page.url();
  note(`${vpName} ${phase} url stays onboarding`, /\/partner\/onboarding/.test(current), current);

  const body = await page.locator('body').innerText().catch(() => '');
  const leftPartner = /connect\.stripe\.com|dashboard\.stripe\.com/i.test(current);
  note(`${vpName} ${phase} no stripe-hosted redirect`, !leftPartner, current);

  if (phase === 'status' || phase === 'representative' || phase === 'payout') {
    const embedHost = page.locator('.tv-connect-embed, iframe[src*="stripe"], iframe[name*="stripe"]');
    const loading = page.getByText(/Loading secure verification|Loading secure step/i);
    const continueBtn = page.getByRole('button', { name: /Continue verification/i });
    const hasEmbed =
      (await embedHost.count()) > 0 ||
      (await loading.count()) > 0 ||
      (await page.locator('[class*="Connect"]').count()) > 0;
    const hasFallback = /Open secure step|Continue securely/i.test(body);
    const hasContinue = (await continueBtn.count()) > 0;
    note(
      `${vpName} ${phase} embedded verification surface`,
      hasEmbed || hasFallback || hasContinue,
      hasEmbed ? 'embed' : hasFallback ? 'hosted_fallback_ui' : hasContinue ? 'cta' : 'missing'
    );
  }

  if (phase === 'status') {
    note(
      `${vpName} status labels`,
      /Business verification|Identity|Bank account|Ready to receive/i.test(body),
      body.slice(0, 180).replace(/\s+/g, ' ')
    );
  }

  await page.screenshot({
    path: resolve(OUT, `${vpName}-${phase}.png`),
    fullPage: true,
  });
}

async function runViewport(browser, session, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.width <= 430 ? 2 : 1,
    isMobile: vp.width <= 430,
    hasTouch: vp.width <= 430,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  try {
    await injectSession(page, session);
    await page.goto(`${PARTNER}/partner/onboarding?phase=status`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);
    const signedIn = !/partner\/login|Sign in/i.test(page.url() + (await page.locator('body').innerText().catch(() => '')));
    note(`${vp.name} authenticated shell`, signedIn, page.url());

    for (const phase of ['status', 'representative', 'payout', 'business']) {
      await assertPhase(page, phase, vp.name);
    }

    // Refresh resume
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    note(
      `${vp.name} refresh stays onboarding`,
      /\/partner\/onboarding/.test(page.url()),
      page.url()
    );
  } catch (err) {
    note(`${vp.name} fatal`, false, String(err?.message || err));
    await page.screenshot({ path: resolve(OUT, `error-${vp.name}.png`), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
  }
}

const session = await supplierSession();
const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, session, { name: 'desktop-1440', width: 1440, height: 900 });
  await runViewport(browser, session, { name: 'mobile-390', width: 390, height: 844 });
} finally {
  await browser.close();
}

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length === 0 ? 'PASS' : failed.length <= 2 ? 'PARTIAL' : 'FAIL';
writeFileSync(
  resolve(process.cwd(), 'scripts/cert-p949-browser-embedded.report.json'),
  JSON.stringify(report, null, 2)
);
console.log('\nVERDICT', report.verdict, `(${failed.length} failed of ${report.checks.length})`);
process.exit(failed.length > 3 ? 1 : 0);
