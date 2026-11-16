/**
 * P9.1 Fully native supplier payout onboarding — source certification.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONNECT_NATIVE_ONBOARDING } from './connect-native-onboarding-architecture';
import {
  PAYOUT_WIZARD_SCREENS,
  PAYOUT_WIZARD_TOS_COPY,
  emptyPayoutWizardDraft,
  payoutWizardCollectorFor,
  validatePayoutWizardIdentity,
  validatePayoutWizardRepresentative,
} from './payout-setup-wizard';

const root = resolve(__dirname, '../..');
const wizard = readFileSync(
  resolve(root, 'src/components/supplier/PayoutSetupWizard.tsx'),
  'utf8'
);
const page = readFileSync(
  resolve(root, 'src/pages/supplier/SupplierVerificationPage.tsx'),
  'utf8'
);
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);

describe('P9.1 native payout onboarding (unit/source)', () => {
  it('records GO/NO-GO and freezes RN LIVE Express', () => {
    expect(CONNECT_NATIVE_ONBOARDING.decisionId).toBe('P9.1');
    expect(CONNECT_NATIVE_ONBOARDING.wizardStepCount).toBe(6);
    expect(CONNECT_NATIVE_ONBOARDING.goNoGo.nativeWizardForNewCustom).toBe('GO');
    expect(CONNECT_NATIVE_ONBOARDING.goNoGo.retainLiveExpressDualPath).toBe('GO');
    expect(CONNECT_NATIVE_ONBOARDING.goNoGo.migrateRoyalNordicOrLiveExpress).toBe('NO_GO');
    expect(CONNECT_NATIVE_ONBOARDING.goNoGo.enablePayoutExecutionOrTransfers).toBe('NO_GO');
    expect(CONNECT_NATIVE_ONBOARDING.frozenLiveExpressAccountId).toBe('acct_1UcAxbCOlSVGqrHJ');
    expect(CONNECT_NATIVE_ONBOARDING.environments.liveTransfersEnabled).toBe(false);
  });

  it('defines six Traverion wizard steps with Custom-native collectors', () => {
    expect(PAYOUT_WIZARD_SCREENS.map((s) => s.id)).toEqual([
      'business',
      'representative',
      'identity',
      'bank',
      'preferences',
      'review',
    ]);
    expect(payoutWizardCollectorFor('representative', 'custom')).toBe('traverion');
    expect(payoutWizardCollectorFor('bank', 'custom')).toBe('traverion');
    expect(payoutWizardCollectorFor('representative', 'express')).toBe('stripe');
    expect(payoutWizardCollectorFor('bank', 'express')).toBe('stripe');
    expect(payoutWizardCollectorFor('identity', 'express')).toBe('stripe');
    expect(PAYOUT_WIZARD_TOS_COPY).toMatch(/Connected Account Agreement/i);
    expect(
      validatePayoutWizardRepresentative(emptyPayoutWizardDraft({ rep_first_name: '' }))
    ).toMatch(/first name/i);
    expect(validatePayoutWizardIdentity(emptyPayoutWizardDraft({ tos_accepted: false }))).toMatch(
      /Agreement/i
    );
  });

  it('wizard uses Traverion terminology and Custom API actions', () => {
    expect(wizard).toContain('Set up payouts');
    expect(wizard).toContain('submit_representative');
    expect(wizard).toContain('accept_tos');
    expect(wizard).toContain('attach_bank_token');
    expect(wizard).toContain('createBankAccountToken');
    expect(wizard).toContain("You're ready to receive payouts");
    expect(wizard).toContain('Your information is being reviewed');
    expect(wizard).toContain('isExpress');
    expect(wizard).toContain('account_onboarding');
    expect(wizard).not.toContain('acct_1UcAxbCOlSVGqrHJ');
  });

  it('routes /partner/verification through the unified wizard shell', () => {
    expect(page).toContain('PayoutSetupWizard');
    expect(page).not.toContain('SupplierNativeVerificationJourney');
  });

  it('keeps LIVE Express migration guards in the edge function', () => {
    expect(edge).toContain('Never create a second LIVE connected account');
    expect(edge).toContain('start_native_custom');
    expect(edge).toContain('disable_stripe_user_authentication');
    expect(edge).toContain("type: 'custom'");
  });
});
