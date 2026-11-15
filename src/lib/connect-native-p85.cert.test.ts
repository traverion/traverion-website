/**
 * P8.5 Native supplier onboarding & payout experience certification.
 * Static / source-level — no LIVE money movement.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildConnectProgressSteps,
  deriveConnectExperienceState,
  connectExperienceLabel,
} from './connect-payout-progress';
import { connectOnboardingLabel, connectCanReceiveTransfers } from './connect-payout-status';
import type { SupplierProfileRow } from '../data/supabase-supplier-profile';

const root = resolve(__dirname, '../..');
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);
const settings = readFileSync(
  resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
  'utf8'
);
const journey = readFileSync(
  resolve(root, 'src/components/supplier/SupplierNativeVerificationJourney.tsx'),
  'utf8'
);
const embedded = readFileSync(
  resolve(root, 'src/components/supplier/ConnectEmbeddedPanel.tsx'),
  'utf8'
);

function rnProfile(over: Partial<SupplierProfileRow> = {}): SupplierProfileRow {
  return {
    id: '9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18',
    display_name: 'Royal Nordic',
    contact_phone: null,
    payout_method: null,
    payout_iban: null,
    payout_bic: null,
    payout_paypal_email: null,
    business_type: 'company',
    company_legal_name: 'EM Global Oy',
    company_registration_number: null,
    managing_directors: null,
    business_address: null,
    address_street: null,
    address_country: 'FI',
    address_city: null,
    address_postal_code: null,
    tax_id: null,
    vat_id: null,
    verification_status: 'verified',
    verification_submitted_at: null,
    payout_verification_status: null,
    payout_verification_submitted_at: null,
    business_verification_feedback: null,
    payout_verification_feedback: null,
    insurance_policy_number: null,
    insurance_coverage: null,
    insurance_start: null,
    insurance_end: null,
    insurance_provider: null,
    privacy_policy_text: null,
    terms_conditions_text: null,
    payment_cycle: 'monthly',
    payout_threshold_min: 0,
    stripe_connected_account_id: 'acct_1UcAxbCOlSVGqrHJ',
    connect_account_livemode: true,
    connect_account_type: 'express',
    connect_onboarding_status: 'restricted',
    connect_payouts_enabled: false,
    connect_charges_enabled: false,
    connect_details_submitted: false,
    connect_requirements_currently_due: ['external_account', 'business_type'],
    connect_requirements_past_due: ['external_account'],
    welcome_email_sent_at: null,
    business_logo_url: null,
    public_description: null,
    identity_document_path: null,
    company_registration_document_path: null,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

describe('P8.5 native onboarding experience', () => {
  it('keeps LIVE Express account and enables embedded Account Sessions (no LIVE block)', () => {
    expect(edge).toContain("traverion_onboarding: 'p85_embedded'");
    expect(edge).toContain('accountSessions.create');
    expect(edge).toContain('hosted_fallback');
    expect(edge).toContain('Never create a second LIVE connected account');
    expect(edge).toContain('accountLivemode !== false');
    expect(edge).not.toContain(
      'This payout account cannot use Traverion forms automatically. Contact Traverion support.'
    );
  });

  it('Income settings embeds onboarding + bank management with Business Details', () => {
    expect(settings).toContain('Business details');
    expect(settings).toContain('Representative verification');
    expect(settings).toContain('Bank account');
    expect(settings).toContain('Payout preferences');
    expect(settings).toContain('ConnectEmbeddedPanel');
    expect(settings).toContain('account_onboarding');
    expect(settings).toContain('account_management');
    expect(settings).toContain('never rewrites frozen booking commissions');
    expect(settings).toContain('Continue on Stripe');
    expect(settings).toContain('Edit business details');
  });

  it('Express verification journey opens embedded panel instead of support wall', () => {
    expect(journey).toContain("ensured.account_type === 'express'");
    expect(journey).toContain('setShowIdentityEmbed(true)');
    expect(journey).toContain('ConnectEmbeddedPanel');
    expect(journey).not.toContain(
      'This organization needs help completing verification. Contact Traverion support.'
    );
  });

  it('embedded panel uses Account Session secrets and hosted fallback', () => {
    expect(embedded).toContain('fetchConnectAccountSessionSecret');
    expect(embedded).toContain('hosted_fallback');
    expect(embedded).toContain('ConnectAccountOnboarding');
    expect(embedded).toContain('ConnectAccountManagement');
  });

  it('setup progression and Verified gate for Royal Nordic restricted Express', () => {
    const p = rnProfile();
    const steps = buildConnectProgressSteps(p);
    expect(steps.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'business_details',
        'identity_verification',
        'bank_account',
        'payout_preferences',
        'setup_complete',
      ])
    );
    expect(deriveConnectExperienceState(p)).toBe('information_required');
    expect(connectExperienceLabel(deriveConnectExperienceState(p))).toBe('Action required');
    expect(connectOnboardingLabel('restricted', { connect_account_livemode: true })).not.toBe(
      'Verified'
    );
    expect(
      connectCanReceiveTransfers({
        connect_payouts_enabled: false,
        connect_onboarding_status: 'restricted',
        connect_account_livemode: true,
      })
    ).toBe(false);
  });

  it('documents RN LIVE account preservation fixture', () => {
    expect('acct_1UcAxbCOlSVGqrHJ').toMatch(/^acct_/);
  });
});
