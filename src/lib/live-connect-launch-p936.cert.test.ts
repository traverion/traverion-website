/**
 * P9.36 — LIVE Connect launch safety (source/unit).
 * Does not flip gates, create accounts, invent KYC, or move money.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { liveCustomCreateAllowed } from '../../supabase/functions/_shared/live-custom-onboarding-gate';
import { assessLiveAccountsV2PilotEligibility } from './live-accounts-v2-pilot-eligibility';
import { canProvisionConnectAccount } from './payout-setup-wizard';

const root = resolve(__dirname, '../..');
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);
const wizard = readFileSync(resolve(root, 'src/components/supplier/PayoutSetupWizard.tsx'), 'utf8');
const client = readFileSync(resolve(root, 'src/data/supabase-connect-onboarding.ts'), 'utf8');
const webhook = readFileSync(resolve(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
const transfers = readFileSync(
  resolve(root, 'supabase/functions/execute-supplier-transfers/index.ts'),
  'utf8'
);

describe('P9.36 LIVE Connect launch readiness (safe)', () => {
  it('keeps LIVE create gated by flag + allowlist', () => {
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: 0, supplierApproved: true }).allowed
    ).toBe(false);
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: 1, supplierApproved: false }).allowed
    ).toBe(false);
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: 1, supplierApproved: true }).allowed
    ).toBe(true);
  });

  it('requires Traverion verified + pilot approval before LIVE create', () => {
    expect(edge).toContain(
      'Traverion business verification must be approved before LIVE payout account creation.'
    );
    expect(edge).toContain('live_accounts_v2_pilot_approvals');
    expect(edge).toContain('LIVE pilot approval has not been recorded');
    expect(edge).toContain('business_verified');
    expect(edge).toContain('pilot_approved');
  });

  it('exposes Stripe-hosted Account Link for real KYC without inventing status', () => {
    expect(edge).toContain("action === 'account_link'");
    expect(edge).toContain('accountLinks.create');
    expect(client).toContain('fetchConnectAccountLink');
    expect(wizard).toContain('fetchConnectAccountLink');
    expect(wizard).toContain('Continue on Stripe');
    expect(wizard).toContain('never from this button alone');
  });

  it('persists Connect status from Stripe webhooks and sync, not browser return alone', () => {
    const mirror = readFileSync(
      resolve(root, 'supabase/functions/_shared/connect-account-mirror.ts'),
      'utf8'
    );
    expect(webhook).toContain('account.updated');
    expect(webhook).toContain('isAccountsV2LifecycleEvent');
    expect(mirror).toContain('Never treat a browser return URL alone as verified');
    expect(edge).toContain('verified: connectCanReceiveTransfers');
  });

  it('refuses LIVE transfers in the executor regardless of UI', () => {
    expect(transfers).toContain("stripeMoney.mode !== 'test'");
    expect(transfers).toContain('stripe_connect_transfers_enabled');
  });

  it('blocks client LIVE provision unless edge reports live_create_allowed', () => {
    expect(
      canProvisionConnectAccount({
        hasConnectedAccount: false,
        platformEnvironment: 'live',
        liveCreateAllowed: false,
      })
    ).toBe(false);
    expect(
      canProvisionConnectAccount({
        hasConnectedAccount: false,
        platformEnvironment: 'live',
        liveCreateAllowed: true,
      })
    ).toBe(true);
  });

  it('marks EM Global-style rejected profile ineligible for pilot approval', () => {
    const assessment = assessLiveAccountsV2PilotEligibility(
      {
        id: 'eced0f8c-c2e4-469b-8bba-15170be68cc1',
        company_legal_name: 'EM Global Oy',
        business_type: 'company',
        address_country: 'FI',
        contact_phone: '+358458803060',
        verification_status: 'rejected',
        verification_submitted_at: '2026-11-17T00:00:00Z',
        company_registration_document_path: 'eced0f8c/company-registration.png',
      },
      { ownerConfirmed: true, stripeVerificationAcknowledged: true }
    );
    expect(assessment.eligible).toBe(false);
    expect(assessment.problems.some((p) => /business verification/i.test(p))).toBe(true);
  });
});
