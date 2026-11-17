#!/usr/bin/env node
/**
 * P9.22 — Complete Stripe TEST onboarding certification.
 *
 * Uses an isolated Deno edge process with sk_test_ only (http://127.0.0.1:8000).
 * Never posts TEST credentials to the production LIVE edge.
 * Writes labeled disposable supplier rows; cleans Connect IDs afterward.
 * Does not modify Royal Nordic Express (acct_1UcAxbCOlSVGqrHJ).
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import Stripe from 'stripe';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const TEST_EDGE = process.env.P922_TEST_EDGE_URL || 'http://127.0.0.1:8000';
const LIVE_EDGE = `${BASE}/functions/v1/connect-supplier-onboarding`;
const RN_EXPRESS = 'acct_1UcAxbCOlSVGqrHJ';
const stamp = Date.now().toString(36);
const EMAIL = `p922-test-${stamp}@traverion.invalid`;
const PASSWORD = `P922-Cert-${stamp}-Aa1!`;

const report = {
  mission: 'P9.22',
  createdAt: new Date().toISOString(),
  isolation: {},
  safety: {},
  journey: {},
  failures: {},
  regression: {},
  cleanup: {},
  blockers: [],
  verdict: 'FAIL',
};

function apiKeys() {
  const keys = JSON.parse(
    execSync(`npx supabase projects api-keys --project-ref ${PROJECT} -o json`, {
      encoding: 'utf8',
    })
  );
  return {
    anon: keys.find((k) => k.name === 'anon')?.api_key,
    service: keys.find((k) => k.name === 'service_role')?.api_key,
  };
}

function localStripe() {
  const env = readFileSync('.env', 'utf8');
  const sk = env.match(/^STRIPE_SECRET_KEY=(.+)$/m)?.[1]?.trim();
  if (!sk?.startsWith('sk_test_')) throw new Error('Local .env must contain sk_test_');
  return new Stripe(sk, { apiVersion: '2024-11-20.acacia' });
}

async function invokeEdge(url, { token, anon, action, body = {}, headers = {} }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'X-Forwarded-For': '203.0.113.50',
      ...headers,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { success: false, error: text.slice(0, 400), raw: true };
  }
  return { status: res.status, json };
}

/** Tiny valid JPEG (1x1) for identity upload — not stored in Traverion. */
function tinyJpegBase64() {
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFRUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAADBAECBQYAB//EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A1oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/2Q==',
    'base64'
  ).toString('base64');
}

