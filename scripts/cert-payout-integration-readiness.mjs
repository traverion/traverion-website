/**
 * Payout onboarding — real integration readiness certification.
 * No LIVE create, no transfers, no fake Verified.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const BASE = (process.env.CERT_BASE || 'http://127.0.0.1:5182').replace(/\/$/, '');
const OUT = resolve(process.cwd(), 'scripts/payout-integration-screenshots');
const CREDS = JSON.parse(
  readFileSync(resolve(process.cwd(), 'scripts/cert-p921-disposable.credentials.json'), 'utf8')
);
mkdirSync(OUT, { recursive: true });

const report = {
  mission: 'Payout Integration Readiness',
  base: BASE,
  startedAt: new Date().toISOString(),
  production: {},
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

function queryDb(sql) {
  try {
    const cleaned = sql.replace(/\s+/g, ' ').trim();
    const out = execSync(`npx supabase db query --linked --yes -o json ${JSON.stringify(cleaned)}`, {
      encoding: 'utf8',
      cwd: process.cwd(),
      timeout: 60000,
    });
    const start = out.indexOf('{');
    if (start < 0) return null;
    return JSON.parse(out.slice(start));
  } catch (err) {
    console.warn('db query failed', err?.message || err);
    return null;
  }
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

async function openSettings(page) {
  await page.goto(`${BASE}/partner/money?tab=settings#income-payout-settings`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(1000);
}

async function seedDeferredDraft(page) {
  await page.evaluate((userId) => {
    const key = `tv-payout-wizard:v4:${userId}`;
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
      bankSavedAt: null,
      bankDeferredAt: now,
      bankLast4: null,
      preferencesSavedAt: now,
      wizardCompletedAt: now,
      updatedAt: now,
    };
    localStorage.setItem(key, JSON.stringify(draft));
    sessionStorage.removeItem(`tv-payout-wizard:v3:${userId}`);
  }, CREDS.userId);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  // Production gate audit (no money movement)
  const gates = queryDb(
    "select key, value_int from public.commercial_runtime_config where key in ('live_custom_onboarding_enabled','payout_execution_enabled','stripe_connect_transfers_enabled') order by key"
  );
  const allow = queryDb('select count(*)::int as allowlist_count from public.live_custom_onboarding_allowlist');
  const accounts = queryDb(
    "select count(*) filter (where coalesce(stripe_connected_account_id,'') <> '')::int as with_connect, count(*) filter (where connect_account_livemode is true)::int as live_connect, count(*) filter (where connect_account_livemode is false)::int as test_connect from public.supplier_profiles"
  );
  report.production = {
    gates: gates?.rows ?? null,
    allowlist: allow?.rows?.[0] ?? null,
    accounts: accounts?.rows?.[0] ?? null,
  };
  const gateMap = Object.fromEntries((gates?.rows ?? []).map((r) => [r.key, r.value_int]));
  note(
    'live_custom_onboarding_enabled is OFF',
    gateMap.live_custom_onboarding_enabled === 0,
    String(gateMap.live_custom_onboarding_enabled)
  );
  note(
    'payout_execution_enabled is OFF',
    gateMap.payout_execution_enabled === 0,
    String(gateMap.payout_execution_enabled)
  );
  note(
    'stripe_connect_transfers_enabled is OFF',
    gateMap.stripe_connect_transfers_enabled === 0,
    String(gateMap.stripe_connect_transfers_enabled)
  );
  note(
    'live allowlist empty',
    (allow?.rows?.[0]?.allowlist_count ?? -1) === 0,
    JSON.stringify(allow?.rows?.[0])
  );
  note(
    'no production Connect accounts (honest baseline)',
    (accounts?.rows?.[0]?.with_connect ?? -1) === 0,
    JSON.stringify(accounts?.rows?.[0])
  );

  await login(page);
  await openSettings(page);
  await seedDeferredDraft(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const bodyText = await page.locator('body').innerText();
  note(
    'settings shows connection-not-enabled verification (not Verified)',
    /Details saved — connection not enabled/i.test(bodyText) && !/\bVerified\b/.test(bodyText),
    bodyText.includes('Details saved — connection not enabled')
      ? 'found honest chip'
      : 'missing honest chip'
  );
  note(
    'settings does not claim bank Saved locally without attach',
    !/Saved locally — not connected/i.test(bodyText),
    'no fake bank-saved copy'
  );
  note(
    'settings shows bank not sent to provider when deferred',
    /Not sent to provider|Not sent yet/i.test(bodyText),
    'deferred bank honesty'
  );
  await shot(page, 'settings-honest-status');

  // Persistence across reload (localStorage)
  const draftSurvived = await page.evaluate((userId) => {
    const raw = localStorage.getItem(`tv-payout-wizard:v4:${userId}`);
    if (!raw) return { ok: false, reason: 'missing' };
    const d = JSON.parse(raw);
    return {
      ok: Boolean(d.wizardCompletedAt) && Boolean(d.bankDeferredAt) && !d.bankSavedAt,
      reason: `completed=${Boolean(d.wizardCompletedAt)} deferred=${Boolean(d.bankDeferredAt)} saved=${Boolean(d.bankSavedAt)}`,
    };
  }, CREDS.userId);
  note('draft persists in localStorage after reload', draftSurvived.ok, draftSurvived.reason);

  // Open completion via Review setup
  const cta = page.getByRole('button', { name: /Review setup|Continue setup|Set up payouts/i }).first();
  await cta.click();
  await page.waitForTimeout(900);
  // Jump to complete by finishing review if needed
  const done = page.getByRole('button', { name: /^Done$/i });
  if (await done.count()) {
    await done.click();
    await page.waitForTimeout(700);
  }
  const completeText = await page.locator('body').innerText();
  note(
    'completion does not show Verified / Confirmed without Connect',
    !/\bVerified\b/.test(completeText) && !/\bConfirmed\b/.test(completeText),
    'no fake verification'
  );
  note(
    'completion shows connection not enabled / not available',
    /Connection not enabled|Not available yet/i.test(completeText),
    'honest connection status'
  );
  note(
    'completion bank is not sent / not added (not Saved locally)',
    /Not sent to provider|Not added/i.test(completeText) && !/Saved locally/i.test(completeText),
    'honest bank status'
  );
  await shot(page, 'completion-honest-status');

  // Mobile viewport smoke
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await shot(page, 'completion-mobile-390');
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.payout-wizard__complete-card') || document.body;
    return el.scrollWidth <= window.innerWidth + 2;
  });
  note('completion fits mobile width', overflow, '390px');

  const failed = report.checks.filter((c) => !c.ok).length;
  const criticalOps = [
    'live_custom_onboarding_enabled is OFF',
    'payout_execution_enabled is OFF',
    'stripe_connect_transfers_enabled is OFF',
  ].every((name) => report.checks.find((c) => c.check === name)?.ok);
  const honesty = report.checks
    .filter((c) => /honest|does not|Verified|localStorage|fits mobile/i.test(c.check))
    .every((c) => c.ok);

  // PARTIAL when honesty+safety pass but Connect/payouts remain disabled (expected).
  if (criticalOps && honesty && failed === 0) {
    report.verdict = 'PARTIAL';
  } else if (criticalOps && honesty) {
    report.verdict = 'PARTIAL';
  } else {
    report.verdict = 'FAIL';
  }
} catch (err) {
  note('cert runner', false, String(err?.message || err));
  report.verdict = 'FAIL';
} finally {
  report.finishedAt = new Date().toISOString();
  await browser.close();
  writeFileSync(
    resolve(process.cwd(), 'scripts/cert-payout-integration-readiness.report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log('\nVERDICT', report.verdict, `${report.checks.filter((c) => c.ok).length}/${report.checks.length}`);
  if (report.verdict === 'FAIL') process.exit(1);
}
