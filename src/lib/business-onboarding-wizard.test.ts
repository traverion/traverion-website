import { describe, expect, it } from 'vitest';
import {
  emptyBusinessOnboardingDraft,
  validateBusinessOnboardingContact,
  validateBusinessOnboardingDocuments,
  validateBusinessOnboardingIdentity,
  validateBusinessOnboardingReview,
} from './business-onboarding-wizard';

describe('business onboarding wizard validation', () => {
  it('requires identity fields', () => {
    expect(validateBusinessOnboardingIdentity(emptyBusinessOnboardingDraft())).toMatch(/brand/i);
    expect(
      validateBusinessOnboardingIdentity(
        emptyBusinessOnboardingDraft({
          display_name: 'Nordic Tours',
          company_legal_name: 'Nordic Oy',
          business_type: 'company',
          company_registration_number: '123',
        })
      )
    ).toBeNull();
  });

  it('requires contact address', () => {
    expect(
      validateBusinessOnboardingContact(
        emptyBusinessOnboardingDraft({
          contact_phone: '+358401234567',
          address_street: 'Street 1',
          address_city: 'Rovaniemi',
          address_postal_code: '96100',
          address_country: 'FI',
        })
      )
    ).toBeNull();
  });

  it('requires document and authority on review', () => {
    const base = emptyBusinessOnboardingDraft({
      display_name: 'Nordic Tours',
      company_legal_name: 'Nordic Oy',
      business_type: 'company',
      company_registration_number: '1234567-8',
      contact_phone: '+358401234567',
      address_street: 'Street 1',
      address_city: 'Rovaniemi',
      address_postal_code: '96100',
      address_country: 'FI',
      company_registration_document_path: 'uid/company-registration.pdf',
    });
    expect(validateBusinessOnboardingDocuments(base)).toBeNull();
    expect(validateBusinessOnboardingReview(base)).toMatch(/authorized/i);
    expect(
      validateBusinessOnboardingReview({ ...base, owner_authority_confirmed: true })
    ).toBeNull();
  });
});