async function main() {
  mkdirSync('scripts', { recursive: true });
  const { anon, service } = apiKeys();
  const stripe = localStripe();
  const admin = createClient(BASE, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userClient = createClient(BASE, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Safety flags (must remain OFF) ---
  const { data: flags } = await admin
    .from('commercial_runtime_config')
    .select('key,value_int')
    .in('key', [
      'live_custom_onboarding_enabled',
      'payout_execution_enabled',
      'stripe_connect_transfers_enabled',
    ]);
  const flagMap = Object.fromEntries((flags ?? []).map((r) => [r.key, r.value_int]));
  report.safety.flags = flagMap;
  if (flagMap.live_custom_onboarding_enabled !== 0) {
    report.blockers.push('LIVE custom onboarding unexpectedly enabled');
  }
  if (flagMap.payout_execution_enabled !== 0 || flagMap.stripe_connect_transfers_enabled !== 0) {
    report.blockers.push('Payout/transfer execution unexpectedly enabled');
  }

  // --- Isolation: production LIVE vs local TEST ---
  const probeUser = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      partner_signup: true,
      full_name: 'P922 TEST Cert',
      p922_isolated_test: true,
    },
  });
  if (probeUser.error || !probeUser.data.user) throw probeUser.error || new Error('user create failed');
  const userId = probeUser.data.user.id;
  report.isolation.supplier = {
    email: EMAIL,
    userId,
    label: 'P922 isolated Stripe TEST supplier — not for LIVE',
  };

  await admin.from('supplier_profiles').upsert({
    id: userId,
    display_name: 'P922 TEST Supplier Oy',
    company_legal_name: 'P922 TEST Supplier Oy',
    business_type: 'company',
    company_registration_number: '1234567-1',
    vat_id: 'FI12345671',
    address_street: 'Mannerheimintie 1',
    address_city: 'Helsinki',
    address_postal_code: '00100',
    address_country: 'FI',
    business_address: 'Mannerheimintie 1, 00100 Helsinki, FI',
    contact_phone: `+35840${String(Date.now()).slice(-7)}`,
    managing_directors: 'Director Alpha\nDirector Beta',
    verification_status: 'pending',
    verification_submitted_at: new Date().toISOString(),
    payment_cycle: 'monthly',
    payout_threshold_min: 50,
  });
  await admin.from('supplier_team_members').upsert({
    supplier_id: userId,
    user_id: userId,
    role: 'owner',
    label: 'P922 TEST Primary',
  });

  const { data: auth, error: signErr } = await userClient.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signErr || !auth.session) throw signErr || new Error('sign-in failed');
  const token = auth.session.access_token;

  const liveStatus = await invokeEdge(LIVE_EDGE, { token, anon, action: 'status' });
  report.isolation.production_edge = {
    url: LIVE_EDGE,
    environment: liveStatus.json?.environment ?? null,
    success: liveStatus.json?.success ?? false,
    note: 'Must remain LIVE — never send sk_test_ here',
  };
  if (liveStatus.json?.environment !== 'live') {
    report.blockers.push('Production edge environment is not live as expected');
  }

  let testStatus;
  try {
    testStatus = await invokeEdge(TEST_EDGE, { token, anon, action: 'status' });
  } catch (e) {
    report.blockers.push(`TEST edge unreachable at ${TEST_EDGE}: ${e.message}`);
    report.verdict = 'FAIL';
    writeFileSync('scripts/cert-p922-test-onboarding.report.json', JSON.stringify(report, null, 2));
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.isolation.test_edge = {
    url: TEST_EDGE,
    environment: testStatus.json?.environment ?? null,
    success: testStatus.json?.success ?? false,
    note: 'Deno local serve with sk_test_ + production Supabase auth/DB',
  };
  if (testStatus.json?.environment !== 'test') {
    report.blockers.push(
      `TEST edge environment=${testStatus.json?.environment} (expected test). Refusing to continue.`
    );
    report.verdict = 'FAIL';
    writeFileSync('scripts/cert-p922-test-onboarding.report.json', JSON.stringify(report, null, 2));
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // LIVE gate still refuses create on production edge
  const liveEnsure = await invokeEdge(LIVE_EDGE, { token, anon, action: 'ensure_account' });
  report.safety.live_ensure_blocked = {
    status: liveEnsure.status,
    error: liveEnsure.json?.error ?? null,
    ok:
      /LIVE payout account creation is turned off|not approved for LIVE/i.test(
        liveEnsure.json?.error ?? ''
      ) || liveEnsure.json?.success === false,
  };

  // --- Royal Nordic snapshot (read-only) ---
  const { data: rnBefore } = await admin
    .from('supplier_profiles')
    .select(
      'id,display_name,stripe_connected_account_id,connect_account_type,connect_account_livemode,connect_onboarding_status,updated_at'
    )
    .eq('stripe_connected_account_id', RN_EXPRESS)
    .maybeSingle();
  report.regression.royal_nordic_before = rnBefore;

  // ========== JOURNEY ==========
  const call = (action, body) => invokeEdge(TEST_EDGE, { token, anon, action, body });

  // 1) Business from profile
  const business = await call('submit_business', {
    business: {
      legal_name: 'P922 TEST Supplier Oy',
      business_type: 'company',
      registration_number: '1234567-1',
      tax_id: 'FI12345671',
      phone: '+358401234567',
      url: 'https://traverion.com',
      address: {
        line1: 'Mannerheimintie 1',
        city: 'Helsinki',
        postal_code: '00100',
        country: 'FI',
      },
    },
  });
  // ensure happens inside submit — also explicit ensure for idempotency tests
  const ensure1 = await call('ensure_account');
  const ensure2 = await call('ensure_account');
  report.journey.ensure = {
    first: { success: ensure1.json?.success, account_id: ensure1.json?.account_id },
    second: { success: ensure2.json?.success, account_id: ensure2.json?.account_id },
    same_account:
      Boolean(ensure1.json?.account_id) &&
      ensure1.json?.account_id === ensure2.json?.account_id,
  };
  report.journey.business = {
    success: business.json?.success ?? ensure1.json?.success,
    error: business.json?.error ?? null,
    account_id: ensure1.json?.account_id ?? business.json?.account_id,
    environment: ensure1.json?.environment,
    livemode: ensure1.json?.onboarding?.connect_account_livemode ?? null,
  };

  const accountId = ensure1.json?.account_id;
  if (!accountId) {
    report.blockers.push(`ensure_account failed: ${ensure1.json?.error || business.json?.error}`);
  }

  // 2) Representative
  const rep = await call('submit_representative', {
    representative: {
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada.p922@traverion.invalid',
      phone: '+358401111111',
      title: 'CEO',
      dob: { day: 15, month: 1, year: 1990 },
      address: {
        line1: 'Mannerheimintie 1',
        city: 'Helsinki',
        postal_code: '00100',
        country: 'FI',
      },
      relationship: {
        owner: true,
        percent_ownership: 40,
        executive: true,
        director: false,
      },
    },
  });
  report.journey.representative = {
    success: rep.json?.success,
    person_id: rep.json?.person_id,
    error: rep.json?.error ?? null,
  };

  // 3) Multiple beneficial owners
  const owners = await call('submit_beneficial_owners', {
    owners: [
      {
        first_name: 'Grace',
        last_name: 'Hopper',
        email: 'grace.p922@traverion.invalid',
        dob: { day: 5, month: 5, year: 1985 },
        percent_ownership: 35,
        address: {
          line1: 'Mannerheimintie 1',
          city: 'Helsinki',
          postal_code: '00100',
          country: 'FI',
        },
      },
      {
        first_name: 'Alan',
        last_name: 'Turing',
        email: 'alan.p922@traverion.invalid',
        dob: { day: 6, month: 6, year: 1988 },
        percent_ownership: 25,
        address: {
          line1: 'Mannerheimintie 1',
          city: 'Helsinki',
          postal_code: '00100',
          country: 'FI',
        },
      },
    ],
  });
  report.journey.owners = {
    success: owners.json?.success,
    person_ids: owners.json?.person_ids ?? null,
    error: owners.json?.error ?? null,
  };

  // Duplicate owners submit (upsert by name) — should not explode
  const ownersDup = await call('submit_beneficial_owners', {
    owners: [
      {
        first_name: 'Grace',
        last_name: 'Hopper',
        email: 'grace.p922@traverion.invalid',
        dob: { day: 5, month: 5, year: 1985 },
        percent_ownership: 35,
        address: {
          line1: 'Mannerheimintie 1',
          city: 'Helsinki',
          postal_code: '00100',
          country: 'FI',
        },
      },
    ],
  });
  report.failures.duplicate_owners_submit = {
    success: ownersDup.json?.success,
    error: ownersDup.json?.error ?? null,
  };

  // 4) Identity document upload (supported Traverion → Stripe Files path)
  const personId = rep.json?.person_id;
  let identity = { success: false, error: 'no person_id' };
  if (personId) {
    identity = (
      await call('upload_identity_document', {
        identity_upload: {
          person_id: personId,
          side: 'front',
          filename: 'p922-id-front.jpg',
          content_type: 'image/jpeg',
          content_base64: tinyJpegBase64(),
        },
      })
    ).json;
  }
  report.journey.identity = {
    success: identity.success,
    file_id: identity.file_id ?? null,
    error: identity.error ?? null,
  };

  // Incomplete identity: requirements still may list docs — capture after refresh
  const afterIdentity = await call('refresh');
  report.journey.requirements_after_identity = {
    currently_due: afterIdentity.json?.onboarding?.connect_requirements_currently_due ?? null,
    onboarding_status: afterIdentity.json?.onboarding?.connect_onboarding_status ?? null,
    can_receive: afterIdentity.json?.can_receive_transfers ?? null,
  };

  // 5) Bank — valid tokenized attach + invalid retry
  let bankValid = { success: false };
  let bankInvalid = { success: false };
  try {
    const badToken = await stripe.tokens.create({
      bank_account: {
        country: 'FI',
        currency: 'eur',
        account_holder_name: 'P922 TEST Supplier Oy',
        account_holder_type: 'company',
        account_number: 'FI00INVALID000000',
      },
    });
    bankInvalid = (await call('attach_bank_token', { bank_token: badToken.id })).json;
  } catch (e) {
    bankInvalid = { success: false, error: e.message, note: 'token create rejected invalid IBAN (expected)' };
  }
  report.failures.invalid_bank = bankInvalid;

  try {
    const goodToken = await stripe.tokens.create({
      bank_account: {
        country: 'FI',
        currency: 'eur',
        account_holder_name: 'P922 TEST Supplier Oy',
        account_holder_type: 'company',
        account_number: 'FI2112345600000785',
      },
    });
    bankValid = (await call('attach_bank_token', { bank_token: goodToken.id })).json;
  } catch (e) {
    bankValid = { success: false, error: e.message };
  }
  report.journey.bank = {
    success: bankValid.success,
    bank_attached: bankValid.bank_attached ?? null,
    error: bankValid.error ?? null,
  };

  // Replace bank (second valid token) — same account
  try {
    const replaceToken = await stripe.tokens.create({
      bank_account: {
        country: 'FI',
        currency: 'eur',
        account_holder_name: 'P922 TEST Supplier Oy',
        account_holder_type: 'company',
        account_number: 'FI2112345600000785',
      },
    });
    const replace = await call('attach_bank_token', { bank_token: replaceToken.id });
    report.failures.bank_replace_same_account = {
      success: replace.json?.success,
      account_id: replace.json?.account_id,
      same_as_ensure: replace.json?.account_id === accountId,
      error: replace.json?.error ?? null,
    };
  } catch (e) {
    report.failures.bank_replace_same_account = { success: false, error: e.message };
  }

  // 6) Preferences (profile — not Stripe)
  const pref = await admin
    .from('supplier_profiles')
    .update({
      payment_cycle: 'biweekly',
      payout_threshold_min: 75,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('payment_cycle,payout_threshold_min')
    .maybeSingle();
  report.journey.preferences = { success: !pref.error, data: pref.data, error: pref.error?.message };

  // 7) Agreements
  const agreementVersion =
    readFileSync('src/lib/stripe-recipient-agreement.ts', 'utf8').match(
      /version:\s*['"]([^'"]+)['"]/
    )?.[1] || 'stripe-recipient-notice-2026-11-16';
  const tosResult = (
    await call('accept_tos', {
      tos_accepted: true,
      agreement_version: agreementVersion,
    })
  ).json;
  report.journey.agreement = {
    success: tosResult.success,
    error: tosResult.error ?? null,
  };

  // Network interruption simulation
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5);
    await fetch(TEST_EDGE, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: anon,
      },
      body: JSON.stringify({ action: 'status' }),
    });
    clearTimeout(t);
    report.failures.network_abort = { aborted: false };
  } catch (e) {
    report.failures.network_abort = {
      aborted: /abort/i.test(e.name || '') || /abort/i.test(e.message || ''),
      name: e.name,
    };
  }
  const afterAbort = await call('status');
  report.failures.retry_after_abort = {
    success: afterAbort.json?.success,
    same_account: afterAbort.json?.account_id === accountId,
  };

  // 8) Read back requirements & capabilities
  const finalStatus = await call('refresh');
  report.journey.final_status = {
    success: finalStatus.json?.success,
    environment: finalStatus.json?.environment,
    account_id: finalStatus.json?.account_id,
    account_type: finalStatus.json?.account_type,
    can_receive_transfers: finalStatus.json?.can_receive_transfers,
    onboarding_status: finalStatus.json?.onboarding?.connect_onboarding_status,
    livemode: finalStatus.json?.onboarding?.connect_account_livemode,
    currently_due: finalStatus.json?.onboarding?.connect_requirements_currently_due,
    charges_enabled: finalStatus.json?.onboarding?.connect_charges_enabled,
    payouts_enabled: finalStatus.json?.onboarding?.connect_payouts_enabled,
    details_submitted: finalStatus.json?.onboarding?.connect_details_submitted,
  };

  // Stripe direct retrieve for capability evidence
  if (accountId) {
    const acct = await stripe.accounts.retrieve(accountId);
    report.journey.stripe_account = {
      id: acct.id,
      livemode: acct.livemode,
      type: acct.type,
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      details_submitted: acct.details_submitted,
      currently_due: acct.requirements?.currently_due ?? [],
      disabled_reason: acct.requirements?.disabled_reason ?? null,
      capabilities: acct.capabilities ?? null,
    };
    const persons = await stripe.accounts.listPersons(accountId, { limit: 20 });
    report.journey.stripe_persons = persons.data.map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      representative: p.relationship?.representative ?? false,
      owner: p.relationship?.owner ?? false,
      director: p.relationship?.director ?? false,
      percent_ownership: p.relationship?.percent_ownership ?? null,
    }));
  }

  // Verified label rule: never claim Verified unless livemode + can receive
  const claimedVerified =
    finalStatus.json?.can_receive_transfers === true &&
    finalStatus.json?.onboarding?.connect_account_livemode === true;
  report.journey.verified_claim_allowed = claimedVerified;
  report.journey.must_not_show_live_verified_for_test =
    finalStatus.json?.onboarding?.connect_account_livemode !== true;

  // ========== RN regression ==========
  const { data: rnAfter } = await admin
    .from('supplier_profiles')
    .select(
      'id,display_name,stripe_connected_account_id,connect_account_type,connect_account_livemode,connect_onboarding_status,updated_at'
    )
    .eq('stripe_connected_account_id', RN_EXPRESS)
    .maybeSingle();
  report.regression.royal_nordic_after = rnAfter;
  report.regression.royal_nordic_unchanged =
    Boolean(rnBefore?.stripe_connected_account_id) &&
    rnBefore?.stripe_connected_account_id === rnAfter?.stripe_connected_account_id &&
    rnBefore?.connect_account_type === rnAfter?.connect_account_type &&
    String(rnBefore?.updated_at) === String(rnAfter?.updated_at);

  // Existing-account path: ensure again still same id
  const ensure3 = await call('ensure_account');
  report.regression.existing_account_path = {
    success: ensure3.json?.success,
    account_id: ensure3.json?.account_id,
    same_account: ensure3.json?.account_id === accountId,
  };

  // ========== Cleanup ==========
  // Clear TEST connect link from production DB so LIVE edge never sees it.
  const { error: clearErr } = await admin
    .from('supplier_profiles')
    .update({
      stripe_connected_account_id: null,
      connect_account_type: null,
      connect_account_livemode: null,
      connect_onboarding_status: 'not_started',
      connect_charges_enabled: false,
      connect_payouts_enabled: false,
      connect_details_submitted: false,
      connect_requirements_currently_due: [],
      connect_requirements_past_due: [],
      connect_disabled_reason: 'p922_test_cert_cleaned',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  report.cleanup.profile_cleared = !clearErr;
  report.cleanup.profile_error = clearErr?.message ?? null;

  if (accountId) {
    try {
      await stripe.accounts.del(accountId);
      report.cleanup.stripe_account_deleted = true;
    } catch (e) {
      report.cleanup.stripe_account_deleted = false;
      report.cleanup.stripe_delete_error = e.message;
    }
  }

  // Verdict
  const journeyOk =
    report.journey.ensure?.same_account &&
    report.journey.representative?.success &&
    report.journey.owners?.success &&
    report.journey.bank?.success &&
    report.journey.agreement?.success &&
    report.journey.preferences?.success &&
    report.isolation.test_edge?.environment === 'test' &&
    report.isolation.production_edge?.environment === 'live' &&
    report.safety.live_ensure_blocked?.ok &&
    report.regression.existing_account_path?.same_account &&
    report.journey.must_not_show_live_verified_for_test;

  const identityOk = report.journey.identity?.success === true;
  const rnOk =
    report.regression.royal_nordic_unchanged !== false || !report.regression.royal_nordic_before;

  if (journeyOk && identityOk && rnOk && report.blockers.length === 0) {
    report.verdict = 'PASS';
  } else if (journeyOk && report.blockers.length === 0) {
    report.verdict = 'PARTIAL PASS';
    if (!identityOk) report.blockers.push('Identity document upload did not succeed');
    if (!rnOk) report.blockers.push('Royal Nordic regression check inconclusive or changed');
  } else {
    report.verdict = 'FAIL';
  }

  writeFileSync('scripts/cert-p922-test-onboarding.report.json', JSON.stringify(report, null, 2));
  writeFileSync(
    'scripts/cert-p922-disposable.credentials.json',
    JSON.stringify(
      { email: EMAIL, password: PASSWORD, userId, note: 'P922 TEST cert disposable' },
      null,
      2
    )
  );
  console.log(JSON.stringify({ verdict: report.verdict, blockers: report.blockers, journey: report.journey, isolation: report.isolation }, null, 2));
}

main().catch((e) => {
  report.blockers.push(e.message);
  report.verdict = 'FAIL';
  writeFileSync('scripts/cert-p922-test-onboarding.report.json', JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
