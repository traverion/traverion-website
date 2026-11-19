/**
 * P8.8 Unified payout setup wizard — source/unit certification.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAYOUT_WIZARD_SCREENS,
  PAYOUT_WIZARD_STRIPE_AUTH_COPY,
  validatePayoutWizardBusiness,
  emptyPayoutWizardDraft,
} from './payout-setup-wizard';

const root = resolve(__dirname, '../..');
const settings = readFileSync(
  resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
  'utf8'
);
const wizard = readFileSync(
  resolve(root, 'src/components/supplier/PayoutSetupWizard.tsx'),
  'utf8'
);
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);
describe('P8.8 unified payout setup wizard (unit/source)', () => {
  it('defines six focused steps (P9.1) with Traverion-primary collectors', () => {
    expect(PAYOUT_WIZARD_SCREENS.map((s) => s.id)).toEqual([
      'business',
      'representative',
      'identity',
      'bank',
      'preferences',
      'review',
    ]);
    expect(PAYOUT_WIZARD_SCREENS.find((s) => s.id === 'business')?.collector).toBe('traverion');
    expect(PAYOUT_WIZARD_SCREENS.find((s) => s.id === 'representative')?.collector).toBe(
      'traverion'
    );
    expect(PAYOUT_WIZARD_SCREENS.find((s) => s.id === 'bank')?.collector).toBe('traverion');
    expect(PAYOUT_WIZARD_SCREENS.find((s) => s.id === 'identity')?.collector).toBe('mixed');
  });

  it('settings hub launches wizard and no longer stacks long-form sections', () => {
    expect(settings).not.toContain('PayoutSetupWizard');
    expect(settings).toContain('Save preferences');
    expect(settings).toContain('name="payout-frequency"');
    expect(settings).not.toContain('1. Business details');
    expect(settings).not.toContain('groupConnectRequirements');
    expect(settings).not.toContain('EXPRESS_STRIPE_AUTH_LIMITATION');
  });

  it('wizard saves draft, validates business, and uses one Stripe auth notice', () => {
    expect(wizard).toContain('savePayoutWizardDraft');
    expect(wizard).toContain('validatePayoutWizardBusiness');
    expect(wizard).toContain('PAYOUT_WIZARD_STRIPE_AUTH_COPY');
    expect(wizard).toContain('account_onboarding');
    expect(wizard).toContain('account_management');
    expect(wizard).toContain('Continue verification');
    expect(wizard).toContain('expressVerificationMandatory');
    expect(wizard).toMatch(/setShowStripeEmbed\(false\)/);
    expect(wizard).not.toMatch(
      /useStripeEmbed && \(draft\.stripeAuthAcknowledged \|\| !isExpress\)/
    );
    expect(PAYOUT_WIZARD_STRIPE_AUTH_COPY).toMatch(/confirm your email or phone/i);
    expect(
      validatePayoutWizardBusiness(emptyPayoutWizardDraft({ company_legal_name: '' }))
    ).toMatch(/legal business name/i);
  });

  it('keeps Express auth rules and refuses in-place type change (no RN migration)', () => {
    expect(edge).toContain("ensured.accountType === 'custom'");
    expect(edge).toContain('Never create a second LIVE connected account');
    expect(wizard).not.toContain('acct_1UcBXT2FvgTkBmd2');
    expect(settings).not.toContain('acct_1UcBXT2FvgTkBmd2');
  });
});
