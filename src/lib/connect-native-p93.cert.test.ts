/**
 * P9.3 — LIVE Custom onboarding gate and verification recovery (source/unit).
 * Does not call Stripe and does not create accounts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { liveCustomCreateAllowed } from '../../supabase/functions/_shared/live-custom-onboarding-gate';
import {
  firstOutstandingWizardStep,
  payoutWizardStepForRequirement,
} from './payout-setup-wizard';
import { connectCanReceiveTransfers, connectOnboardingLabel } from './connect-payout-status';

const root = resolve(__dirname, '../..');
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);
const migration = readFileSync(
  resolve(root, 'supabase/migrations/311_p93_live_custom_onboarding_gate.sql'),
  'utf8'
);
const wizard = readFileSync(
  resolve(root, 'src/components/supplier/PayoutSetupWizard.tsx'),
  'utf8'
);

describe('P9.3 LIVE Custom creation gate', () => {
  it('refuses LIVE creation unless the flag is on and the supplier is approved', () => {
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: 0, supplierApproved: true })
    ).toEqual({ allowed: false, reason: 'LIVE payout account creation is turned off.' });
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: null, supplierApproved: true }).allowed
    ).toBe(false);
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: 1, supplierApproved: false }).allowed
    ).toBe(false);
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: 1, supplierApproved: true })
    ).toEqual({ allowed: true, reason: null });
    expect(
      liveCustomCreateAllowed({ platformMode: 'test', flagValue: 0, supplierApproved: false }).allowed
    ).toBe(true);
  });

  it('keeps the gate default off and service-role only', () => {
    expect(migration).toContain("'live_custom_onboarding_enabled'");
    expect(migration).toMatch(/values \(\s*'live_custom_onboarding_enabled',\s*0,/);
    expect(migration).toContain('live_custom_onboarding_allowlist');
    expect(migration).toContain('claim_connect_account_create');
    expect(migration).toContain('grant execute on function public.claim_connect_account_create(uuid) to service_role');
    expect(edge).toContain('liveCustomCreateAllowed');
    expect(edge).toContain('idempotencyKey');
    expect(edge).not.toContain('api_native_express_fallback');
    expect(edge).toContain('No legacy account was created');
  });

  it('does not mark an account verified from form submission alone', () => {
    expect(edge).toContain('verified: connectCanReceiveTransfers');
    expect(
      connectCanReceiveTransfers({
        connect_payouts_enabled: false,
        connect_onboarding_status: 'pending',
        connect_account_livemode: true,
        require_live: true,
      })
    ).toBe(false);
    expect(connectOnboardingLabel('pending', { connect_account_livemode: true })).toBe('Under review');
    expect(connectOnboardingLabel('rejected', { connect_account_livemode: true })).not.toBe('Verified');
  });
});

describe('P9.3 verification lifecycle resume', () => {
  it('routes later Stripe requirements back into the wizard', () => {
    expect(payoutWizardStepForRequirement('individual.verification.document')).toBe('identity');
    expect(payoutWizardStepForRequirement('company.tax_id')).toBe('business');
    expect(payoutWizardStepForRequirement('external_account')).toBe('bank');
    expect(payoutWizardStepForRequirement('tos_acceptance.date')).toBe('identity');
    expect(
      firstOutstandingWizardStep([
        'external_account',
        'individual.verification.document',
        'company.name',
      ])
    ).toBe('business');
    expect(firstOutstandingWizardStep(['individual.verification.additional_document'])).toBe(
      'identity'
    );
    expect(wizard).toContain('Continue verification');
    expect(wizard).toContain('Still needed');
    expect(wizard).toContain('Action required');
  });
});
