import { describe, expect, it } from 'vitest';
import {
  isSupplierBusinessProfileComplete,
  isSupplierBusinessProfileCompleteForPublish,
  isSupplierReadyToPublishTours,
  partnerPayoutVerifiedStatusNote,
} from './supplierOnboarding';
import type { SupplierProfileRow } from '../data/supabase-supplier-profile';

function profile(partial: Partial<SupplierProfileRow>): SupplierProfileRow {
  return {
    id: 'u1',
    display_name: 'Aurora',
    contact_phone: null,
    payout_method: null,
    payout_iban: 'FI2112345600000785',
    payout_bic: 'NDEAFIHH',
    payout_paypal_email: null,
    business_type: 'company',
    company_legal_name: 'Aurora Lapland Experiences Oy',
    company_registration_number: '1234567-8',
    managing_directors: null,
    business_address: 'Koskikatu 1, 96200 Rovaniemi, Finland',
    address_street: 'Koskikatu 1',
    address_country: 'Finland',
    address_city: 'Rovaniemi',
    address_postal_code: '96200',
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

describe('partner payout-verified status copy', () => {
  it('does not say business verification is still required when business is already verified', () => {
    const bothVerified = partnerPayoutVerifiedStatusNote(true);
    const payoutOnly = partnerPayoutVerifiedStatusNote(false);
    expect(bothVerified.toLowerCase()).toContain('bank details approved');
    expect(bothVerified.toLowerCase()).not.toContain('still required');
    expect(payoutOnly.toLowerCase()).toContain('bank details approved');
    expect(payoutOnly.toLowerCase()).toContain('business verification is still required');
  });
});

describe('verified supplier publish gate', () => {
  it('allows publish when verified even if registration document path is missing', () => {
    const row = profile({ company_registration_document_path: null });
    expect(isSupplierBusinessProfileComplete(row)).toBe(false);
    expect(isSupplierBusinessProfileCompleteForPublish(row)).toBe(true);
    expect(isSupplierReadyToPublishTours(row)).toBe(true);
  });

  it('still requires registration proof before verification', () => {
    const row = profile({
      verification_status: 'pending',
      company_registration_document_path: null,
    });
    expect(isSupplierBusinessProfileComplete(row)).toBe(false);
    expect(isSupplierBusinessProfileCompleteForPublish(row)).toBe(false);
    expect(isSupplierReadyToPublishTours(row)).toBe(false);
  });
});
