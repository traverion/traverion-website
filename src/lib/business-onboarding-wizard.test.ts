import { describe, expect, it } from 'vitest';
import {
  emptyBusinessOnboardingDraft,
  validateBusinessOnboardingContact,
  validateBusinessOnboardingDocuments,
  validateBusinessOnboardingIdentity,
  validateBusinessOnboardingReview,
  validateBusinessOnboardingIdentityFields,
} from './business-onboarding-wizard';

const companyBase = {
  display_name: 'Nordic Tours',
  company_legal_name: 'Nordic Oy',
  business_type: 'company' as const,
  company_registration_number: '1234567-1',
  vat_id: 'FI12345671',
  directors: ['Ada Lovelace'],
  address_country: 'FI',
};

describe('business onboarding wizard validation', () => {
  it('requires identity fields including directors and VAT for companies', () => {
    expect(validateBusinessOnboardingIdentity(emptyBusinessOnboardingDraft())).toMatch(/brand/i);
    expect(
      validateBusinessOnboardingIdentity(
        emptyBusinessOnboardingDraft({
          ...companyBase,
        })
      )
    ).toBeNull();

    const missingDirector = validateBusinessOnboardingIdentityFields(
      emptyBusinessOnboardingDraft({
        ...companyBase,
        directors: [''],
      })
    );
    expect(missingDirector.directors).toMatch(/director/i);

    const badVat = validateBusinessOnboardingIdentityFields(
      emptyBusinessOnboardingDraft({
        ...companyBase,
        vat_id: 'FI12345678',
      })
    );
    expect(badVat.vat_id).toMatch(/vat/i);
  });

  it('requires contact address', () => {
    expect(
      validateBusinessOnboardingContact(
        emptyBusinessOnboardingDraft({
          ...companyBase,
          contact_phone: '+358401234567',
          address_street: 'Street 1',
          address_city: 'Rovaniemi',
          address_postal_code: '96100',
          address_country: 'FI',
        })
      )
    ).toBeNull();
  });

  it('requires document for companies and authority on review', () => {
    const base = emptyBusinessOnboardingDraft({
      ...companyBase,
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

  it('does not require registration document for individual traders', () => {
    expect(
      validateBusinessOnboardingDocuments(
        emptyBusinessOnboardingDraft({
          business_type: 'individual',
          company_registration_document_path: '',
        })
      )
    ).toBeNull();
  });
});
