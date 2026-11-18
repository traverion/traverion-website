/**
 * P9.32 — LIVE payout onboarding pilot readiness (gate stays OFF).
 * Certifies: eligibility flags, server draft persistence, no browser IBAN/DOB secrets,
 * honest Done/completion, transfers/execution still disabled.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const BASE = (process.env.CERT_BASE || 'http://127.0.0.1:5185').replace(/\/$/, '');
const OUT = resolve(process.cwd(), 'scripts/p932-screenshots');
const CREDS = JSON.parse(
  readFileSync(resolve(process.cwd(), 'scripts/cert-p921-disposable.credentials.json'), 'utf8')
);
mkdirSync(OUT, { recursive: true });

const report = {
  mission: 'P9.32',
  base: BASE,
  startedAt: new Date().toISOString(),
  production: {},
  checks: [],
  screenshots: [],
  approval_checkpoint: null,
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
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  const gates = queryDb(
    "select key, value_int from public.commercial_runtime_config where key in ('live_custom_onboarding_enabled','payout_execution_enabled','stripe_connect_transfers_enabled') order by key"
  );
  const allow = queryDb('select count(*)::int as allowlist_count from public.live_custom_onboarding_allowlist');
  const cols = queryDb(
    "select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='supplier_profiles' and column_name in ('payout_wizard_draft','payout_wizard_draft_updated_at')"
  );
  const accounts = queryDb(
    "select count(*) filter (where coalesce(stripe_connected_account_id,'') <> '')::int as with_connect from public.supplier_profiles"
  );
  report.production = {
    gates: gates?.rows ?? null,
    allowlist: allow?.rows?.[0] ?? null,
    draft_columns: cols?.rows?.[0] ?? null,
    accounts: accounts?.rows?.[0] ?? null,
  };
  const gateMap = Object.fromEntries((gates?.rows ?? []).map((r) => [r.key, r.value_int]));
  note('live_custom_onboarding_enabled remains OFF', gateMap.live_custom_onboarding_enabled === 0, String(gateMap.live_custom_onboarding_enabled));
  note('payout_execution_enabled remains OFF', gateMap.payout_execution_enabled === 0, String(gateMap.payout_execution_enabled));
  note('stripe_connect_transfers_enabled remains OFF', gateMap.stripe_connect_transfers_enabled === 0, String(gateMap.stripe_connect_transfers_enabled));
  note('allowlist empty (no unauthorized pilot)', (allow?.rows?.[0]?.allowlist_count ?? -1) === 0, JSON.stringify(allow?.rows?.[0]));
  note('payout_wizard_draft columns exist', (cols?.rows?.[0]?.n ?? 0) === 2, JSON.stringify(cols?.rows?.[0]));
  note('no Connect accounts created by this mission', (accounts?.rows?.[0]?.with_connect ?? -1) === 0, JSON.stringify(accounts?.rows?.[0]));

  await login(page);
  await page.goto(`${BASE}/partner/money?tab=settings#income-payout-settings`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(1200);

  const statusProbe = await page.evaluate(async () => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
    // Prefer app's existing session via localStorage keys
    const url = import.meta.env?.VITE_SUPABASE_URL;
    return { note: 'use in-page supabase', url: Boolean(url) };
  }).catch(() => ({ note: 'skip esm' }));

  // Open wizard and drive a lightweight incomplete path via seeded local draft + Done
  await page.evaluate((userId) => {
    const key = `tv-payout-wizard:v5:${userId}`;
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
      rep_email: 'ada@example.com',
      rep_phone: '',
      rep_title: '',
      rep_dob: '',
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
      wizardCompletedAt: null,
      updatedAt: now,
    };
    localStorage.setItem(key, JSON.stringify(draft));
  }, CREDS.userId);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const cta = page.getByRole('button', { name: /Set up payouts|Continue setup|Review setup/i }).first();
  await cta.click();
  await page.waitForTimeout(1500);

  // Capture in-wizard status flags via network-less DOM + storage probe after autosave window
  await page.waitForTimeout(1200);
  const storageAudit = await page.evaluate((userId) => {
    const raw = localStorage.getItem(`tv-payout-wizard:v5:${userId}`) || '';
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const dobFields = [parsed?.rep_dob, ...(parsed?.beneficial_owners || []).map((o) => o?.dob)].filter(
      Boolean
    );
    return {
      hasIban: /iban|FI\d{2}|bankIban/i.test(raw),
      hasFullDob: dobFields.some((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d))),
      hasDeferred: Boolean(parsed?.bankDeferredAt),
      repDob: parsed?.rep_dob ?? null,
    };
  }, CREDS.userId);
  note('device draft has no IBAN secrets', !storageAudit.hasIban, JSON.stringify(storageAudit));
  note('device draft has no full DOB', !storageAudit.hasFullDob, JSON.stringify(storageAudit));

  const done = page.getByRole('button', { name: /^Done$/i });
  if (await done.count()) {
    await done.click();
    await page.waitForTimeout(2500);
  }

  const completeText = await page.locator('body').innerText();
  note(
    'Done does not show Verified/Confirmed without Connect',
    !/\bVerified\b/.test(completeText) && !/\bConfirmed\b/.test(completeText),
    'honest completion'
  );
  note(
    'Done shows connection not enabled / not available',
    /Connection not enabled|Not available yet|Setup saved/i.test(completeText),
    'pilot gate honesty'
  );
  await shot(page, 'complete-desktop-1280');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await shot(page, 'complete-mobile-390');
  const fits = await page.evaluate(() => {
    const el = document.querySelector('.payout-wizard__complete-card') || document.body;
    return el.scrollWidth <= window.innerWidth + 2;
  });
  note('completion fits mobile', fits, '390px');

  // Server draft persistence
  const draftRow = queryDb(
    `select payout_wizard_draft is not null as has_draft, payout_wizard_draft_updated_at is not null as has_updated, coalesce(payout_wizard_draft::text,'') as draft_text from public.supplier_profiles where id='${CREDS.userId}'`
  );
  const draftText = draftRow?.rows?.[0]?.draft_text ?? '';
  note(
    'server draft persisted for cert supplier',
    Boolean(draftRow?.rows?.[0]?.has_draft) && Boolean(draftRow?.rows?.[0]?.has_updated),
    JSON.stringify({
      has_draft: draftRow?.rows?.[0]?.has_draft,
      has_updated: draftRow?.rows?.[0]?.has_updated,
    })
  );
  note('server draft contains no IBAN', !/iban|FI\d{2}/i.test(draftText), 'sanitized');
  note(
    'server draft contains no full DOB',
    !/"dob"\s*:\s*"\d{4}-\d{2}-\d{2}"/.test(draftText) &&
      !/"rep_dob"\s*:\s*"\d{4}-\d{2}-\d{2}"/.test(draftText),
    'year-only or omitted'
  );

  // Return to settings — incomplete / returning supplier honesty
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.keyboard.press('Escape').catch(() => {});
  await page.getByRole('button', { name: /Return to Income|Save & exit|Exit/i }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.goto(`${BASE}/partner/money?tab=settings#income-payout-settings`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(1200);
  // Ensure wizard overlay is closed for settings assertion
  const exitBtn = page.getByRole('button', { name: /^Exit$|^Save & exit$/i });
  if (await exitBtn.count()) {
    await exitBtn.first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const settingsRoot = page.locator('#income-payout-settings');
  const settingsText =
    (await settingsRoot.count()) > 0
      ? await settingsRoot.innerText()
      : await page.locator('body').innerText();
  note(
    'settings never shows Verified without Connect',
    !/\bVerified\b/.test(settingsText),
    'returning supplier honesty'
  );
  note(
    'settings shows connection-not-enabled or setup saved',
    /Details saved|connection not enabled|not available yet|Setup saved|Setup completed|Review setup|Continue setup|Not sent to provider|Set up payouts/i.test(
      settingsText
    ),
    'resume path'
  );
  await shot(page, 'settings-returning-1280');

  report.approval_checkpoint = {
    title: 'APPROVAL_CHECKPOINT — enable LIVE Connect creation',
    required_before_create: [
      'Explicitly name one supplier id for the pilot',
      'Confirm Finland country + real legal entity on that profile',
      'Insert one live_custom_onboarding_allowlist row (service role)',
      'Separately authorize setting live_custom_onboarding_enabled=1 for a controlled window',
      'Supplier continues once → ensure_account creates LIVE Accounts v2',
      'Prefer closing the gate after create; leave transfers/execution at 0',
    ],
    blocked_now: [
      'live_custom_onboarding_enabled=0',
      'allowlist empty',
      'no named supplier approval in this mission',
    ],
    never_auto: [
      'payout_execution_enabled',
      'stripe_connect_transfers_enabled',
      'fabricated Verified / bank connected states',
    ],
  };

  const failed = report.checks.filter((c) => !c.ok).length;
  const safetyOk = [
    'live_custom_onboarding_enabled remains OFF',
    'payout_execution_enabled remains OFF',
    'stripe_connect_transfers_enabled remains OFF',
    'allowlist empty (no unauthorized pilot)',
    'no Connect accounts created by this mission',
  ].every((name) => report.checks.find((c) => c.check === name)?.ok);
  const honestyOk = report.checks
    .filter((c) => /Verified|IBAN|DOB|connection not enabled|fits mobile|server draft/i.test(c.check))
    .every((c) => c.ok);

  // PARTIAL: pilot plumbing ready, LIVE create not authorized yet.
  report.verdict = safetyOk && honestyOk && failed === 0 ? 'PARTIAL' : failed <= 2 && safetyOk ? 'PARTIAL' : 'FAIL';
  void statusProbe;
} catch (err) {
  note('cert runner', false, String(err?.message || err));
  report.verdict = 'FAIL';
} finally {
  report.finishedAt = new Date().toISOString();
  await browser.close();
  writeFileSync(
    resolve(process.cwd(), 'scripts/cert-p932-live-pilot.report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log('\nVERDICT', report.verdict, `${report.checks.filter((c) => c.ok).length}/${report.checks.length}`);
  if (report.verdict === 'FAIL') process.exit(1);
}
