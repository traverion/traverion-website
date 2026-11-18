/**
 * P9.47 — Retry first LIVE Connect activation for EM Global Oy.
 * Opens temporary gate+EM allowlist, ensure_account once (+idempotent reuse),
 * account_link, then ALWAYS closes gate/allowlist. Never touches transfers/payouts.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const SUPPLIER = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';
const EMAIL = 'contact@royalnordic.fi';

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
  mission: 'P9.47',
  supplierId: SUPPLIER,
  platform_account: 'acct_1TFXp1CJawbWge6X',
  authorization:
    'User confirmed LIVE Platform Profile acknowledged; authorized temporary live_custom_onboarding_enabled + EM Global-only allowlist; close immediately after; transfers/payouts stay off.',
  steps: [],
};

function step(id, detail) {
  report.steps.push({ id, at: new Date().toISOString(), ...detail });
  console.log(JSON.stringify({ id, ...detail }));
}

let windowOpen = false;

async function closeWindow(reason) {
  await admin.from('live_custom_onboarding_allowlist').delete().eq('supplier_id', SUPPLIER);
  await admin.from('live_custom_onboarding_allowlist').delete().neq('supplier_id', '00000000-0000-0000-0000-000000000000');
  await admin
    .from('commercial_runtime_config')
    .update({ value_int: 0, updated_at: new Date().toISOString() })
    .eq('key', 'live_custom_onboarding_enabled');
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
  const { count: allowCount } = await admin
    .from('live_custom_onboarding_allowlist')
    .select('*', { count: 'exact', head: true });
  step('close_window', {
    reason,
    flags,
    allowlistCount: allowCount ?? 0,
  });
  await admin.from('financial_audit_log').insert({
    action: 'p947_live_create_window_closed',
    supplier_id: SUPPLIER,
    amount_minor: 0,
    currency: 'EUR',
    reason: `P9.47 create window closed (${reason})`,
    after_state: {
      gate: 0,
      allowlisted: false,
      transfers: 0,
      payouts: 0,
      reason,
    },
  });
  windowOpen = false;
}

async function invoke(token, action, extra = {}) {
  const res = await fetch(`${BASE}/functions/v1/connect-supplier-onboarding`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      returnOrigin: 'https://partner.traverion.com',
      ...extra,
    }),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = { raw: await res.text() };
  }
  return { status: res.status, json };
}

try {
  const { data: before } = await admin
    .from('supplier_profiles')
    .select(
      'verification_status, company_registration_document_path, stripe_connected_account_id, connect_legacy_account_id, connect_create_claimed_at, company_legal_name, business_type, address_country'
    )
    .eq('id', SUPPLIER)
    .single();
  const { data: pilot } = await admin
    .from('live_accounts_v2_pilot_approvals')
    .select('owner_confirmed, stripe_verification_acknowledged')
    .eq('supplier_id', SUPPLIER)
    .maybeSingle();
  const { data: flagsBefore } = await admin
    .from('commercial_runtime_config')
    .select('key,value_int')
    .in('key', [
      'live_custom_onboarding_enabled',
      'payout_execution_enabled',
      'stripe_connect_transfers_enabled',
      'payout_auto_prepare_enabled',
      'payout_pilot_prepare_enabled',
    ]);
  const flagMap = Object.fromEntries((flagsBefore ?? []).map((r) => [r.key, r.value_int]));

  const prereqs = {
    verified: before.verification_status === 'verified',
    hasDoc: Boolean(before.company_registration_document_path),
    pilotOk: Boolean(pilot?.owner_confirmed && pilot?.stripe_verification_acknowledged),
    noAccount: !before.stripe_connected_account_id,
    noLegacy: !before.connect_legacy_account_id,
    noClaim: !before.connect_create_claimed_at,
    transfersOff: flagMap.stripe_connect_transfers_enabled === 0,
    payoutsOff: flagMap.payout_execution_enabled === 0,
    autoPrepareOff: flagMap.payout_auto_prepare_enabled === 0,
    pilotPrepareOff: flagMap.payout_pilot_prepare_enabled === 0,
    gateOff: flagMap.live_custom_onboarding_enabled === 0,
    fi: (before.address_country || '').toUpperCase() === 'FI',
  };
  step('revalidate', { prereqs, before, pilot, flagMap });

  if (
    !prereqs.verified ||
    !prereqs.hasDoc ||
    !prereqs.pilotOk ||
    !prereqs.transfersOff ||
    !prereqs.payoutsOff ||
    !prereqs.autoPrepareOff ||
    !prereqs.fi
  ) {
    throw new Error(`Prerequisites failed: ${JSON.stringify(prereqs)}`);
  }

  // If account already exists, skip create window and only sync/link.
  if (!prereqs.noAccount) {
    step('reuse_existing', {
      account_id: before.stripe_connected_account_id,
      note: 'EM Global already has Connect id — no create window opened',
    });
    report.overall = 'REUSE_EXISTING';
    report.stripe_result = { account_id: before.stripe_connected_account_id, created: false };
  } else {
    const { error: aErr } = await admin
      .from('live_custom_onboarding_allowlist')
      .upsert({ supplier_id: SUPPLIER });
    if (aErr) throw new Error(`allowlist: ${aErr.message}`);
    const { error: gErr } = await admin
      .from('commercial_runtime_config')
      .update({ value_int: 1, updated_at: new Date().toISOString() })
      .eq('key', 'live_custom_onboarding_enabled');
    if (gErr) throw new Error(`gate: ${gErr.message}`);
    windowOpen = true;
    step('open_window', { ok: true });
    await admin.from('financial_audit_log').insert({
      action: 'p947_live_create_window_opened',
      supplier_id: SUPPLIER,
      amount_minor: 0,
      currency: 'EUR',
      reason: 'P9.47 authorized temporary LIVE Connect create window for EM Global Oy',
      after_state: { gate: 1, allowlisted: true, transfers: 0, payouts: 0 },
    });
  }

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (link.error) throw new Error(`magiclink: ${link.error.message}`);
  const hashed = link.data.properties?.hashed_token;
  if (!hashed) throw new Error('No hashed_token');
  const verified = await pub.auth.verifyOtp({ token_hash: hashed, type: 'email' });
  if (verified.error || !verified.data.session) {
    throw new Error(`otp: ${verified.error?.message ?? 'no session'}`);
  }
  const token = verified.data.session.access_token;
  step('supplier_session', { ok: true, user: verified.data.user?.id });

  if (windowOpen) {
    const statusOpen = await invoke(token, 'status');
    step('status_window_open', {
      status: statusOpen.status,
      live_create_allowed: statusOpen.json?.live_create_allowed,
      live_create_blocked_reason: statusOpen.json?.live_create_blocked_reason,
      account_id: statusOpen.json?.account_id ?? null,
    });
  }

  const ensure1 = await invoke(token, 'ensure_account');
  step('ensure_account_1', {
    status: ensure1.status,
    success: ensure1.json?.success,
    account_id: ensure1.json?.account_id ?? null,
    error: ensure1.json?.error ?? null,
    environment: ensure1.json?.environment,
    note: ensure1.json?.note ?? null,
  });
  if (!ensure1.json?.success || !ensure1.json?.account_id) {
    if (windowOpen) await closeWindow('ensure_failed');
    report.overall = 'FAIL_ENSURE_ACCOUNT';
    report.stripe_result = {
      account_id: null,
      error: ensure1.json?.error ?? `HTTP ${ensure1.status}`,
    };
    throw new Error(`ensure_account failed: ${JSON.stringify(ensure1.json).slice(0, 600)}`);
  }

  const ensure2 = await invoke(token, 'ensure_account');
  step('ensure_account_2_idempotent', {
    status: ensure2.status,
    success: ensure2.json?.success,
    same_account: ensure2.json?.account_id === ensure1.json.account_id,
    account_id: ensure2.json?.account_id ?? null,
  });

  const linkRes = await invoke(token, 'account_link');
  step('account_link', {
    status: linkRes.status,
    success: linkRes.json?.success,
    hasUrl: Boolean(linkRes.json?.url),
    account_id: linkRes.json?.account_id ?? null,
    expires_at: linkRes.json?.expires_at ?? null,
    error: linkRes.json?.error ?? null,
  });
  report.account_link_url = linkRes.json?.url ?? null;

  const refreshRes = await invoke(token, 'refresh');
  step('refresh_status', {
    status: refreshRes.status,
    success: refreshRes.json?.success,
    account_id: refreshRes.json?.account_id ?? null,
    onboarding: refreshRes.json?.onboarding ?? null,
    can_receive_transfers: refreshRes.json?.can_receive_transfers ?? null,
  });

  const statusAfter = await invoke(token, 'status');
  step('status_after_ensure', {
    status: statusAfter.status,
    account_id: statusAfter.json?.account_id ?? null,
    onboarding: statusAfter.json?.onboarding ?? null,
    can_receive_transfers: statusAfter.json?.can_receive_transfers ?? null,
    live_create_allowed: statusAfter.json?.live_create_allowed ?? null,
  });

  const { data: profileMid } = await admin
    .from('supplier_profiles')
    .select(
      'stripe_connected_account_id, connect_account_type, connect_account_livemode, connect_onboarding_status, connect_charges_enabled, connect_payouts_enabled, connect_details_submitted, connect_requirements_currently_due, connect_requirements_past_due'
    )
    .eq('id', SUPPLIER)
    .single();
  report.account = {
    created_or_reused_id: ensure1.json.account_id,
    profile: profileMid,
    account_link_ready: Boolean(linkRes.json?.url),
  };

  await admin.from('financial_audit_log').insert({
    action: 'p947_live_connect_account_ensured',
    supplier_id: SUPPLIER,
    amount_minor: 0,
    currency: 'EUR',
    reason: 'P9.47 LIVE Connect account created/reused for EM Global Oy',
    provider_ref: ensure1.json.account_id,
    after_state: {
      account_id: ensure1.json.account_id,
      livemode: profileMid?.connect_account_livemode,
      type: profileMid?.connect_account_type,
      onboarding_status: profileMid?.connect_onboarding_status,
    },
  });

  if (windowOpen) await closeWindow('ensure_and_link_succeeded');

  const ensure3 = await invoke(token, 'ensure_account');
  step('ensure_after_gate_closed', {
    status: ensure3.status,
    success: ensure3.json?.success,
    account_id: ensure3.json?.account_id ?? null,
    error: ensure3.json?.error ?? null,
    same: ensure3.json?.account_id === ensure1.json.account_id,
  });

  const link2 = await invoke(token, 'account_link');
  step('account_link_after_gate_closed', {
    status: link2.status,
    success: link2.json?.success,
    hasUrl: Boolean(link2.json?.url),
    same_account: link2.json?.account_id === ensure1.json.account_id,
    error: link2.json?.error ?? null,
  });
  if (link2.json?.url) report.account_link_url = link2.json.url;

  const { data: after } = await admin
    .from('supplier_profiles')
    .select(
      'stripe_connected_account_id, connect_account_type, connect_account_livemode, connect_onboarding_status, connect_charges_enabled, connect_payouts_enabled, connect_details_submitted'
    )
    .eq('id', SUPPLIER)
    .single();
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
  const { count: allowAfter } = await admin
    .from('live_custom_onboarding_allowlist')
    .select('*', { count: 'exact', head: true });

  report.after = { profile: after, flags: flagsAfter, allowlistCount: allowAfter ?? 0 };
  const flagAfterMap = Object.fromEntries((flagsAfter ?? []).map((r) => [r.key, r.value_int]));
  const gateOff = flagAfterMap.live_custom_onboarding_enabled === 0;
  const moneyOff =
    flagAfterMap.stripe_connect_transfers_enabled === 0 &&
    flagAfterMap.payout_execution_enabled === 0 &&
    flagAfterMap.payout_auto_prepare_enabled === 0 &&
    flagAfterMap.payout_pilot_prepare_enabled === 0;

  report.final_gates = {
    live_custom_onboarding_enabled: flagAfterMap.live_custom_onboarding_enabled,
    allowlist: allowAfter ?? 0,
    transfers: flagAfterMap.stripe_connect_transfers_enabled,
    payouts: flagAfterMap.payout_execution_enabled,
    auto_prepare: flagAfterMap.payout_auto_prepare_enabled,
    pilot_prepare: flagAfterMap.payout_pilot_prepare_enabled,
  };
  report.stripe_result = {
    account_id: after.stripe_connected_account_id,
    type: after.connect_account_type,
    livemode: after.connect_account_livemode,
    onboarding: after.connect_onboarding_status,
    account_link_ready: Boolean(report.account_link_url),
  };

  report.overall =
    after.stripe_connected_account_id &&
    after.connect_account_livemode === true &&
    gateOff &&
    moneyOff &&
    (allowAfter ?? 0) === 0
      ? 'PASS'
      : after.stripe_connected_account_id && gateOff && moneyOff && (allowAfter ?? 0) === 0
        ? 'PASS_PARTIAL_LIVEMODE_FLAG'
        : 'FAIL';

  writeFileSync(
    'scripts/cert-p947-retry-live-connect.report.json',
    JSON.stringify(report, null, 2)
  );
  console.log('OVERALL', report.overall);
  console.log(
    JSON.stringify(
      {
        account_id: after.stripe_connected_account_id,
        type: after.connect_account_type,
        livemode: after.connect_account_livemode,
        onboarding: after.connect_onboarding_status,
        gateOff,
        moneyOff,
        allowAfter,
        account_link_ready: Boolean(report.account_link_url),
      },
      null,
      2
    )
  );
  if (report.account_link_url) {
    writeFileSync('/tmp/p947-account-link.url', report.account_link_url);
  }
  await pub.auth.signOut();
} catch (e) {
  try {
    if (windowOpen) await closeWindow('exception');
  } catch (closeErr) {
    step('close_window_error', { message: String(closeErr) });
  }
  report.error = String(e?.message || e);
  if (!report.overall) report.overall = 'FAIL';
  // Confirm final gates even on failure
  try {
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
    const { count: allowAfter } = await admin
      .from('live_custom_onboarding_allowlist')
      .select('*', { count: 'exact', head: true });
    const { data: after } = await admin
      .from('supplier_profiles')
      .select('stripe_connected_account_id, connect_account_type, connect_account_livemode')
      .eq('id', SUPPLIER)
      .single();
    report.final_gates = {
      live_custom_onboarding_enabled: flagsAfter?.find(
        (f) => f.key === 'live_custom_onboarding_enabled'
      )?.value_int,
      allowlist: allowAfter ?? 0,
      transfers: flagsAfter?.find((f) => f.key === 'stripe_connect_transfers_enabled')?.value_int,
      payouts: flagsAfter?.find((f) => f.key === 'payout_execution_enabled')?.value_int,
      auto_prepare: flagsAfter?.find((f) => f.key === 'payout_auto_prepare_enabled')?.value_int,
      pilot_prepare: flagsAfter?.find((f) => f.key === 'payout_pilot_prepare_enabled')?.value_int,
    };
    report.after = { profile: after, flags: flagsAfter, allowlistCount: allowAfter ?? 0 };
  } catch {
    // ignore
  }
  writeFileSync(
    'scripts/cert-p947-retry-live-connect.report.json',
    JSON.stringify(report, null, 2)
  );
  console.error('FAILED', report.error);
  process.exitCode = 1;
}
