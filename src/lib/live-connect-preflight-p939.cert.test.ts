/**
 * P9.39 — First LIVE Connect activation preflight (source/unit).
 * Does not flip gates, create accounts, invent KYC, or move money.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { liveCustomCreateAllowed } from '../../supabase/functions/_shared/live-custom-onboarding-gate';
import { assessLiveAccountsV2PilotEligibility } from './live-accounts-v2-pilot-eligibility';
import { canProvisionConnectAccount } from './payout-setup-wizard';

const root = resolve(import.meta.dirname, '../..');
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);
const transfers = readFileSync(
  resolve(root, 'supabase/functions/execute-supplier-transfers/index.ts'),
  'utf8'
);
const wizard = readFileSync(resolve(root, 'src/components/supplier/PayoutSetupWizard.tsx'), 'utf8');

describe('P9.39 LIVE Connect activation preflight (safe)', () => {
  it('keeps create fail-closed without gate + allowlist', () => {
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: 0, supplierApproved: true }).allowed
    ).toBe(false);
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: 1, supplierApproved: false }).allowed
    ).toBe(false);
  });

  it('refuses LIVE pilot eligibility for rejected / unverified businesses', () => {
    const assessment = assessLiveAccountsV2PilotEligibility(
      {
        id: 'eced0f8c-c2e4-469b-8bba-15170be68cc1',
        company_legal_name: 'EM Global Oy',
        business_type: 'company',
        address_country: 'FI',
        contact_phone: '+358458803060',
        verification_status: 'rejected',
        verification_submitted_at: '2026-11-17T14:52:10.117Z',
        company_registration_document_path:
          'eced0f8c-c2e4-469b-8bba-15170be68cc1/company-registration.png',
      },
      { ownerConfirmed: true, stripeVerificationAcknowledged: true }
    );
    expect(assessment.eligible).toBe(false);
    expect(assessment.problems.some((p) => /business verification/i.test(p))).toBe(true);
  });

  it('blocks client LIVE provision without live_create_allowed', () => {
    expect(
      canProvisionConnectAccount({
        hasConnectedAccount: false,
        platformEnvironment: 'live',
        liveCreateAllowed: false,
      })
    ).toBe(false);
  });

  it('keeps transfers LIVE-hard-blocked and Account Link available in code', () => {
    expect(transfers).toContain("stripeMoney.mode !== 'test'");
    expect(transfers).toContain('Stripe Connect transfers remain TEST-only');
    expect(edge).toContain("action === 'account_link'");
    expect(edge).toContain('accountLinks.create');
    expect(wizard).toContain('fetchConnectAccountLink');
  });
});
