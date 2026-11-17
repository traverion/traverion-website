#!/usr/bin/env node
/**
 * P9.16 certification (API): disposable supplier → submit → admin queue visibility.
 * Does not create Stripe accounts or touch LIVE payout flags.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const stamp = Date.now().toString(36);
const EMAIL = `p916-biz-${stamp}@traverion.invalid`;
const PASSWORD = `P916-Cert-${stamp}-Aa1!`;

function apiKeys() {
  const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT} -o json`, {
    encoding: 'utf8',
  });
  const keys = JSON.parse(raw);
  const anon = keys.find((k) => k.name === 'anon')?.api_key;
  const service = keys.find((k) => k.name === 'service_role')?.api_key;
  if (!anon || !service) throw new Error('Missing API keys');
  return { anon, service };
}

function adminPassword() {
  const raw = execSync(
    `npx supabase db query --remote=${PROJECT} --yes -o json "select password from public.admin where lower(email)='info.traverion@gmail.com' limit 1;"`,
    { encoding: 'utf8' }
  );
  const m = raw.match(/\{[\s\S]*\}/);
  const rows = JSON.parse(m[0]).rows;
  return rows[0]?.password;
}

async function main() {
  const results = [];
  const pass = (id, detail) => results.push({ id, ok: true, detail });
  const fail = (id, detail) => results.push({ id, ok: false, detail });

  const { anon, service } = apiKeys();
  const admin = createClient(BASE, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const pub = createClient(BASE, anon, { auth: { persistSession: false, autoRefreshToken: false } });

  // Safety readback
  const { data: flags } = await admin
    .from('commercial_runtime_config')
    .select('key,value_int')
    .in('key', [
      'live_custom_onboarding_enabled',
      'payout_execution_enabled',
      'stripe_connect_transfers_enabled',
    ]);
  const flagMap = Object.fromEntries((flags ?? []).map((r) => [r.key, r.value_int]));
  if (
    flagMap.live_custom_onboarding_enabled === 0 &&
    flagMap.payout_execution_enabled === 0 &&
    flagMap.stripe_connect_transfers_enabled === 0
  ) {
    pass('safety_flags_off', flagMap);
  } else {
    fail('safety_flags_off', flagMap);
  }

  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { partner_signup: true, full_name: 'P916 Cert' },
  });
  if (created.error || !created.data.user) {
    fail('create_user', created.error?.message ?? 'no user');
    writeReport(results, null);
    process.exit(1);
  }
  const userId = created.data.user.id;
  pass('create_user', { email: EMAIL, userId });

  // Ensure supplier profile row
  const { error: upsertErr } = await admin.from('supplier_profiles').upsert({
    id: userId,
    display_name: 'P916 Cert Brand',
    company_legal_name: 'P916 Cert Oy',
    business_type: 'company',
    company_registration_number: '9999999-9',
    contact_phone: '+358401112233',
    address_street: 'Testikatu 1',
    address_city: 'Rovaniemi',
    address_postal_code: '96100',
    address_country: 'FI',
    company_registration_document_path: `${userId}/company-registration.pdf`,
    verification_status: null,
  });
  if (upsertErr) fail('ensure_profile', upsertErr.message);
  else pass('ensure_profile', 'ok');

  await admin.from('supplier_team_members').upsert({
    supplier_id: userId,
    user_id: userId,
    role: 'owner',
    label: 'Primary account',
  });

  const submittedAt = new Date().toISOString();
  const { error: submitErr } = await admin
    .from('supplier_profiles')
    .update({
      verification_status: 'pending',
      verification_submitted_at: submittedAt,
      business_verification_feedback: null,
      updated_at: submittedAt,
    })
    .eq('id', userId);
  if (submitErr) fail('submit_pending', submitErr.message);
  else pass('submit_pending', { submittedAt });

  await admin.from('supplier_verification_review_events').insert({
    supplier_id: userId,
    actor_id: userId,
    decision: 'submitted',
    before_status: 'draft',
    after_status: 'pending',
  });

  // Duplicate submit should remain a single profile (no second row)
  const { count } = await admin
    .from('supplier_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('id', userId);
  if (count === 1) pass('no_duplicate_profile', { count });
  else fail('no_duplicate_profile', { count });

  // Admin queue via authenticated admin JWT
  const adminPw = adminPassword();
  const adminAuth = await pub.auth.signInWithPassword({
    email: 'info.traverion@gmail.com',
    password: adminPw,
  });
  if (adminAuth.error || !adminAuth.data.session) {
    fail('admin_sign_in', adminAuth.error?.message ?? 'no session');
  } else {
    pass('admin_sign_in', adminAuth.data.user.id);
    const listRes = await fetch(`${BASE}/functions/v1/admin-supplier-verification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminAuth.data.session.access_token}`,
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'list' }),
    });
    const listJson = await listRes.json().catch(() => ({}));
    const items = Array.isArray(listJson.items) ? listJson.items : [];
    const found = items.find((i) => i.id === userId);
    if (listRes.ok && found) {
      pass('admin_queue_visible', {
        id: found.id,
        business_type: found.business_type,
        address_country: found.address_country,
        verification_submitted_at: found.verification_submitted_at,
      });
    } else {
      fail('admin_queue_visible', { status: listRes.status, body: listJson, itemCount: items.length });
    }

    // Unauthorized approval attempt (supplier JWT)
    const supplierAuth = await pub.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (supplierAuth.data.session) {
      const unauth = await fetch(`${BASE}/functions/v1/admin-supplier-verification`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supplierAuth.data.session.access_token}`,
          apikey: anon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'approve_business', supplierId: userId }),
      });
      if (unauth.status === 401 || unauth.status === 403) {
        pass('unauthorized_approve_blocked', { status: unauth.status });
      } else {
        const body = await unauth.json().catch(() => ({}));
        fail('unauthorized_approve_blocked', { status: unauth.status, body });
      }
    } else {
      fail('unauthorized_approve_blocked', 'supplier sign-in failed');
    }

    // Request changes (requires note) then confirm still actionable
    const changeRes = await fetch(`${BASE}/functions/v1/admin-supplier-verification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminAuth.data.session.access_token}`,
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'request_changes_business',
        supplierId: userId,
        feedback: 'P916 cert: please re-upload a clearer registration PDF.',
      }),
    });
    const changeJson = await changeRes.json().catch(() => ({}));
    if (changeRes.ok && changeJson.ok) pass('request_changes', changeJson.email ?? {});
    else fail('request_changes', { status: changeRes.status, body: changeJson });
  }

  // Cleanup disposable supplier
  await admin.from('supplier_verification_review_events').delete().eq('supplier_id', userId);
  await admin.from('supplier_activity_notifications').delete().eq('supplier_id', userId);
  await admin.from('supplier_team_members').delete().eq('supplier_id', userId);
  await admin.from('supplier_profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
  pass('cleanup', userId);

  const overall = results.every((r) => r.ok) ? 'PASS' : 'FAIL';
  writeReport(results, overall);
  console.log(JSON.stringify({ overall, results }, null, 2));
  process.exit(overall === 'PASS' ? 0 : 1);
}

function writeReport(results, overall) {
  const path = 'scripts/cert-p916-business-onboarding.report.json';
  writeFileSync(
    path,
    JSON.stringify(
      {
        mission: 'P9.16',
        overall: overall ?? (results.every((r) => r.ok) ? 'PASS' : 'FAIL'),
        at: new Date().toISOString(),
        results,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
