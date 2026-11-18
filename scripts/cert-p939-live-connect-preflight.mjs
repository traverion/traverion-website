/**
 * P9.39 — First LIVE Connect activation preflight (read-only).
 * Queries production gates/candidates. Never flips gates or creates Connect accounts.
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function queryDb(sql) {
  const cleaned = sql.replace(/\s+/g, ' ').trim();
  const out = execSync(`npx supabase db query --linked --yes -o json ${JSON.stringify(cleaned)}`, {
    encoding: 'utf8',
    cwd: process.cwd(),
    timeout: 90000,
  });
  const start = out.indexOf('{');
  if (start < 0) throw new Error(`No JSON from db query: ${out.slice(0, 200)}`);
  return JSON.parse(out.slice(start));
}

const gates = queryDb(
  "select key, value_int from public.commercial_runtime_config where key in ('live_custom_onboarding_enabled','payout_execution_enabled','stripe_connect_transfers_enabled','payout_auto_prepare_enabled','payout_pilot_prepare_enabled') order by key"
);
const allow = queryDb('select supplier_id from public.live_custom_onboarding_allowlist');
const pilots = queryDb('select supplier_id from public.live_accounts_v2_pilot_approvals');
const verified = queryDb(
  "select id, company_legal_name, verification_status from public.supplier_profiles where lower(coalesce(verification_status,'')) = 'verified'"
);
const profiles = queryDb(
  "select id, company_legal_name, verification_status, company_registration_number, (coalesce(stripe_connected_account_id,'') <> '') as has_connect from public.supplier_profiles order by company_legal_name nulls last"
);
const em = queryDb(
  "select id, company_legal_name, verification_status, company_registration_number, company_registration_document_path, left(coalesce(business_verification_feedback,''), 240) as feedback from public.supplier_profiles where id = 'eced0f8c-c2e4-469b-8bba-15170be68cc1'"
);

const gateMap = Object.fromEntries((gates.rows || []).map((r) => [r.key, r.value_int]));
const verifiedCount = (verified.rows || []).length;
const allowCount = (allow.rows || []).length;
const pilotCount = (pilots.rows || []).length;
const moneyOff =
  gateMap.live_custom_onboarding_enabled === 0 &&
  gateMap.payout_execution_enabled === 0 &&
  gateMap.stripe_connect_transfers_enabled === 0 &&
  gateMap.payout_auto_prepare_enabled === 0 &&
  gateMap.payout_pilot_prepare_enabled === 0;

const eligibleVerifiedNoConnect = (profiles.rows || []).filter(
  (p) => String(p.verification_status).toLowerCase() === 'verified' && !p.has_connect
);

const verdict =
  verifiedCount === 0 || eligibleVerifiedNoConnect.length === 0
    ? 'NO-GO'
    : moneyOff
      ? 'NO-GO_PENDING_SUPPLIER_APPROVALS'
      : 'INVESTIGATE';

const report = {
  mission: 'P9.39',
  generatedAt: new Date().toISOString(),
  project: 'xcopqllkulxfkpunetbc',
  verdict,
  gates: gateMap,
  allowlist_count: allowCount,
  pilot_approvals_count: pilotCount,
  verified_supplier_count: verifiedCount,
  eligible_verified_without_connect: eligibleVerifiedNoConnect,
  profiles: profiles.rows || [],
  em_global: (em.rows || [])[0] || null,
  notes: [
    'Do not request LIVE create authorization while verified_supplier_count is 0.',
    'Synthetic @traverion.invalid cert suppliers are not LIVE KYC-ready.',
    'EM Global Oy remains rejected until a genuine PRH/YTJ extract is approved.',
  ],
};

const outJson = resolve(process.cwd(), 'scripts/cert-p939-live-connect-preflight.report.json');
writeFileSync(outJson, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict, gates: gateMap, verifiedCount, allowCount, pilotCount }, null, 2));
console.log('wrote', outJson);
