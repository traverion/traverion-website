/**
 * P9.53 — Native Traverion onboarding certification (EM Global, existing LIVE Connect).
 * Does not type or submit KYC. Does not create accounts. Restores wizard JSON.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const EMAIL = 'contact@royalnordic.fi';
const SUPPLIER_ID = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';
const ACCOUNT = 'acct_1UdHT6C7oDQnLYSF';
const PARTNER = 'https://partner.traverion.com';
const STORAGE_KEY = `sb-${PROJECT}-auth-token`;
const OUT = resolve(process.cwd(), 'scripts/p953-screenshots');
mkdirSync(OUT, { recursive: true });

const PHASES = [
  { phase: 'business', screen: 'company', expect: /confirm your company/i },
  { phase: 'documents', screen: 'documents', expect: /registration document/i },
  { phase: 'representative', screen: 'person', expect: /who acts/i },
  { phase: 'representative', screen: 'dob', expect: /date of birth/i },
  { phase: 'representative', screen: 'director', expect: /director/i },
  { phase: 'representative', screen: 'ownership', expect: /own part/i },
  { phase: 'payout', screen: 'bank', expect: /payouts go/i },
  { phase: 'payout', screen: 'terms', expect: /payout terms/i },
  { phase: 'status', screen: 'status', expect: /verification pending/i },
];
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
];

function apiKeys() {
  const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT}`, {
    encoding: 'utf8',
  });
  const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
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
  mission: 'P9.53',
  account: ACCOUNT,
  checks: [],
  actions: [],
  verdict: 'PENDING',
};

function note(name, ok, detail) {
  report.checks.push({ name, ok, detail: detail ?? null });
  const extra = detail == null ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log(ok ? 'PASS' : 'FAIL', name, extra);
}

async function session() {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (link.error) throw new Error(link.error.message);
  const verified = await pub.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verified.error || !verified.data.session) {
    throw new Error(verified.error?.message ?? 'no session');
  }
  return verified.data.session;
}

async function inject(page, sess) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`${PARTNER}/partner/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('domcontentloaded');
      break;
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  await page.evaluate(
    ({ key, session }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type ?? 'bearer',
          user: session.user,
        })
      );
    },
    { key: STORAGE_KEY, session: sess }
  );
}

const COLS =
  'id, company_legal_name, verification_status, stripe_connected_account_id, connect_account_type, connect_account_livemode, connect_onboarding_status, connect_payouts_enabled, payout_wizard_draft, payout_wizard_draft_updated_at, setup_progress, setup_progress_updated_at';

async function profile() {
  const { data, error } = await admin.from('supplier_profiles').select(COLS).eq('id', SUPPLIER_ID).single();
  if (error) throw new Error(error.message);
  return data;
}

async function openPhase(page, phase, screen) {
  const url = `${PARTNER}/partner/onboarding?phase=${phase}&screen=${screen}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      break;
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  await page.waitForSelector('[data-cert="p953"]', { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? '';
      return !text.includes('Loading your details');
    },
    { timeout: 20000 }
  );
  await page.waitForTimeout(1200);
}

async function surface(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    const iframes = [...document.querySelectorAll('iframe')]
      .map((el) => el.src || '')
      .filter((src) => /connect-js\\.stripe\\.com/i.test(src));
    return {
      cert: document.querySelector('[data-cert]')?.getAttribute('data-cert') ?? null,
      dob: document.querySelectorAll('.tv-dob-picker').length,
      director: /\bDirector\b/.test(text),
      consent: /send for verification/i.test(text),
      terms: /accept the terms/i.test(text),
      nameLens: [...document.querySelectorAll('.po-identity input')]
        .filter((el) => el.type === 'text' || el.type === 'email')
        .slice(0, 2)
        .map((el) => (el.value || '').length),
      embedCopy: /tell us about your business|continue secure verification|prefer stripe/i.test(text),
      loadingSecure: /loading secure verification/i.test(text),
      continueCount: [...document.querySelectorAll('button')].filter((b) =>
        /^continue/i.test((b.textContent || '').trim())
      ).length,
      legal: document.querySelector('dt')?.textContent?.trim()?.length ?? 0,
      h1: document.querySelector('h1')?.textContent?.trim() ?? '',
      iframes: iframes.filter((s) => /stripe|connect-js/i.test(s)),
      pending: /verification pending|restricted|finish identity/i.test(text),
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      rail: document.querySelectorAll('.partner-unified-setup-shell__rail').length,
      phaseNav: document.querySelectorAll('.po-phase-nav').length,
      primary: document.querySelectorAll('.tv-btn-primary').length,
      contentScroll: (() => {
        const pane = document.querySelector('.listing-creation-content');
        if (!pane) return null;
        return pane.scrollHeight <= pane.clientHeight + 4;
      })(),
      savedGiven: Number(document.querySelector('[data-saved-given]')?.getAttribute('data-saved-given') ?? 0),
      savedFamily: Number(document.querySelector('[data-saved-family]')?.getAttribute('data-saved-family') ?? 0),
    };
  });
}

const sess = await session();
const before = await profile();
writeFileSync(
  resolve(process.cwd(), 'scripts/cert-p953-restore-snapshot.json'),
  JSON.stringify({
    payout_wizard_draft: before.payout_wizard_draft,
    payout_wizard_draft_updated_at: before.payout_wizard_draft_updated_at,
    setup_progress: before.setup_progress,
    setup_progress_updated_at: before.setup_progress_updated_at,
  })
);
note(
  'existing live account',
  before.stripe_connected_account_id === ACCOUNT && before.connect_account_livemode === true,
  before.connect_account_type
);

const { data: gates } = await admin
  .from('commercial_runtime_config')
  .select('key, value_int')
  .in('key', [
    'live_custom_onboarding_enabled',
    'payout_execution_enabled',
    'stripe_connect_transfers_enabled',
  ]);
note(
  'money gates stay closed',
  (gates ?? []).every((g) => g.value_int === 0) && (gates ?? []).length === 3,
  (gates ?? []).map((g) => `${g.key}=${g.value_int}`).join(' ')
);

const browser = await chromium.launch({ headless: true });
const actions = [];
let crash = null;

try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    page.on('request', (req) => {
      const url = req.url();
      if (!url.includes('connect-supplier-onboarding')) return;
      try {
        const body = req.postDataJSON();
        if (body?.action) actions.push(`${vp.name}:${body.action}`);
      } catch {
        actions.push(`${vp.name}:unparsed`);
      }
    });
    await inject(page, sess);
    for (const step of PHASES) {
      await openPhase(page, step.phase, step.screen);
      const snap = await surface(page);
      const stripeFrame = snap.iframes.length > 0;
      const label = `${vp.name} ${step.screen}`;
      note(`${label} no stripe iframe`, !stripeFrame && !snap.embedCopy && !snap.loadingSecure, snap.h1);
      note(`${label} no page overflow`, snap.scrollW <= snap.clientW + 2, `${snap.scrollW}/${snap.clientW}`);
      note(`${label} no sidebar`, snap.rail === 0 && snap.phaseNav === 0);
      note(`${label} one primary action`, snap.primary === 1, `primary=${snap.primary}`);
      note(`${label} question`, step.expect.test(snap.h1), snap.h1);
      if (vp.width >= 1024 && step.screen !== 'status') {
        note(`${label} no inner scroll`, snap.contentScroll === true);
      }
      if (step.screen === 'person') {
        note(`${label} saved name`, snap.savedGiven > 0 && snap.savedFamily > 0, `${snap.savedGiven}/${snap.savedFamily}`);
      }
      if (step.screen === 'dob') {
        note(`${label} dob picker`, snap.dob > 0);
        await page.getByRole('button', { name: 'Back' }).click();
        await page.waitForTimeout(250);
        const back = await surface(page);
        note(`${label} back`, /who acts/i.test(back.h1), back.h1);
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.waitForTimeout(250);
        const forward = await surface(page);
        note(`${label} forward`, /date of birth/i.test(forward.h1), forward.h1);
      }
      if (step.screen === 'terms') note(`${label} terms`, snap.terms);
      if (step.screen === 'status') note(`${label} pending`, snap.pending, snap.h1);
      await page.screenshot({ path: resolve(OUT, `${vp.name}-${step.screen}.png`), fullPage: false });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-cert="p953"]', { timeout: 30000 });
      await page.waitForFunction(
        () => !(document.body?.innerText ?? '').includes('Loading your details'),
        { timeout: 20000 }
      );
      await page.waitForTimeout(500);
      const again = await surface(page);
      note(`${label} refresh resume`, again.h1 === snap.h1 && again.iframes.length === 0, again.h1);
    }
    await context.close();
  }
} catch (err) {
  crash = err;
} finally {
  await browser.close();
}

report.actions = actions;
const forbidden = actions.filter((a) =>
  /ensure_account|submit_|attach_bank|accept_tos|create_account|account_link|account_session/.test(a)
);
note('no account create or kyc submit', forbidden.length === 0, actions.join(',') || 'none');

const after = await profile();
note(
  'same live account',
  after.stripe_connected_account_id === ACCOUNT && after.connect_payouts_enabled !== true,
  after.connect_onboarding_status
);
const draftChanged = JSON.stringify(before.payout_wizard_draft) !== JSON.stringify(after.payout_wizard_draft);
const progressChanged = JSON.stringify(before.setup_progress) !== JSON.stringify(after.setup_progress);
if (draftChanged || progressChanged) {
  const { error: restoreErr } = await admin
    .from('supplier_profiles')
    .update({
      payout_wizard_draft: before.payout_wizard_draft,
      payout_wizard_draft_updated_at: before.payout_wizard_draft_updated_at,
      setup_progress: before.setup_progress,
      setup_progress_updated_at: before.setup_progress_updated_at,
    })
    .eq('id', SUPPLIER_ID);
  note('autosave restored', !restoreErr, restoreErr?.message ?? 'restored');
} else {
  note('wizard draft unchanged', true);
}
try {
  unlinkSync(resolve(process.cwd(), 'scripts/cert-p953-restore-snapshot.json'));
} catch {
  /* snapshot already removed */
}

if (crash) note('browser run finished', false, crash instanceof Error ? crash.message : String(crash));
const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length === 0 && !crash ? 'PASS' : 'FAIL';
writeFileSync(resolve(process.cwd(), 'scripts/cert-p953-native-onboarding.json'), JSON.stringify(report, null, 2));
console.log('VERDICT', report.verdict, `${report.checks.length - failed.length}/${report.checks.length}`);
if (failed.length || crash) process.exit(1);
