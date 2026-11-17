import { describe, expect, it } from 'vitest';
import { connectOnboardingLabel } from './connect-payout-status';
import { maskIban } from './supplier-income';
import { bankAlreadyManaged } from './verification-workspace-lifecycle';
import type { SupplierProfileRow } from '../data/supabase-supplier-profile';

function profile(partial: Partial<SupplierProfileRow>): SupplierProfileRow {
  return {
    id: 'u',
    display_name: 'Fixture',
    contact_phone: null,
    payout_method: null,
    payout_iban: null,
    payout_bic: null,
    payout_paypal_email: null,
    business_type: 'company',
    company_legal_name: 'Fixture Oy',
    company_registration_number: null,
    managing_directors: null,
    business_address: null,
    address_street: null,
    address_country: null,
    address_city: null,
    address_postal_code: null,
    tax_id: null,
    vat_id: null,
    verification_status: null,
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
    payment_cycle: null,
    payout_threshold_min: null,
    welcome_email_sent_at: null,
    business_logo_url: null,
    identity_document_path: null,
    company_registration_document_path: null,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('P9.19 income settings presentation helpers', () => {
  it('maps onboarding status to supplier-facing labels without payouts-enabled copy', () => {
    expect(connectOnboardingLabel('not_started')).toBe('Not started');
    expect(connectOnboardingLabel('pending')).toBe('Under review');
    expect(connectOnboardingLabel('restricted')).toBe('Action required');
    expect(connectOnboardingLabel('complete', { connect_account_livemode: true })).toBe('Verified');
    expect(connectOnboardingLabel('complete', { connect_account_livemode: false })).toBe(
      'LIVE onboarding required'
    );
  });

  it('masks IBAN and never returns a full account number', () => {
    expect(maskIban('FI2112345600000785')).toBe('•••• 0785');
    expect(maskIban('FI2112345600000785')).not.toContain('123456');
  });

  it('treats Express/details-submitted accounts as bank managed without requiring local IBAN', () => {
    expect(
      bankAlreadyManaged(
        profile({
          stripe_connected_account_id: 'acct_express_fixture',
          connect_account_type: 'express',
          connect_details_submitted: true,
          connect_onboarding_status: 'complete',
          connect_account_livemode: true,
        })
      )
    ).toBe(true);
    expect(bankAlreadyManaged(profile({ connect_onboarding_status: 'not_started' }))).toBe(false);
  });
});
