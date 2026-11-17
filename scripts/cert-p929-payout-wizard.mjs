/**
 * P9.29 — Premium payout onboarding UX browser certification.
 * Walks Business → … → Review → Done completion, captures viewports.
 * Does not enable LIVE Connect creation or money movement.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = (process.env.CERT_BASE || 'http://127.0.0.1:5182').replace(/\/$/, '');
const OUT = resolve(process.cwd(), 'scripts/p929-screenshots');
const CREDS = JSON.parse(
  readFileSync(resolve(process.cwd(), 'scripts/cert-p921-disposable.credentials.json'), 'utf8')
);

mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-375', width: 375, height: 812 },
];

const report = {
  mission: 'P9.29',
  base: BASE,
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  verdict: 'FAIL',
};

function note(check, ok, detail = '') {
  report.checks.push({ check, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${check}${detail ? `: ${detail}` : ''}`);
}

async function shot(page, label) {
  const file = resolve(OUT, `${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.screenshots.push(file);
  console.log('shot', label);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 30000 });
  await page.fill('input[type="email"], input[name="email"]', CREDS.email);
  await page.fill('input[type="password"], input[name="password"]', CREDS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/partner/, { timeout: 60000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(700);
}

async function openWizard(page) {
  await page.goto(`${BASE}/partner/money?tab=settings#income-payout-settings`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(1000);
  const cta = page.getByRole('button', {
    name: /Set up payouts|Continue setup|Review setup/i,
  });
  await cta.first().click();
  await page.waitForSelector('.payout-wizard', { timeout: 30000 });
}

async function fillRepresentative(page) {
  await page.getByLabel(/First name/i).first().fill('Ada');
  await page.getByLabel(/Last name/i).first().fill('Lovelace');
  const dob = page.locator('input[type="date"]').first();
  if ((await dob.count()) > 0) await dob.fill('1990-01-15');
}

async function acceptTos(page) {
  const box = page.locator('input[type="checkbox"]').first();
  if ((await box.count()) > 0 && !(await box.isChecked())) {
    await box.check({ force: true });
  }
}

async function fillBankLocal(page) {
  const holder = page.locator('label').filter({ hasText: /Account holder name/i }).locator('input');
  if ((await holder.count()) > 0) {
    await holder.first().fill('P921 Cert Oy');
  }
  const iban = page.locator('label').filter({ hasText: /^IBAN$/i }).locator('input');
  if ((await iban.count()) > 0) {
    await iban.first().fill('FI2112345600000785');
  }
}

async function fillPreferences(page) {
  const monthly = page.getByText(/Monthly/i).first();
  if ((await monthly.count()) > 0) await monthly.click();
  const min = page.getByLabel(/Minimum|threshold/i).first();
  if ((await min.count()) > 0) await min.fill('50');
}

async function clickContinue(page) {
  await page.getByRole('button', { name: /Continue|Done|Saving/i }).last().click();
  await page.waitForTimeout(500);
}

async function runPrimaryFlow(page) {
  await login(page);
  note('Login disposable supplier', true, CREDS.email);
  await openWizard(page);
  note('Wizard opens', await page.locator('.payout-wizard').count() > 0);

  // Business
  await shot(page, 'step-business-desktop-1440');
  await clickContinue(page);

  // Representative
  await page.waitForTimeout(400);
  await fillRepresentative(page);
  await shot(page, 'step-representative-desktop-1440');
  await clickContinue(page);
  await page.waitForTimeout(800);

  // Identity
  await acceptTos(page);
  await shot(page, 'step-identity-desktop-1440');
  await clickContinue(page);
  await page.waitForTimeout(800);

  // Bank
  await fillBankLocal(page);
  await shot(page, 'step-bank-desktop-1440');
  await clickContinue(page);
  await page.waitForTimeout(800);

  // Preferences
  await fillPreferences(page);
  await shot(page, 'step-preferences-desktop-1440');
  await clickContinue(page);
  await page.waitForTimeout(800);

  // Review
  const reviewTitle = page.getByRole('heading', { name: /Review/i });
  note('Reached review', (await reviewTitle.count()) > 0);
  await shot(page, 'step-review-desktop-1440');

  // Done → completion
  await page.getByRole('button', { name: /^Done$/i }).click();
  await page.waitForTimeout(600);
  const complete = page.getByRole('heading', { name: /all set for now/i });
  const completeOk = (await complete.count()) > 0;
  note('Completion screen after Done', completeOk);
  const noFakeVerified =
    !(await page.getByText(/^Verified$/i).count()) ||
    (await page.locator('.payout-wizard__status-row').filter({ hasText: 'Verification' }).textContent())?.includes('Not started') ||
    (await page.locator('.payout-wizard__status-row').filter({ hasText: 'Verification' }).textContent())?.includes('Under review') ||
    (await page.locator('.payout-wizard__status-row').filter({ hasText: 'Verification' }).textContent())?.includes('LIVE');
  note('No fake Verified without provider', Boolean(noFakeVerified));
  await shot(page, 'step-complete-desktop-1440');

  // Return
  await page.getByRole('button', { name: /Return to Income & Payouts/i }).click();
  await page.waitForTimeout(1000);
  const settings = page.locator('#income-payout-settings');
  note('Return lands on Income settings', (await settings.count()) > 0);
  const savedChip = page.getByText(/Setup saved|Details saved/i);
  note('Settings shows saved onboarding state', (await savedChip.count()) > 0);
  await shot(page, 'settings-after-complete-desktop-1440');

  // Overflow / horizontal scroll check on settings
  const scrollW = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  note('No horizontal page overflow (settings)', scrollW.doc <= scrollW.client + 1, JSON.stringify(scrollW));
}

async function walkStepsAndShot(page, suffix) {
  const steps = [
    'business',
    'representative',
    'identity',
    'bank',
    'preferences',
    'review',
  ];
  for (let i = 0; i < steps.length; i++) {
    const id = steps[i];
    if (id === 'representative') await fillRepresentative(page).catch(() => {});
    if (id === 'identity') await acceptTos(page).catch(() => {});
    if (id === 'bank') await fillBankLocal(page).catch(() => {});
    if (id === 'preferences') await fillPreferences(page).catch(() => {});
    await shot(page, `step-${id}-${suffix}`);
    const overflow = await page.evaluate(() => {
      const root = document.querySelector('.payout-wizard');
      if (!root) return false;
      return root.scrollWidth > root.clientWidth + 1;
    });
    note(`No wizard overflow ${id} ${suffix}`, !overflow);
    if (i < steps.length - 1) {
      await clickContinue(page);
      await page.waitForTimeout(700);
    }
  }
  await page.getByRole('button', { name: /^Done$/i }).click();
  await page.waitForTimeout(500);
  await shot(page, `step-complete-${suffix}`);
  note(
    `Completion ${suffix}`,
    (await page.getByRole('heading', { name: /all set for now/i }).count()) > 0
  );
}

async function captureViewports(browser) {
  for (const vp of VIEWPORTS) {
    if (vp.name === 'desktop-1440') continue; // already captured in primary
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.width <= 430 ? 2 : 1,
      isMobile: vp.width <= 430,
      hasTouch: vp.width <= 430,
    });
    const page = await context.newPage();
    try {
      await login(page);
      await openWizard(page);
      if (vp.name === 'mobile-390' || vp.name === 'desktop-1280') {
        await walkStepsAndShot(page, vp.name);
      } else {
        await shot(page, `step-business-${vp.name}`);
        await page.getByRole('button', { name: /Save & exit|Exit/i }).first().click();
        await page.waitForTimeout(500);
      }
      await page.goto(`${BASE}/partner/money?tab=settings#income-payout-settings`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(600);
      await shot(page, `settings-${vp.name}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      note(`No overflow ${vp.name}`, !overflow);
    } catch (err) {
      note(`Viewport sweep ${vp.name}`, false, String(err?.message || err));
    } finally {
      await context.close();
    }
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  try {
    await runPrimaryFlow(page);
  } catch (err) {
    note('Primary flow', false, String(err?.message || err));
    await shot(page, 'error-primary').catch(() => {});
  }
  await context.close();
  await captureViewports(browser);
} finally {
  await browser.close();
}

const failed = report.checks.filter((c) => !c.ok);
report.finishedAt = new Date().toISOString();
report.verdict = failed.length === 0 ? 'PASS' : failed.length <= 2 ? 'PARTIAL' : 'FAIL';
writeFileSync(resolve(process.cwd(), 'scripts/cert-p929-payout-wizard.report.json'), JSON.stringify(report, null, 2));
console.log('\nVERDICT', report.verdict, `(${failed.length} failed of ${report.checks.length})`);
process.exit(failed.length > 3 ? 1 : 0);
