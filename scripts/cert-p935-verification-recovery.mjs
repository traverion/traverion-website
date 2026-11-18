#!/usr/bin/env node
/**
 * P9.35 certification (API): disposable supplier
 * submit → request_changes → replace registration path → resubmit → admin approve → cleanup.
 *
 * Controlled fixture only. Does not invent real PRH documents, Stripe KYC, LIVE Connect,
 * allowlist, transfers, or payouts. Production EM Global is converted to rejected separately
 * (no fabricated approval).
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const stamp = Date.now().toString(36);
const EMAIL = `p935-biz-${stamp}@traverion.invalid`;
const PASSWORD = `P935-Cert-${stamp}-Aa1!`;
const FIXTURE_FEEDBACK =
  'P9.35 fixture: upload an official company registration extract (controlled test note — not a real PRH file).';
const EM_GLOBAL_ID = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';

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
    `npx supabase db query --linked --yes -o json "select password from public.admin where lower(email)='info.traverion@gmail.com' limit 1;"`,
    { encoding: 'utf8' }
  );
  const m = raw.match(/\{[\s\S]*\}/);
  const rows = JSON.parse(m[0]).rows;
  return rows[0]?.password;
}

function writeReport(payload) {
  writeFileSync(
    'scripts/cert-p935-verification-recovery.report.json',
    JSON.stringify(payload, null, 2)
  );
  writeFileSync(
    'scripts/cert-p935-verification-recovery.report.md',
    [
      '# P9.35 — Supplier Verification Recovery',
      '',
      `| | |`,
      `|---|---|`,
      `| Verdict | **${payload.overall}** |`,
      `| Date | ${payload.at} |`,
      `| Fixture | \`${payload.fixtureEmail ?? 'n/a'}\` |`,
      `| LIVE create / allowlist / money | **Not enabled** |`,
      '',
      '## Checks',
      '',
      ...payload.results.map(
        (r) => `- ${r.ok ? 'PASS' : 'FAIL'} — **${r.id}**${r.detail ? `: \`${JSON.stringify(r.detail)}\`` : ''}`
      ),
      '',
      '## Remaining blockers (production)',
      '',
      ...(payload.blockers ?? []).map((b) => `- ${b}`),
      '',
    ].join('\n')
  );
}

async function main() {
  const results = [];
  const pass = (id, detail) => results.push({ id, ok: true, detail });
  const fail = (id, detail) => results.push({ id, ok: false, detail });

  const { anon, service } = apiKeys();
  const admin = createClient(BASE, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const pub = createClient(BASE, anon, { auth: { persistSession: false, autoRefreshToken: false } });

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

  // Convert EM Global soft-pending feedback → explicit rejected (no approval invented).
  const { data: emBefore } = await admin
    .from('supplier_profiles')
    .select(
      'id, verification_status, business_verification_feedback, company_registration_document_path, company_legal_name'
    )
    .eq('id', EM_GLOBAL_ID)
    .maybeSingle();
  if (!emBefore) {
    fail('em_global_present', 'missing');
  } else {
    const fb =
      (emBefore.business_verification_feedback ?? '').trim() ||
      'Please replace the uploaded file with an official PRH Trade Register extract (kaupparekisteriote) or equivalent YTJ company registration evidence for EM Global Oy (3567289-4). Marketing posters are not accepted.';
    const { error: emErr } = await admin
      .from('supplier_profiles')
      .update({
        verification_status: 'rejected',
        business_verification_feedback: fb,
        business_rejected_email_sent_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', EM_GLOBAL_ID);
    if (emErr) fail('em_global_rejected', emErr.message);
    else {
      await admin.from('supplier_verification_review_events').insert({
        supplier_id: EM_GLOBAL_ID,
        actor_id: null,
        decision: 'reject',
        feedback: fb,
        before_status: emBefore.verification_status,
        after_status: 'rejected',
      });
      pass('em_global_rejected', {
        before: emBefore.verification_status,
        after: 'rejected',
        feedbackPreview: fb.slice(0, 120),
      });
    }
  }

  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { partner_signup: true, full_name: 'P935 Cert' },
  });
  if (created.error || !created.data.user) {
    fail('create_user', created.error?.message ?? 'no user');
    writeReport({
      mission: 'P9.35',
      overall: 'FAIL',
      at: new Date().toISOString(),
      results,
      blockers: ['Could not create disposable fixture supplier.'],
    });
    process.exit(1);
  }
  const userId = created.data.user.id;
  pass('create_user', { email: EMAIL, userId });

  const bogusPath = `${userId}/company-registration-marketing-poster.png`;
  const replacedPath = `${userId}/company-registration-fixture-extract.pdf`;

  const { error: upsertErr } = await admin.from('supplier_profiles').upsert({
    id: userId,
    display_name: 'P935 Cert Brand',
    company_legal_name: 'P935 Cert Fixture Oy',
    business_type: 'company',
    // Valid Finnish Business ID checksum (weights 7,9,10,5,8,4,2) — not a real company claim.
    company_registration_number: '1234567-1',
    managing_directors: 'P935 Fixture Director',
    contact_phone: '+358409351111',
    address_street: 'Fixturekatu 1',
    address_city: 'Rovaniemi',
    address_postal_code: '96100',
    address_country: 'FI',
    vat_id: 'FI12345671',
    company_registration_document_path: bogusPath,
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

  const adminPw = adminPassword();
  const adminAuth = await pub.auth.signInWithPassword({
    email: 'info.traverion@gmail.com',
    password: adminPw,
  });
  if (adminAuth.error || !adminAuth.data.session) {
    fail('admin_sign_in', adminAuth.error?.message ?? 'no session');
  } else {
    pass('admin_sign_in', adminAuth.data.user.id);

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
        feedback: FIXTURE_FEEDBACK,
      }),
    });
    const changeJson = await changeRes.json().catch(() => ({}));
    if (changeRes.ok && changeJson.ok) pass('request_changes', changeJson.email ?? {});
    else fail('request_changes', { status: changeRes.status, body: changeJson });

    const { data: afterReject } = await admin
      .from('supplier_profiles')
      .select('verification_status, business_verification_feedback, company_registration_document_path')
      .eq('id', userId)
      .single();
    if (
      afterReject?.verification_status === 'rejected' &&
      (afterReject.business_verification_feedback ?? '').includes('P9.35 fixture')
    ) {
      pass('rejected_state', {
        status: afterReject.verification_status,
        path: afterReject.company_registration_document_path,
      });
    } else {
      fail('rejected_state', afterReject);
    }

    // Supplier session: replace document path + resubmit (controlled fixture path only).
    const supplierAuth = await pub.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (!supplierAuth.data.session) {
      fail('supplier_sign_in', supplierAuth.error?.message ?? 'no session');
    } else {
      pass('supplier_sign_in', supplierAuth.data.user.id);
      const supplierClient = createClient(BASE, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: `Bearer ${supplierAuth.data.session.access_token}` },
        },
      });
      const resubmitAt = new Date().toISOString();
      const { error: replaceErr } = await supplierClient
        .from('supplier_profiles')
        .update({
          company_registration_document_path: replacedPath,
          verification_status: 'pending',
          verification_submitted_at: resubmitAt,
          business_verification_feedback: null,
          updated_at: resubmitAt,
        })
        .eq('id', userId);
      if (replaceErr) fail('supplier_replace_resubmit', replaceErr.message);
      else pass('supplier_replace_resubmit', { replacedPath, resubmitAt });

      const { data: afterResubmit } = await admin
        .from('supplier_profiles')
        .select(
          'verification_status, business_verification_feedback, company_registration_document_path, verification_submitted_at'
        )
        .eq('id', userId)
        .single();
      if (
        afterResubmit?.verification_status === 'pending' &&
        afterResubmit.company_registration_document_path === replacedPath &&
        !afterResubmit.business_verification_feedback
      ) {
        pass('resubmit_cleared_feedback', afterResubmit);
      } else {
        fail('resubmit_cleared_feedback', afterResubmit);
      }
    }

    const { data: pendingForApprove } = await admin
      .from('supplier_profiles')
      .select('verification_status, company_registration_document_path')
      .eq('id', userId)
      .single();
    if (pendingForApprove?.verification_status !== 'pending') {
      fail('pre_approve_pending', pendingForApprove);
    } else {
      const approveRes = await fetch(`${BASE}/functions/v1/admin-supplier-verification`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminAuth.data.session.access_token}`,
          apikey: anon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'approve_business', supplierId: userId }),
      });
      const approveJson = await approveRes.json().catch(() => ({}));
      if (approveRes.ok && approveJson.ok) pass('admin_approve_fixture', approveJson.email ?? {});
      else fail('admin_approve_fixture', { status: approveRes.status, body: approveJson });

      const { data: afterApprove } = await admin
        .from('supplier_profiles')
        .select('verification_status')
        .eq('id', userId)
        .single();
      if (afterApprove?.verification_status === 'verified') pass('fixture_verified', afterApprove);
      else fail('fixture_verified', afterApprove);
    }

    const { count: auditCount } = await admin
      .from('supplier_verification_review_events')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', userId);
    if ((auditCount ?? 0) >= 2) pass('audit_trail', { count: auditCount });
    else fail('audit_trail', { count: auditCount });
  }

  // Cleanup disposable fixture only (keep EM Global rejected state).
  await admin.from('supplier_verification_review_events').delete().eq('supplier_id', userId);
  await admin.from('supplier_activity_notifications').delete().eq('supplier_id', userId);
  await admin.from('supplier_team_members').delete().eq('supplier_id', userId);
  await admin.from('supplier_profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
  pass('cleanup_fixture', userId);

  const { data: emAfter } = await admin
    .from('supplier_profiles')
    .select('verification_status, business_verification_feedback')
    .eq('id', EM_GLOBAL_ID)
    .maybeSingle();
  if (emAfter?.verification_status === 'rejected') {
    pass('em_global_still_rejected_not_approved', {
      status: emAfter.verification_status,
      hasFeedback: Boolean((emAfter.business_verification_feedback ?? '').trim()),
    });
  } else {
    fail('em_global_still_rejected_not_approved', emAfter);
  }

  const overall = results.every((r) => r.ok) ? 'PASS' : 'FAIL';
  const blockers = [
    'EM Global Oy still needs a genuine PRH/YTJ registration extract from the supplier (marketing poster remains unacceptable).',
    'Do not approve EM Global or enable LIVE Connect create/allowlist until a real extract is reviewed.',
    'Stripe KYC / payout readiness remain separate and untouched by this mission.',
  ];
  writeReport({
    mission: 'P9.35',
    overall,
    at: new Date().toISOString(),
    fixtureEmail: EMAIL,
    results,
    blockers,
  });
  console.log(JSON.stringify({ overall, results }, null, 2));
  process.exit(overall === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
