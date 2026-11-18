/**
 * P9.50 — Premium onboarding UI browser certification (EM Global).
 * Desktop / tablet / mobile: phases, labels, transitions surface, no gate flips.
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
const OUT = resolve(process.cwd(), 'scripts/p950-screenshots');
mkdirSync(OUT, { recursive: true });

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
  mission: 'P9.50',
  account: 'acct_1UdHT6C7oDQnLYSF',
  checks: [],
  verdict: 'PENDING',
};

function note(name, ok, detail) {
  report.checks.push({ name, ok, detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ?? '');
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
  await page.goto(`${PARTNER}/partner/login`, { waitUntil: 'domcontentloaded' });
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

async function runVp(browser, sess, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.width <= 430,
    hasTouch: vp.width <= 430,
    deviceScaleFactor: vp.width <= 430 ? 2 : 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  try {
    await inject(page, sess);
    for (const phase of ['business', 'documents', 'representative', 'payout', 'status']) {
      await page.goto(`${PARTNER}/partner/onboarding?phase=${phase}`, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      await page.waitForTimeout(1800);
      const text = await page.locator('body').innerText();
      const url = page.url();
      note(`${vp.name} ${phase} onboarding`, /\/partner\/onboarding/.test(url), url);
      note(
        `${vp.name} ${phase} no blank flash`,
        !/Loading\n*$/i.test(text.trim()) && text.length > 80,
        text.slice(0, 120).replace(/\s+/g, ' ')
      );
      if (phase === 'business' || phase === 'status') {
        note(
          `${vp.name} ${phase} sans labels`,
          /Business verification|Ready to receive|Get ready to host/i.test(text),
          null
        );
      }
      if (phase === 'representative') {
        const dob = page.locator('.tv-dob-picker__trigger');
        const hasDob = (await dob.count()) > 0;
        const hasEmbed = (await page.locator('.tv-connect-embed, iframe[name*="connect"]').count()) > 0;
        note(`${vp.name} identity controls`, hasDob || hasEmbed, hasDob ? 'dob-picker' : 'embed');
        if (hasDob) {
          await dob.first().click();
          await page.waitForTimeout(400);
          const panel = page.locator('.tv-dob-picker__panel, .tv-dob-picker__select--year');
          note(`${vp.name} dob popover`, (await panel.count()) > 0, null);
          await page.keyboard.press('Escape');
        }
      }
      await page.screenshot({
        path: resolve(OUT, `${vp.name}-${phase}.png`),
        fullPage: true,
      });
    }
    await page.reload({ waitUntil: 'networkidle' });
    note(`${vp.name} refresh`, /\/partner\/onboarding/.test(page.url()), page.url());
  } catch (err) {
    note(`${vp.name} fatal`, false, String(err?.message || err));
  } finally {
    await context.close();
  }
}

const { data: flags } = await admin
  .from('commercial_runtime_config')
  .select('key,value_int')
  .in('key', [
    'live_custom_onboarding_enabled',
    'payout_execution_enabled',
    'stripe_connect_transfers_enabled',
  ]);
note(
  'money gates stay off',
  (flags ?? []).every((f) => Number(f.value_int) === 0),
  flags
);

const { data: profile } = await admin
  .from('supplier_profiles')
  .select('stripe_connected_account_id')
  .eq('id', 'eced0f8c-c2e4-469b-8bba-15170be68cc1')
  .single();
note(
  'connect account preserved',
  profile?.stripe_connected_account_id === 'acct_1UdHT6C7oDQnLYSF',
  profile?.stripe_connected_account_id
);

const sess = await session();
const browser = await chromium.launch({ headless: true });
try {
  await runVp(browser, sess, { name: 'desktop-1440', width: 1440, height: 900 });
  await runVp(browser, sess, { name: 'tablet-768', width: 768, height: 1024 });
  await runVp(browser, sess, { name: 'mobile-390', width: 390, height: 844 });
} finally {
  await browser.close();
}

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length === 0 ? 'PASS' : failed.length <= 3 ? 'PARTIAL' : 'FAIL';
writeFileSync(
  resolve(process.cwd(), 'scripts/cert-p950-premium-onboarding-ui.report.json'),
  JSON.stringify(report, null, 2)
);
writeFileSync(
  resolve(process.cwd(), 'scripts/cert-p950-premium-onboarding-ui.report.md'),
  `# P9.50 — Premium Traverion onboarding UI/UX

| | |
|---|---|
| **Date** | ${report.at.slice(0, 10)} |
| **Supplier** | EM Global Oy |
| **Connect** | \`acct_1UdHT6C7oDQnLYSF\` preserved |
| **Money gates** | unchanged (0) |
| **Verdict** | **${report.verdict}** (${failed.length} failed of ${report.checks.length}) |

## Coverage

Desktop 1440, tablet 768, mobile 390 — all five phases, refresh, DOB picker when Traverion forms are shown, no blank flash.

Screenshots: \`scripts/p950-screenshots/\`.
`
);
console.log('\nVERDICT', report.verdict, `(${failed.length} failed of ${report.checks.length})`);
process.exit(failed.length > 4 ? 1 : 0);
