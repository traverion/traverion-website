/**
 * P9.54 — Read-only LIVE preflight for EM Global.
 * Reads the supplier profile mirror only. Does not call Stripe, submit identity,
 * attach a bank, create an account, or change gates.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROJECT = 'xcopqllkulxfkpunetbc';
const BASE = `https://${PROJECT}.supabase.co`;
const SUPPLIER_ID = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';
const ACCOUNT = 'acct_1UdHT6C7oDQnLYSF';

const raw = execSync(`npx supabase projects api-keys --project-ref ${PROJECT}`, { encoding: 'utf8' });
const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
const keys = parsed.keys || parsed;
const service = keys.find((k) => k.name === 'service_role' || k.id === 'service_role')?.api_key;
const admin = createClient(BASE, service, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: profile, error } = await admin
  .from('supplier_profiles')
  .select(
    'stripe_connected_account_id, connect_account_type, connect_account_livemode, connect_onboarding_status, connect_details_submitted, connect_payouts_enabled, connect_charges_enabled, connect_requirements_currently_due, connect_requirements_past_due, connect_last_synced_at, verification_status, business_type, company_legal_name, display_name, company_registration_number, tax_id, managing_directors, address_street, address_city, address_postal_code, address_country, contact_phone, company_registration_document_path, payout_wizard_draft, setup_progress'
  )
  .eq('id', SUPPLIER_ID)
  .single();
if (error) throw new Error(error.message);

const { data: gates, error: gateErr } = await admin
  .from('commercial_runtime_config')
  .select('key, value_int')
  .in('key', ['live_custom_onboarding_enabled', 'payout_execution_enabled', 'stripe_connect_transfers_enabled']);
if (gateErr) throw new Error(gateErr.message);

const due = [
  ...(Array.isArray(profile.connect_requirements_currently_due) ? profile.connect_requirements_currently_due : []),
  ...(Array.isArray(profile.connect_requirements_past_due) ? profile.connect_requirements_past_due : []),
];
const draft = profile.payout_wizard_draft && typeof profile.payout_wizard_draft === 'object'
  ? profile.payout_wizard_draft
  : {};
const rep = draft.rep && typeof draft.rep === 'object' ? draft.rep : {};
const markers = draft.markers && typeof draft.markers === 'object' ? draft.markers : {};

const report = {
  at: new Date().toISOString(),
  mission: 'P9.54',
  mode: 'database_mirror_read',
  stripe_called: false,
  account_matches: profile.stripe_connected_account_id === ACCOUNT,
  account_type: profile.connect_account_type,
  livemode: profile.connect_account_livemode === true,
  onboarding_status: profile.connect_onboarding_status,
  details_submitted: profile.connect_details_submitted === true,
  payouts_enabled: profile.connect_payouts_enabled === true,
  charges_enabled: profile.connect_charges_enabled === true,
  requirements_due: due,
  mirror_synced_at: profile.connect_last_synced_at,
  business_verified: profile.verification_status === 'verified',
  business_type: profile.business_type,
  has_legal_name: Boolean((profile.company_legal_name || '').trim()),
  has_brand: Boolean((profile.display_name || '').trim()),
  has_registration_number: Boolean((profile.company_registration_number || '').trim()),
  has_separate_tax_id: Boolean((profile.tax_id || '').trim()),
  has_directors: Boolean((profile.managing_directors || '').trim()),
  has_address: Boolean(
    (profile.address_street || '').trim() &&
      (profile.address_city || '').trim() &&
      (profile.address_postal_code || '').trim() &&
      (profile.address_country || '').trim()
  ),
  has_phone: Boolean((profile.contact_phone || '').trim()),
  has_registration_file: Boolean((profile.company_registration_document_path || '').trim()),
  draft_has_rep_name: Boolean((rep.first_name || '').trim() && (rep.last_name || '').trim()),
  draft_has_director_flag: typeof rep.is_director === 'boolean',
  draft_director: typeof rep.is_director === 'boolean' ? rep.is_director : null,
  draft_owner: rep.is_owner === true,
  draft_has_dob_year: Number.isFinite(rep.dob_year),
  draft_bank_last4_present: Boolean(markers.bankLast4),
  draft_bank_saved: Boolean(markers.bankSavedAt),
  gates: Object.fromEntries((gates ?? []).map((g) => [g.key, g.value_int])),
  company_tax_id_still_due: due.some((k) => String(k).includes('tax_id') || String(k).includes('id_number')),
};

writeFileSync('scripts/cert-p954-live-preflight.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
