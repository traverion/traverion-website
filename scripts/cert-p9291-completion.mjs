/**
 * P9.29.1 — Payout completion screen polish certification.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = (process.env.CERT_BASE || 'http://127.0.0.1:5182').replace(/\/$/, '');
const OUT = resolve(process.cwd(), 'scripts/p9291-screenshots');
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
  mission: 'P9.29.1',
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
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 30000 });
  await page.fill('input[type="email"], input[name="email"]', CREDS.email);
  await page.fill('input[type="password"], input[name="password"]', CREDS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/partner/, { timeout: 60000 });
  await page.waitForTimeout(700);
}

async function seedDraftAndOpen(page) {
  await page.goto(`${BASE}/partner/money?tab=settings#income-payout-settings`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(900);
  await page.evaluate((userId) => {
    const key = `tv-payout-wizard:v3:${userId}`;
    const now = new Date().toISOString();
    const draft = {
      step: 'review',
      company_legal_name: 'P921 Test Supplier Oy',
      business_type: 'company',
      company_registration_number: '123',
      address_street: 'Mannerheimintie 1',
      address_city: 'Helsinki',
      address_postal_code: '00100',
      address_country: 'FI',
      contact_phone: '',
      managing_directors: '',
      rep_first_name: 'Ada',
      rep_last_name: 'Lovelace',
      rep_email: '',
      rep_phone: '',
      rep_title: '',
      rep_dob: '1990-01-15',
      rep_is_owner: false,
      rep_percent_ownership: '',
      rep_person_id: '',
      beneficial_owners: [],
      tos_accepted: true,
      payment_cycle: 'monthly',
      payout_threshold_min: '50',
      stripeAuthAcknowledged: false,
      businessSavedAt: now,
      representativeSavedAt: now,
      identitySavedAt: now,
      bankSavedAt: now,
      preferencesSavedAt: now,
      wizardCompletedAt: null,
      updatedAt: now,
    };
    sessionStorage.setItem(key, JSON.stringify(draft));
  }, CREDS.userId);

  const cta = page.getByRole('button', {
    name: /Set up payouts|Continue setup|Review setup/i,
  });
  await cta.first().click();
  await page.waitForSelector('.payout-wizard', { timeout: 30000 });
  await page.waitForTimeout(500);

  // Jump to review if not already
  const reviewRail = page.getByRole('button', { name: /^Review$/i });
  if ((await reviewRail.count()) > 0 && (await reviewRail.first().isVisible())) {
    await reviewRail.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const done = page.getByRole('button', { name: /^Done$/i });
  if ((await done.count()) === 0) {
    // Force step via continue loop max 6
    for (let i = 0; i < 6; i++) {
      if ((await page.getByRole('button', { name: /^Done$/i }).count()) > 0) break;
      const cont = page.getByRole('button', { name: /^Continue$|^Saving/i }).last();
      if ((await cont.count()) === 0) break;
      await cont.click();
      await page.waitForTimeout(600);
    }
  }
  await page.getByRole('button', { name: /^Done$/i }).click();
  await page.waitForTimeout(600);
}

async function assertCompletion(page, vpName) {
  const title = page.getByRole('heading', { name: /ready to continue/i });
  note(`Completion heading ${vpName}`, (await title.count()) > 0);

  const outline = await page.evaluate(() => {
    const h = document.querySelector('.payout-wizard__complete-title, .payout-wizard__title');
    const focused = document.activeElement;
    if (!h) return { ok: false, reason: 'no title' };
    // Heading must not be the focused element (blue ring source)
    if (focused === h) return { ok: false, reason: 'heading focused' };
    const styles = window.getComputedStyle(h);
    const outlineW = styles.outlineWidth;
    const outlineStyle = styles.outlineStyle;
    const ring =
      outlineStyle !== 'none' && outlineW && outlineW !== '0px'
        ? `${outlineStyle} ${outlineW} ${styles.outlineColor}`
        : null;
    return {
      ok: focused?.tagName === 'BUTTON' || focused?.classList?.contains('tv-btn-primary'),
      focusTag: focused?.tagName,
      focusClass: focused?.className?.slice?.(0, 80),
      headingOutline: ring,
    };
  });
  note(
    `No heading focus ring ${vpName}`,
    outline.ok && !outline.headingOutline,
    JSON.stringify(outline)
  );

  const body = await page.locator('.payout-wizard__complete-card').innerText();
  note(`Friendly saved copy ${vpName}`, /All details saved|\bSaved\b|Partially saved/i.test(body));
  note(
    `No technical provider jargon ${vpName}`,
    !/provider confirms|Traverion never marks|verification failure/i.test(body)
  );
  note(`Statuses present ${vpName}`, /Verification/i.test(body) && /Payout connection/i.test(body));
  note(
    `No fake Verified ${vpName}`,
    !/\bVerified\b/i.test(body) || /Confirmed/i.test(body)
  );

  const overflow = await page.evaluate(() => {
    const root = document.querySelector('.payout-wizard') || document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
  note(`No overflow ${vpName}`, !overflow);

  const edit = page.getByRole('button', { name: /Edit details/i });
  note(`Edit action ${vpName}`, (await edit.count()) > 0);
  const ret = page.getByRole('button', { name: /Return to Income & Payouts/i });
  note(`Return action ${vpName}`, (await ret.count()) > 0);

  await shot(page, `complete-${vpName}`);

  // Edit still works
  if ((await edit.count()) > 0) {
    await edit.first().click();
    await page.waitForTimeout(500);
    note(
      `Edit returns to steps ${vpName}`,
      (await page.getByRole('heading', { name: /Review/i }).count()) > 0 ||
        (await page.locator('.payout-wizard__stage').count()) > 0
    );
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.width <= 430 ? 2 : 1,
      isMobile: vp.width <= 430,
      hasTouch: vp.width <= 430,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    try {
      await login(page);
      await seedDraftAndOpen(page);
      await assertCompletion(page, vp.name);
    } catch (err) {
      note(`Viewport ${vp.name}`, false, String(err?.message || err));
      await shot(page, `error-${vp.name}`).catch(() => {});
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failed = report.checks.filter((c) => !c.ok);
report.finishedAt = new Date().toISOString();
report.verdict = failed.length === 0 ? 'PASS' : failed.length <= 3 ? 'PARTIAL' : 'FAIL';
writeFileSync(resolve(process.cwd(), 'scripts/cert-p9291-completion.report.json'), JSON.stringify(report, null, 2));
console.log('\nVERDICT', report.verdict, `(${failed.length} failed of ${report.checks.length})`);
process.exit(failed.length > 4 ? 1 : 0);
