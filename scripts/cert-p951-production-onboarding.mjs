/**
 * P9.51 — Full production onboarding certification (EM Global, existing LIVE Connect).
 * Read-only toward money gates and Stripe account creation.
 * Does not type or submit KYC. Restores wizard/setup JSON if autosave rewrites it.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const EMAIL = 'contact@royalnordic.fi';
const SUPPLIER_ID = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';
const ACCOUNT = 'acct_1UdHT6C7oDQnLYSF';
const PARTNER = 'https://partner.traverion.com';
const STORAGE_KEY = `sb-${PROJECT}-auth-token`;
const OUT = resolve(process.cwd(), 'scripts/p951-screenshots');
mkdirSync(OUT, { recursive: true });

const PHASES = ['business', 'documents', 'representative', 'payout', 'status'];
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
];
const FORBIDDEN_ACTIONS = new Set([
  'ensure_account',
  'submit_business',
  'submit_representative',
  'submit_bank',
  'submit_identity',
  'create_account',
  'account_link',
]);

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
  mission: 'P9.51',
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

async function layout(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const h1 = document.querySelector('h1');
    const lede = document.querySelector('.partner-onboarding-lede, .payout-wizard__lede');
    const h1s = h1 ? getComputedStyle(h1) : null;
    const ledeS = lede ? getComputedStyle(lede) : null;
    const scrollers = [...document.querySelectorAll('.partner-unified-setup-main, .partner-unified-setup-status')];
    const clip = scrollers.map((el) => ({
      className: el.className.slice(0, 80),
      client: el.clientHeight,
      scroll: el.scrollHeight,
      overflowY: getComputedStyle(el).overflowY,
    }));
    const wide = [];
    for (const el of document.querySelectorAll('h1, button, input, label, p, nav')) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      let scroller = el.parentElement;
      let inScroll = false;
      while (scroller) {
        const ox = getComputedStyle(scroller).overflowX;
        if (ox === 'auto' || ox === 'scroll') {
          inScroll = true;
          break;
        }
        scroller = scroller.parentElement;
      }
      if (inScroll) continue;
      if (r.right > window.innerWidth + 4 || r.left < -4) {
        wide.push({
          tag: el.tagName,
          text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 48),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
        if (wide.length >= 6) break;
      }
    }
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      h1: h1?.innerText?.replace(/\s+/g, ' ').slice(0, 80) ?? '',
      h1Size: h1s?.fontSize ?? '',
      h1Weight: h1s?.fontWeight ?? '',
      ledeSize: ledeS?.fontSize ?? '',
      clip,
      wide,
      textLen: text.length,
      preview: text.slice(0, 180),
      dob: document.querySelectorAll('.tv-dob-picker__trigger').length,
      ownership: document.querySelectorAll('.tv-ownership-stepper').length,
      embed: document.querySelectorAll('.tv-connect-embed, iframe[src*="stripe"], iframe[name*="__privateStripeFrame"]').length,
      inputs: [...document.querySelectorAll('input, textarea')]
        .filter((el) => el.type !== 'hidden' && el.type !== 'file')
        .slice(0, 12)
        .map((el) => ({
          label: (el.closest('label')?.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 40),
          value: el.type === 'password' ? '' : String(el.value || '').slice(0, 80),
        })),
    };
  });
}

async function openDob(page, vpName) {
  const trigger = page.locator('.tv-dob-picker__trigger');
  if ((await trigger.count()) === 0) {
    note(`${vpName} dob picker mounted`, false, 'not in DOM on representative');
    return;
  }
  const before = (await trigger.first().innerText()).replace(/\s+/g, ' ').trim();
  await trigger.first().click();
  await page.waitForTimeout(350);
  const panel = page.locator('.tv-dob-picker__panel');
  const year = page.locator('.tv-dob-picker__select--year');
  note(`${vpName} dob panel`, (await panel.count()) > 0, null);
  const yearCount = await year.locator('option').count();
  note(`${vpName} dob year options`, yearCount > 20, String(yearCount));
  const box = await panel.first().boundingBox();
  note(
    `${vpName} dob panel inside viewport`,
    Boolean(box && box.x >= -2 && box.y >= -2 && box.x + box.width <= 1440 + 8),
    box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'no box'
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const after = (await trigger.first().innerText()).replace(/\s+/g, ' ').trim();
  note(`${vpName} dob close keeps value`, before === after, before.slice(0, 24));
}

async function runVp(browser, sess, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.width <= 430,
    hasTouch: vp.width <= 430,
    deviceScaleFactor: vp.width <= 430 ? 2 : 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const actions = [];
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    const url = req.url();
    if (!url.includes('connect-supplier-onboarding') && !url.includes('api.stripe.com')) return;
    let action = url.includes('api.stripe.com') ? `stripe:${url.split('api.stripe.com')[1]?.slice(0, 80)}` : 'unknown';
    try {
      const body = req.postDataJSON();
      if (body && typeof body.action === 'string') action = body.action;
    } catch {
      /* ignore */
    }
    actions.push(action);
    report.actions.push({ vp: vp.name, action });
  });
  try {
    await inject(page, sess);
    const seen = [];
    let businessLegal = '';
    for (const phase of PHASES) {
      const navs = [];
      const onNav = (frame) => {
        if (frame === page.mainFrame()) navs.push(page.url());
      };
      page.on('framenavigated', onNav);
      const samples = [];
      await page.goto(`${PARTNER}/partner/onboarding?phase=${phase}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForSelector('[data-cert="p951"]', { timeout: 30000 });
      await page.waitForFunction(
        () => {
          const text = document.body?.innerText || '';
          return /Get ready to host|Verified|Identity|Business verification|Documents/.test(text);
        },
        { timeout: 30000 }
      );
      for (let i = 0; i < 8; i++) {
        samples.push(await page.evaluate(() => (document.body?.innerText || '').trim().length));
        await page.waitForTimeout(150);
      }
      if (phase === 'representative' || phase === 'status') {
        await page
          .waitForFunction(
            () => {
              const text = document.body?.innerText || '';
              if (/Failed to send a request/i.test(text)) return true;
              const frame = document.querySelector('.tv-connect-embed iframe[src*="connect-js.stripe.com"]');
              if (!frame) return /date of birth/i.test(text);
              const rect = frame.getBoundingClientRect();
              return rect.height > 200 && rect.width > 200 && !/Loading secure verification/i.test(text);
            },
            { timeout: 25000 }
          )
          .catch(() => {});
      }
      page.off('framenavigated', onNav);
      const url = page.url();
      const phaseOk = url.includes(`phase=${phase}`) || (phase === 'business' && /\/partner\/onboarding/.test(url));
      note(`${vp.name} ${phase} url`, phaseOk && !url.includes('/login'), url);
      const dipped = samples.some((n, i) => i > 1 && samples[i - 1] > 160 && n < 30);
      note(`${vp.name} ${phase} no blank flash`, !dipped && samples[samples.length - 1] > 80, `min=${Math.min(...samples)}`);
      const extraNav = navs.filter((u) => u.includes('/partner/') && !u.includes(`phase=${phase}`));
      note(`${vp.name} ${phase} no nav loop`, extraNav.length === 0, extraNav.join(' | ') || 'stable');
      const box = await layout(page);
      note(`${vp.name} ${phase} no horizontal overflow`, box.overflowX <= 2 && box.wide.length === 0, box.wide);
      note(
        `${vp.name} ${phase} type scale`,
        Boolean(box.h1) && parseFloat(box.h1Size) >= 18 && parseFloat(box.ledeSize || '14') >= 13,
        `${box.h1Size}/${box.ledeSize} ${box.h1}`
      );
      const clippedWithoutScroll = box.clip.some((c) => c.scroll > c.client + 24 && c.overflowY === 'hidden');
      note(`${vp.name} ${phase} content scrollable`, !clippedWithoutScroll, box.clip);
      if (phase === 'business') {
        seen.push(box.inputs.map((i) => `${i.label}:${i.value}`).join('|') || box.preview);
        const legal = await page.evaluate(() => {
          const terms = [...document.querySelectorAll('dt')];
          const legalDt = terms.find((el) => /legal name/i.test(el.textContent || ''));
          const dd = legalDt?.nextElementSibling;
          return (dd?.textContent || '').replace(/\s+/g, ' ').trim();
        });
        businessLegal = legal;
        note(
          `${vp.name} company values shown`,
          legal.length > 1 && legal !== '—' && legal !== '-',
          legal ? `len=${legal.length}` : box.h1
        );
      }
      if (phase === 'representative') {
        const embedBox = await page.evaluate(() => {
          const frame = document.querySelector('.tv-connect-embed iframe[src*="connect-js.stripe.com"]');
          if (!frame) return null;
          const rect = frame.getBoundingClientRect();
          return { w: Math.round(rect.width), h: Math.round(rect.height) };
        });
        note(
          `${vp.name} identity surface`,
          box.dob > 0 || (embedBox && embedBox.h > 200 && !/Loading secure verification|Failed to send a request/i.test(box.preview)),
          embedBox ? `${embedBox.w}x${embedBox.h}` : `dob=${box.dob}`
        );
        const focusRing = await page.evaluate(() => {
          const h1 = document.querySelector('h1');
          if (!h1 || document.activeElement !== h1) return 'unfocused';
          const style = getComputedStyle(h1);
          return `${style.outlineStyle} ${style.outlineWidth}`;
        });
        note(`${vp.name} identity title unfocused`, focusRing === 'unfocused' || /none/.test(focusRing), focusRing);
        if (box.dob > 0) await openDob(page, vp.name);
        if (box.ownership > 0) {
          note(`${vp.name} ownership stepper`, true, null);
        }
      }
      if (phase === 'status') {
        note(
          `${vp.name} verification status`,
          /verification|action required|receive/i.test(box.preview) && !/Setup finished/i.test(box.preview),
          box.preview.slice(0, 160)
        );
      }
      await page.screenshot({ path: resolve(OUT, `${vp.name}-${phase}.png`), fullPage: false });

      const beforeReload = url;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const after = page.url();
      note(
        `${vp.name} ${phase} refresh resume`,
        after.includes(`phase=${phase}`) || (beforeReload.includes(`phase=${phase}`) && after.includes('/partner/onboarding')),
        after
      );
      if (phase === 'business') {
        const again = await layout(page);
        const signature = again.inputs.map((i) => `${i.label}:${i.value}`).join('|');
        const legalAgain = await page.evaluate(() => {
          const terms = [...document.querySelectorAll('dt')];
          const legalDt = terms.find((el) => /legal name/i.test(el.textContent || ''));
          return (legalDt?.nextElementSibling?.textContent || '').replace(/\s+/g, ' ').trim();
        });
        note(
          `${vp.name} business values persist`,
          legalAgain.length > 1 && legalAgain === businessLegal,
          `len=${legalAgain.length}`
        );
      }
    }
    const forbidden = actions.filter((a) => FORBIDDEN_ACTIONS.has(a) || /accounts$/i.test(a));
    note(`${vp.name} no account create or kyc submit`, forbidden.length === 0, actions.join(','));
  } catch (err) {
    note(`${vp.name} fatal`, false, String(err?.message || err));
  } finally {
    await context.close();
  }
}

const PROFILE_COLS =
  'id, company_legal_name, verification_status, stripe_connected_account_id, connect_account_type, connect_account_livemode, connect_onboarding_status, connect_charges_enabled, connect_payouts_enabled, connect_details_submitted, connect_requirements_currently_due, connect_requirements_past_due, payout_wizard_draft, payout_wizard_draft_updated_at, setup_progress, setup_progress_updated_at';

const { data: before, error: beforeErr } = await admin
  .from('supplier_profiles')
  .select(PROFILE_COLS)
  .eq('id', SUPPLIER_ID)
  .single();
if (beforeErr) throw new Error(beforeErr.message);

const { data: flagsBefore } = await admin
  .from('commercial_runtime_config')
  .select('key,value_int')
  .in('key', [
    'live_custom_onboarding_enabled',
    'payout_execution_enabled',
    'stripe_connect_transfers_enabled',
  ]);

const { count: accountsBefore } = await admin
  .from('supplier_profiles')
  .select('id', { count: 'exact', head: true })
  .eq('stripe_connected_account_id', ACCOUNT);

note('baseline connect account', before.stripe_connected_account_id === ACCOUNT, before.connect_onboarding_status);
note(
  'baseline money gates off',
  (flagsBefore ?? []).every((f) => Number(f.value_int) === 0),
  flagsBefore
);
note('baseline single connect row', accountsBefore === 1, String(accountsBefore));

const sess = await session();
const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    await runVp(browser, sess, vp);
  }
} finally {
  await browser.close();
}

const { data: after } = await admin.from('supplier_profiles').select(PROFILE_COLS).eq('id', SUPPLIER_ID).single();
const { data: flagsAfter } = await admin
  .from('commercial_runtime_config')
  .select('key,value_int')
  .in('key', [
    'live_custom_onboarding_enabled',
    'payout_execution_enabled',
    'stripe_connect_transfers_enabled',
  ]);
const { count: accountsAfter } = await admin
  .from('supplier_profiles')
  .select('id', { count: 'exact', head: true })
  .eq('stripe_connected_account_id', ACCOUNT);

const stableKeys = [
  'company_legal_name',
  'verification_status',
  'stripe_connected_account_id',
  'connect_account_type',
  'connect_account_livemode',
  'connect_onboarding_status',
  'connect_charges_enabled',
  'connect_payouts_enabled',
  'connect_details_submitted',
];
const drifted = stableKeys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
note('profile identity unchanged', drifted.length === 0, drifted.join(',') || 'stable');
note(
  'money gates unchanged',
  JSON.stringify(flagsBefore) === JSON.stringify(flagsAfter),
  flagsAfter
);
note('no duplicate connect account', accountsAfter === 1 && accountsAfter === accountsBefore, String(accountsAfter));

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
  note(
    'autosave side effect restored',
    !restoreErr,
    `draft=${draftChanged} progress=${progressChanged} ${restoreErr?.message ?? 'restored'}`
  );
} else {
  note('wizard draft unchanged', true, 'no restore needed');
}

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.length === 0 ? 'PASS' : 'FAIL';
report.failed = failed.map((c) => c.name);
const md = `# P9.51 — Full production onboarding certification

| | |
|---|---|
| **Date** | ${report.at.slice(0, 10)} |
| **Supplier** | EM Global Oy (\`${SUPPLIER_ID}\`) |
| **Connect** | \`${ACCOUNT}\` ${before.connect_account_livemode ? 'LIVE' : 'not live'} / ${before.connect_onboarding_status ?? 'unknown'} |
| **Money gates** | unchanged |
| **KYC submitted** | no |
| **Verdict** | **${report.verdict}** (${failed.length} failed of ${report.checks.length}) |

## Failed checks

${failed.length ? failed.map((c) => `- ${c.name}: ${typeof c.detail === 'string' ? c.detail : JSON.stringify(c.detail)}`).join('\n') : '- none'}

Screenshots: \`scripts/p951-screenshots/\`.
`;
writeFileSync(resolve(process.cwd(), 'scripts/cert-p951-production-onboarding.report.json'), JSON.stringify(report, null, 2));
writeFileSync(resolve(process.cwd(), 'scripts/cert-p951-production-onboarding.report.md'), md);
console.log('\nVERDICT', report.verdict, `(${failed.length} failed of ${report.checks.length})`);
process.exit(failed.length ? 1 : 0);
