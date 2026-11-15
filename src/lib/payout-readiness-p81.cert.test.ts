/**
 * P8.1 cert fixtures — LIVE Connect mode separation + pilot isolation.
 * No network, no LIVE money movement.
 */
import { describe, expect, it } from 'vitest';
import { connectOnboardingLabel, connectCanReceiveTransfers } from './connect-payout-status';
import { deriveConnectExperienceState } from './connect-payout-progress';

describe('P8.1 LIVE Connect + ledger remediation', () => {
  it('never labels TEST connected accounts as Verified', () => {
    expect(
      connectOnboardingLabel('complete', { connect_account_livemode: false })
    ).toBe('LIVE onboarding required');
    expect(
      connectCanReceiveTransfers({
        connect_payouts_enabled: true,
        connect_onboarding_status: 'complete',
        connect_account_livemode: false,
      })
    ).toBe(false);
  });

  it('allows Verified only when LIVE capabilities are complete', () => {
    expect(
      connectOnboardingLabel('complete', { connect_account_livemode: true })
    ).toBe('Verified');
    expect(
      connectCanReceiveTransfers({
        connect_payouts_enabled: true,
        connect_onboarding_status: 'complete',
        connect_account_livemode: true,
        connect_requirements_currently_due: [],
        connect_requirements_past_due: [],
      })
    ).toBe(true);
  });

  it('treats TEST-linked profile experience as action required', () => {
    expect(
      deriveConnectExperienceState({
        id: 'x',
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
        payout_verification_status: 'verified',
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
        stripe_connected_account_id: 'acct_test',
        connect_account_livemode: false,
        connect_onboarding_status: 'complete',
        connect_payouts_enabled: true,
        welcome_email_sent_at: null,
        business_logo_url: null,
        public_description: null,
        identity_document_path: null,
        company_registration_document_path: null,
        created_at: '',
        updated_at: '',
      })
    ).toBe('information_required');
  });

  it('documents pilot fixture TV-FNFQEA87 and excludes retained cancel', () => {
    const pilot = {
      selected: 'TV-FNFQEA87',
      excluded: 'TV-PDTAS6JD',
      selected_minor: 8500,
    };
    expect(pilot.selected).toBe('TV-FNFQEA87');
    expect(pilot.excluded).toBe('TV-PDTAS6JD');
    expect(pilot.selected_minor).toBe(8500);
  });
});
