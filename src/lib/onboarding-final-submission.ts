import { emptyBusinessOnboardingDraft, type BusinessOnboardingDraft } from './business-onboarding-wizard';
import { isValidFinnishBusinessId, normalizeCountryCode, normalizeFinnishBusinessId } from './business-identity-validation';

export type OnboardingReviewInput = {
  legalName: string;
  registrationNumber: string;
  street: string;
  postal: string;
  city: string;
  country: string;
  phone: string;
  displayName: string;
  directors: string;
  vatId: string;
  documentPath: string;
  representativeName: string;
  consent: boolean;
  termsAccepted: boolean;
  ibanPresent: boolean;
  dateOfBirthPresent: boolean;
};

/** Problems that must be fixed before any payout account is opened. */
export function onboardingReviewBlocker(input: OnboardingReviewInput): string | null {
  if (!input.legalName.trim()) return 'Enter the registered legal business name.';
  if (!input.street.trim() || !input.postal.trim() || !input.city.trim() || !input.country.trim()) {
    return 'Enter the full registered business address.';
  }
  const country = normalizeCountryCode(input.country);
  if (country === 'FI' && !isValidFinnishBusinessId(input.registrationNumber)) {
    return 'Enter a valid Finnish business ID.';
  }
  if (country !== 'FI' && input.registrationNumber.trim().length < 3) return 'Enter the business registration number.';
  if (!input.documentPath.trim()) return 'Add the registration document.';
  if (!input.representativeName.trim()) return 'Enter the representative’s name.';
  if (!input.dateOfBirthPresent) return 'Enter the representative’s date of birth.';
  if (!input.consent) return 'Confirm that Traverion may send these details.';
  if (!input.termsAccepted) return 'Accept the payout terms.';
  if (!input.ibanPresent) return 'Enter the company IBAN.';
  if (!input.phone.trim()) return 'A contact phone is required before setup can be submitted.';
  return null;
}

/** Finnish VAT is the business ID with an FI prefix. Other countries keep a saved VAT ID only. */
export function onboardingVatId(country: string, registrationNumber: string, savedVat: string): string {
  const existing = savedVat.trim();
  if (existing) return existing;
  if (normalizeCountryCode(country) !== 'FI') return '';
  const normalized = normalizeFinnishBusinessId(registrationNumber);
  const digits = normalized.replace(/\D/g, '');
  return digits.length === 8 ? `FI${digits}` : '';
}

export function onboardingBusinessReviewDraft(input: OnboardingReviewInput): BusinessOnboardingDraft {
  const legal = input.legalName.trim();
  const representative = input.representativeName.trim();
  const directors = input.directors.trim() || representative;
  return emptyBusinessOnboardingDraft({
    display_name: input.displayName.trim() || legal,
    company_legal_name: legal,
    business_type: 'company',
    company_registration_number: input.registrationNumber.trim(),
    vat_id: onboardingVatId(input.country, input.registrationNumber, input.vatId),
    directors: directors ? [directors] : [],
    contact_phone: input.phone.trim(),
    address_street: input.street.trim(),
    address_postal_code: input.postal.trim(),
    address_city: input.city.trim(),
    address_country: input.country.trim(),
    company_registration_document_path: input.documentPath.trim(),
    owner_authority_confirmed: input.consent,
  });
}
