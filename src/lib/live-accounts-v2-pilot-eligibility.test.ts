import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assessLiveAccountsV2PilotEligibility,
  normalizePilotLegalName,
} from './live-accounts-v2-pilot-eligibility';
import { finlandSupplierCountry } from './accounts-v2-config';

const root = resolve(__dirname, '../..');
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);
const admin = readFileSync(
  resolve(root, 'supabase/functions/admin-supplier-verification/index.ts'),
  'utf8'
);
const sharedClient = readFileSync(
  resolve(root, 'src/lib/live-accounts-v2-pilot-eligibility.ts'),
  'utf8'
);
const sharedEdge = readFileSync(
  resolve(root, 'supabase/functions/_shared/live-accounts-v2-pilot-eligibility.ts'),
  'utf8'
);

const complete = {
  id: '11111111-1111-1111-1111-111111111111',
  display_name: 'Lapland Trails',
  company_legal_name: 'Lapland Trails Oy',
  business_type: 'company',
  address_country: 'FI',
  contact_phone: '+358401234567',
  verification_status: 'verified',
  stripe_connected_account_id: null,
  connect_account_livemode: null,
  connect_legacy_account_id: null,
  connect_create_claimed_at: null,
};

describe('LIVE Accounts v2 pilot eligibility', () => {
  it('keeps the eligibility helpers identical between app and edge', () => {
    expect(sharedClient.replace("from './accounts-v2-config'", "from './accounts-v2-config.ts'")).toBe(
      sharedEdge
    );
  });

  it('rejects a missing country and no longer treats blank as Finland', () => {
    expect(finlandSupplierCountry('')).toBeNull();
    expect(
      assessLiveAccountsV2PilotEligibility(
        { ...complete, address_country: null, connect_country: null },
        { ownerConfirmed: true, stripeVerificationAcknowledged: true }
      ).eligible
    ).toBe(false);
    expect(edge).not.toMatch(/countryRaw: \(profile\.address_country \|\| profile\.connect_country \|\| 'FI'\)/);
    expect(edge).toContain("countryRaw: ((profile.address_country || profile.connect_country || '') as string)");
  });

  it('rejects incomplete legal details, linked accounts, and open claims', () => {
    expect(
      assessLiveAccountsV2PilotEligibility(
        { ...complete, company_legal_name: null },
        { ownerConfirmed: true, stripeVerificationAcknowledged: true }
      ).problems.join(' ')
    ).toMatch(/Legal business name/i);
    expect(
      assessLiveAccountsV2PilotEligibility(
        {
          ...complete,
          stripe_connected_account_id: 'acct_live_example',
          connect_account_livemode: true,
        },
        { ownerConfirmed: true, stripeVerificationAcknowledged: true }
      ).eligible
    ).toBe(false);
    expect(
      assessLiveAccountsV2PilotEligibility(
        {
          ...complete,
          connect_create_claimed_at: new Date().toISOString(),
        },
        { ownerConfirmed: true, stripeVerificationAcknowledged: true, nowMs: Date.now() }
      ).hasOpenCreateClaim
    ).toBe(true);
  });

  it('flags duplicate legal entities without approving them', () => {
    const result = assessLiveAccountsV2PilotEligibility(complete, {
      ownerConfirmed: true,
      stripeVerificationAcknowledged: true,
      duplicateSupplierIds: ['22222222-2222-2222-2222-222222222222'],
    });
    expect(result.eligible).toBe(true);
    expect(result.reviewFlags.join(' ')).toMatch(/duplicate/i);
    expect(normalizePilotLegalName('  EM   Global Oy ')).toBe('em global oy');
  });

  it('records pilot approval without allowlisting or enabling the gate', () => {
    expect(admin).toContain("action === 'approve_live_v2_pilot'");
    expect(admin).toContain("action === 'assess_live_v2_pilot'");
    expect(admin).toContain('live_accounts_v2_pilot_approvals');
    expect(admin).not.toMatch(/live_custom_onboarding_enabled['"]?\s*,\s*1/);
    expect(admin).toContain('live_custom_onboarding_allowlist');
    const approve = admin.slice(
      admin.indexOf("action === 'approve_live_v2_pilot'"),
      admin.indexOf("action === 'approve_live_v2_pilot'") + 3500
    );
    expect(approve).toContain('confirmLivePilot !== true');
    expect(approve).toContain('stripeVerificationAcknowledged !== true');
    expect(approve).toContain('ownerConfirmed !== true');
    expect(approve).toContain("from('live_accounts_v2_pilot_approvals')");
    expect(approve).not.toContain("from('live_custom_onboarding_allowlist').insert");
    expect(approve).not.toContain("from('live_custom_onboarding_allowlist').upsert");
    expect(approve).not.toContain("key', 'live_custom_onboarding_enabled'");
    expect(approve).toContain('gate_enabled: false');
    expect(approve).toContain('allowlisted: false');
  });

  it('leaves an approved supplier blocked while the LIVE gate stays OFF', () => {
    const result = assessLiveAccountsV2PilotEligibility(complete, {
      ownerConfirmed: true,
      stripeVerificationAcknowledged: true,
      gateEnabled: false,
      allowlisted: false,
    });
    expect(result.eligible).toBe(true);
    expect(result.gateEnabled).toBe(false);
    expect(result.allowlisted).toBe(false);
  });
});
