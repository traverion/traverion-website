import { describe, expect, it } from 'vitest';
import { onboardingReviewBlocker, onboardingVatId } from './onboarding-final-submission';

const ready = {
  legalName: 'Nordic Oy',
  registrationNumber: '1234567-1',
  street: 'Siljotie 2',
  postal: '96100',
  city: 'Rovaniemi',
  country: 'Finland',
  phone: '+358401234567',
  displayName: '',
  directors: '',
  vatId: '',
  documentPath: 'supplier/company-registration.pdf',
  representativeName: 'Aino Aalto',
  consent: true,
  termsAccepted: true,
  ibanPresent: true,
  dateOfBirthPresent: true,
};

describe('final onboarding submission', () => {
  it('blocks submission until the draft is complete', () => {
    expect(onboardingReviewBlocker({ ...ready, documentPath: '' })).toMatch(/registration document/i);
    expect(onboardingReviewBlocker({ ...ready, ibanPresent: false })).toMatch(/IBAN/);
    expect(onboardingReviewBlocker(ready)).toBeNull();
  });

  it('builds a Finnish VAT ID from the business ID and does not invent one for another country', () => {
    expect(onboardingVatId('FI', '1234567-1', '')).toBe('FI12345671');
    expect(onboardingVatId('SE', '556677-8899', '')).toBe('');
    expect(onboardingVatId('FI', '1234567-1', 'FI99999999')).toBe('FI99999999');
  });
});
