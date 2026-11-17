#!/usr/bin/env node
/**
 * P9.18: create disposable supplier for hosted browser certification.
 * Does not touch Royal Nordic or LIVE payout flags. Does not submit yet.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const stamp = Date.now().toString(36);
const EMAIL = `p918-biz-${stamp}@traverion.invalid`;
const PASSWORD = `P918-Cert-${stamp}-Aa1!`;

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

async function main() {
  const { service } = apiKeys();
  const admin = createClient(BASE, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: flags } = await admin
    .from('commercial_runtime_config')
    .select('key,value_int')
    .in('key', [
      'live_custom_onboarding_enabled',
      'payout_execution_enabled',
      'stripe_connect_transfers_enabled',
    ]);
  const flagMap = Object.fromEntries((flags ?? []).map((r) => [r.key, r.value_int]));
  console.log('safety_flags', flagMap);

  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { partner_signup: true, full_name: 'P918 Cert' },
  });
  if (created.error || !created.data.user) {
    console.error(created.error);
    process.exit(1);
  }
  const userId = created.data.user.id;

  await admin.from('supplier_profiles').upsert({
    id: userId,
    display_name: null,
    company_legal_name: null,
    business_type: null,
    verification_status: null,
  });

  await admin.from('supplier_team_members').upsert({
    supplier_id: userId,
    user_id: userId,
    role: 'owner',
    label: 'Primary account',
  });

  const out = {
    email: EMAIL,
    password: PASSWORD,
    userId,
    validFiBusinessId: '1234567-1',
    validFiVatId: 'FI12345671',
    createdAt: new Date().toISOString(),
  };
  writeFileSync('scripts/cert-p918-disposable.credentials.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
