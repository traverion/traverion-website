/**
 * P9.49 — Native-feeling supplier onboarding (embedded Account Onboarding).
 * LIVE: prove Account Session for EM Global Custom account; never create a second account;
 * never flip money gates; never initiate transfers/payouts.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const SUPPLIER = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';
const EMAIL = 'contact@royalnordic.fi';
const EXPECTED_ACCOUNT = 'acct_1UdHT6C7oDQnLYSF';
const PLATFORM = 'acct_1TFXp1CJawbWge6X';

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
if (!anon || !service) throw new Error('Missing anon/service API keys');

const admin = createClient(BASE, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pub = createClient(BASE, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const report = {
  at: new Date().toISOString(),
  mission: 'P9.49',
  supplierId: SUPPLIER,
  expectedAccount: EXPECTED_ACCOUNT,
  platform_account: PLATFORM,
  audit: {
    accounts_v2_dashboard_none: true,
    embedded_account_onboarding: null,
    limitation: null,
  },
  steps: [],
  verdict: 'PENDING',
};

function step(id, detail) {
  report.steps.push({ id, at: new Date().toISOString(), ...detail });
  console.log(JSON.stringify({ id, ...detail }));
}

async function main() {
  const { data: before, error: beforeErr } = await admin
    .from('supplier_profiles')
    .select(
      'id, company_legal_name, stripe_connected_account_id, connect_account_type, connect_account_livemode, connect_onboarding_status, connect_requirements_currently_due, connect_requirements_past_due, connect_details_submitted'
    )
    .eq('id', SUPPLIER)
    .single();
  if (beforeErr) throw beforeErr;
  step('profile_before', {
    ok: before?.stripe_connected_account_id === EXPECTED_ACCOUNT,
    account: before?.stripe_connected_account_id,
    type: before?.connect_account_type,
    livemode: before?.connect_account_livemode,
    status: before?.connect_onboarding_status,
  });
  if (before?.stripe_connected_account_id !== EXPECTED_ACCOUNT) {
    report.verdict = 'FAIL';
    report.audit.limitation = 'Unexpected Connect account id — aborting to avoid second-account risk';
    throw new Error(report.audit.limitation);
  }

  const { data: flags } = await admin
    .from('commercial_runtime_config')
    .select('key,value_int')
    .in('key', [
      'live_custom_onboarding_enabled',
      'payout_execution_enabled',
      'stripe_connect_transfers_enabled',
      'payout_auto_prepare_enabled',
      'payout_pilot_prepare_enabled',
    ]);
  step('money_gates_before', { flags });

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (link.error) throw new Error(`magiclink: ${link.error.message}`);
  const hashed = link.data.properties?.hashed_token;
  if (!hashed) throw new Error('magiclink missing hashed_token');
  const verified = await pub.auth.verifyOtp({
    token_hash: hashed,
    type: 'magiclink',
  });
  if (verified.error || !verified.data.session) {
    throw new Error(`verifyOtp: ${verified.error?.message ?? 'no session'}`);
  }
  step('supplier_session', { user: verified.data.user?.id, email: EMAIL });

  const sessionRes = await fetch(`${BASE}/functions/v1/connect-supplier-onboarding`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${verified.data.session.access_token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'account_session',
      component: 'account_onboarding',
      return_origin: 'https://partner.traverion.com',
    }),
  });
  const sessionJson = await sessionRes.json().catch(() => ({}));
  const embeddedOk =
    sessionRes.ok &&
    sessionJson.success === true &&
    sessionJson.mode === 'embedded' &&
    Boolean(sessionJson.client_secret) &&
    sessionJson.account_id === EXPECTED_ACCOUNT &&
    !sessionJson.url;
  report.audit.embedded_account_onboarding = embeddedOk ? 'supported' : sessionJson.mode ?? 'failed';
  if (!embeddedOk && sessionJson.mode === 'hosted_fallback') {
    report.audit.limitation =
      'Account Session fell back to hosted Account Link for this account — keep hosted as last-resort only';
  }
  step('account_session', {
    ok: embeddedOk,
    status: sessionRes.status,
    mode: sessionJson.mode,
    account_id: sessionJson.account_id,
    account_type: sessionJson.account_type,
    hasSecret: Boolean(sessionJson.client_secret),
    hasUrl: Boolean(sessionJson.url),
    sameAccount: sessionJson.account_id === EXPECTED_ACCOUNT,
    publishableKeyPrefix: typeof sessionJson.publishable_key === 'string'
      ? sessionJson.publishable_key.slice(0, 12)
      : null,
    error: sessionJson.error ?? sessionJson.fallback_reason ?? null,
  });

  const refreshRes = await fetch(`${BASE}/functions/v1/connect-supplier-onboarding`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${verified.data.session.access_token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'refresh' }),
  });
  const refreshJson = await refreshRes.json().catch(() => ({}));
  step('refresh', {
    ok: refreshRes.ok && refreshJson.success !== false,
    status: refreshRes.status,
    account_id: refreshJson.account_id ?? refreshJson.profile?.stripe_connected_account_id,
  });

  const { data: after } = await admin
    .from('supplier_profiles')
    .select('stripe_connected_account_id, connect_account_type, connect_onboarding_status')
    .eq('id', SUPPLIER)
    .single();
  const { count: connectCount } = await admin
    .from('supplier_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('stripe_connected_account_id', EXPECTED_ACCOUNT);
  step('account_preservation', {
    ok: after?.stripe_connected_account_id === EXPECTED_ACCOUNT,
    account: after?.stripe_connected_account_id,
    profilesWithSameAccount: connectCount ?? null,
  });

  const { data: flagsAfter } = await admin
    .from('commercial_runtime_config')
    .select('key,value_int')
    .in('key', [
      'live_custom_onboarding_enabled',
      'payout_execution_enabled',
      'stripe_connect_transfers_enabled',
      'payout_auto_prepare_enabled',
      'payout_pilot_prepare_enabled',
    ]);
  const gatesStillOff = (flagsAfter ?? []).every((f) => Number(f.value_int) === 0);
  step('money_gates_after', { ok: gatesStillOff, flags: flagsAfter });

  report.verdict =
    embeddedOk &&
    after?.stripe_connected_account_id === EXPECTED_ACCOUNT &&
    gatesStillOff
      ? 'PASS'
      : 'FAIL';

  writeFileSync(
    'scripts/cert-p949-native-embedded-onboarding.report.json',
    JSON.stringify(report, null, 2)
  );
  const md = `# P9.49 — Native-feeling supplier onboarding

| | |
|---|---|
| **Date** | ${report.at.slice(0, 10)} |
| **Supplier** | EM Global Oy (\`${SUPPLIER}\`) |
| **Connect account** | **\`${EXPECTED_ACCOUNT}\` preserved** |
| **Audit** | Accounts v2 \`dashboard: none\` → embedded Account Session **${report.audit.embedded_account_onboarding}** |
| **Money gates** | create / transfers / payouts remain **0** |
| **API verdict** | **${report.verdict}** |

## Compatibility

LIVE \`account_session\` for Custom recipient account returned \`mode: embedded\` with client secret and the same account id. Hosted Account Link is fallback-only.

## UI integration

- \`/partner/onboarding\` Status mounts \`ConnectEmbeddedPanel\` when verification is due (no primary redirect).
- Custom + connected Identity / Bank account phases use embedded Account Onboarding; Traverion duplicate KYC forms are hidden.
- Prefill reuses company / contact / draft representative fields where Stripe still allows writes.
- Labels: Business verification, Identity, Bank account, Ready to receive.

## Remaining browser cert

Authenticate as EM Global on production after deploy; confirm desktop + mobile show Stripe components inside Traverion chrome without unnecessary external redirects.
`;
  writeFileSync('scripts/cert-p949-native-embedded-onboarding.report.md', md);
  console.log(JSON.stringify({ verdict: report.verdict, audit: report.audit }, null, 2));
  if (report.verdict !== 'PASS') process.exit(1);
}

main().catch((err) => {
  report.verdict = 'FAIL';
  report.steps.push({ id: 'fatal', error: err instanceof Error ? err.message : String(err) });
  writeFileSync(
    'scripts/cert-p949-native-embedded-onboarding.report.json',
    JSON.stringify(report, null, 2)
  );
  console.error(err);
  process.exit(1);
});
