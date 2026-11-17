/**
 * P9.16 / P9.18 — Traverion business onboarding wizard (4 steps).
 * Separate from Stripe payout setup. Submits into existing supplier_profiles verification.
 */

import {
  getSupplierBusinessProfileMissingReasons,
  type SupplierBusinessProfileDraft,
} from './supplierOnboarding';
import {
  normalizeCountryCode,
  normalizeFinnishBusinessId,
  normalizeFinnishVatId,
  parseDirectors,
  serializeDirectors,
  validateDirectorsList,
  validateRegistrationNumberForCountry,
  validateVatIdForCountry,
} from './business-identity-validation';

export type BusinessOnboardingStepId =
  | 'identity'
  | 'contact'
  | 'documents'
  | 'review';

export type BusinessOnboardingScreen = {
  id: BusinessOnboardingStepId;
  title: string;
  lede: string;
};

export const BUSINESS_ONBOARDING_SCREENS: BusinessOnboardingScreen[] = [
  {
    id: 'identity',
    title: 'Business details',
    lede: 'Who you are and how you’re registered.',
  },
  {
    id: 'contact',
    title: 'Contact & address',
    lede: 'Phone and registered business address.',
  },
  {
    id: 'documents',
    title: 'Documents',
    lede: 'Upload registration proof.',
  },
  {
    id: 'review',
    title: 'Review',
    lede: 'Check your details, then submit.',
  },
];

export type BusinessOnboardingDraft = {
  step: BusinessOnboardingStepId;
  display_name: string;
  company_legal_name: string;
  business_type: '' | 'company' | 'individual';
  company_registration_number: string;
  tax_id: string;
  vat_id: string;
  /** Structured director names (UI). Serialized to managing_directors on save. */
  directors: string[];
  /** Legacy / DB mirror — kept in sync when directors change. */
  managing_directors: string;
  contact_phone: string;
  address_street: string;
  address_city: string;
  address_postal_code: string;
  address_country: string;
  company_registration_document_path: string;
  owner_authority_confirmed: boolean;
  updatedAt: string;
};

export type BusinessOnboardingFieldErrors = Partial<
  Record<
    | 'display_name'
    | 'company_legal_name'
    | 'business_type'
    | 'company_registration_number'
    | 'tax_id'
    | 'vat_id'
    | 'directors'
    | 'contact_phone'
    | 'address_street'
    | 'address_postal_code'
    | 'address_city'
    | 'address_country'
    | 'company_registration_document_path'
    | 'owner_authority_confirmed',
    string
  >
>;

const DRAFT_PREFIX = 'tv-business-onboarding:v2:';
const DRAFT_PREFIX_LEGACY = 'tv-business-onboarding:v1:';

export function businessOnboardingDraftKey(userId: string): string {
  return `${DRAFT_PREFIX}${userId}`;
}

function syncDirectors(partial: Partial<BusinessOnboardingDraft>): Partial<BusinessOnboardingDraft> {
  if (partial.directors) {
    const directors = partial.directors.length ? partial.directors : [''];
    return {
      ...partial,
      directors,
      managing_directors: serializeDirectors(directors),
    };
  }
  if (typeof partial.managing_directors === 'string' && !partial.directors) {
    return {
      ...partial,
      directors: parseDirectors(partial.managing_directors),
    };
  }
  return partial;
}

export function emptyBusinessOnboardingDraft(
  partial?: Partial<BusinessOnboardingDraft>
): BusinessOnboardingDraft {
  const synced = syncDirectors(partial ?? {});
  const directors =
    synced.directors && synced.directors.length
      ? synced.directors
      : parseDirectors(synced.managing_directors ?? '');
  const base: BusinessOnboardingDraft = {
    step: 'identity',
    display_name: '',
    company_legal_name: '',
    business_type: '',
    company_registration_number: '',
    tax_id: '',
    vat_id: '',
    directors,
    managing_directors: serializeDirectors(directors),
    contact_phone: '',
    address_street: '',
    address_city: '',
    address_postal_code: '',
    address_country: '',
    company_registration_document_path: '',
    owner_authority_confirmed: false,
    updatedAt: new Date().toISOString(),
  };
  const merged = { ...base, ...synced };
  const finalDirectors =
    merged.directors && merged.directors.length ? merged.directors : directors;
  return {
    ...merged,
    directors: finalDirectors,
    managing_directors: serializeDirectors(finalDirectors),
  };
}

export function loadBusinessOnboardingDraft(userId: string): BusinessOnboardingDraft | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw =
      window.localStorage.getItem(businessOnboardingDraftKey(userId)) ??
      window.localStorage.getItem(`${DRAFT_PREFIX_LEGACY}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BusinessOnboardingDraft> & {
      managing_directors?: string;
      directors?: string[];
    };
    if (!parsed || typeof parsed !== 'object') return null;
    return emptyBusinessOnboardingDraft(parsed);
  } catch {
    return null;
  }
}

export function saveBusinessOnboardingDraft(userId: string, draft: BusinessOnboardingDraft): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const next = emptyBusinessOnboardingDraft({
      ...draft,
      directors: draft.directors,
      managing_directors: serializeDirectors(draft.directors),
      updatedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(businessOnboardingDraftKey(userId), JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

export function clearBusinessOnboardingDraft(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.removeItem(businessOnboardingDraftKey(userId));
    window.localStorage.removeItem(`${DRAFT_PREFIX_LEGACY}${userId}`);
  } catch {
    /* ignore */
  }
}

export function businessOnboardingStepIndex(step: BusinessOnboardingStepId): number {
  const i = BUSINESS_ONBOARDING_SCREENS.findIndex((s) => s.id === step);
  return i >= 0 ? i : 0;
}

export function normalizeBusinessOnboardingDraft(
  d: BusinessOnboardingDraft
): BusinessOnboardingDraft {
  const country = normalizeCountryCode(d.address_country);
  let company_registration_number = d.company_registration_number.trim();
  let vat_id = d.vat_id.trim();
  if (country === 'FI' && d.business_type === 'company') {
    if (company_registration_number) {
      company_registration_number = normalizeFinnishBusinessId(company_registration_number);
    }
    if (vat_id) {
      vat_id = normalizeFinnishVatId(vat_id);
    }
  }
  const directors = d.directors.length ? d.directors : [''];
  return {
    ...d,
    address_country: country || d.address_country.trim(),
    company_registration_number,
    vat_id,
    directors,
    managing_directors: serializeDirectors(directors),
  };
}

export function draftToBusinessProfileDraft(d: BusinessOnboardingDraft): SupplierBusinessProfileDraft {
  const n = normalizeBusinessOnboardingDraft(d);
  return {
    display_name: n.display_name,
    company_legal_name: n.company_legal_name,
    contact_phone: n.contact_phone,
    address_street: n.address_street,
    address_city: n.address_city,
    address_postal_code: n.address_postal_code,
    address_country: n.address_country,
    business_type: n.business_type || null,
    company_registration_number: n.company_registration_number,
    tax_id: n.tax_id,
    vat_id: n.vat_id,
    managing_directors: serializeDirectors(n.directors),
    company_registration_document_path: n.company_registration_document_path,
  };
}

export function validateBusinessOnboardingIdentityFields(
  d: BusinessOnboardingDraft
): BusinessOnboardingFieldErrors {
  const n = normalizeBusinessOnboardingDraft(d);
  const errors: BusinessOnboardingFieldErrors = {};
  if (!n.display_name.trim()) errors.display_name = 'Enter your brand name.';
  if (!n.business_type) errors.business_type = 'Select a business type.';
  if (!n.company_legal_name.trim()) {
    errors.company_legal_name = 'Enter your registered legal name.';
  }
  if (n.business_type === 'company') {
    if (!n.company_registration_number.trim()) {
      errors.company_registration_number = 'Enter your company registration number.';
    } else if (normalizeCountryCode(n.address_country) === 'FI') {
      const regErr = validateRegistrationNumberForCountry('FI', n.company_registration_number);
      if (regErr) errors.company_registration_number = regErr;
    }

    const dirErr = validateDirectorsList(n.directors);
    if (dirErr) errors.directors = dirErr;

    if (!n.vat_id.trim()) {
      errors.vat_id = 'Enter your VAT ID.';
    } else if (normalizeCountryCode(n.address_country) === 'FI') {
      const vatErr = validateVatIdForCountry('FI', n.vat_id, { required: true });
      if (vatErr) errors.vat_id = vatErr;
    }
  }
  if (n.business_type === 'individual' && !n.tax_id.trim()) {
    errors.tax_id = 'Enter your tax or business ID.';
  }
  return errors;
}

export function validateBusinessOnboardingContactFields(
  d: BusinessOnboardingDraft
): BusinessOnboardingFieldErrors {
  const n = normalizeBusinessOnboardingDraft(d);
  const errors: BusinessOnboardingFieldErrors = {};
  if (!n.contact_phone.trim()) errors.contact_phone = 'Enter a contact phone number.';
  if (!n.address_street.trim()) errors.address_street = 'Enter your street address.';
  if (!n.address_postal_code.trim()) errors.address_postal_code = 'Enter your postal code.';
  if (!n.address_city.trim()) errors.address_city = 'Enter your city.';
  if (!n.address_country.trim()) errors.address_country = 'Select your country.';

  // Re-check company registration / VAT once country is known.
  if (n.business_type === 'company' && n.address_country.trim()) {
    const regErr = validateRegistrationNumberForCountry(
      n.address_country,
      n.company_registration_number
    );
    if (regErr) errors.company_registration_number = regErr;
    const vatErr = validateVatIdForCountry(n.address_country, n.vat_id, { required: true });
    if (vatErr) errors.vat_id = vatErr;
  }
  return errors;
}

export function validateBusinessOnboardingDocumentFields(
  d: BusinessOnboardingDraft
): BusinessOnboardingFieldErrors {
  const errors: BusinessOnboardingFieldErrors = {};
  if (d.business_type === 'company' && !d.company_registration_document_path.trim()) {
    errors.company_registration_document_path = 'Upload your business registration proof.';
  }
  return errors;
}

export function validateBusinessOnboardingIdentity(d: BusinessOnboardingDraft): string | null {
  const errors = validateBusinessOnboardingIdentityFields(d);
  return Object.values(errors)[0] ?? null;
}

export function validateBusinessOnboardingContact(d: BusinessOnboardingDraft): string | null {
  const errors = validateBusinessOnboardingContactFields(d);
  return Object.values(errors)[0] ?? null;
}

export function validateBusinessOnboardingDocuments(d: BusinessOnboardingDraft): string | null {
  const errors = validateBusinessOnboardingDocumentFields(d);
  return Object.values(errors)[0] ?? null;
}

export function validateBusinessOnboardingReviewFields(
  d: BusinessOnboardingDraft
): BusinessOnboardingFieldErrors {
  const errors: BusinessOnboardingFieldErrors = {
    ...validateBusinessOnboardingIdentityFields(d),
    ...validateBusinessOnboardingContactFields(d),
    ...validateBusinessOnboardingDocumentFields(d),
  };
  if (!d.owner_authority_confirmed) {
    errors.owner_authority_confirmed = 'Confirm you are authorized to submit this application.';
  }
  const gaps = getSupplierBusinessProfileMissingReasons(draftToBusinessProfileDraft(d));
  if (gaps.length && !Object.keys(errors).length) {
    errors.display_name = `Still missing: ${gaps[0]}`;
  }
  return errors;
}

export function validateBusinessOnboardingReview(d: BusinessOnboardingDraft): string | null {
  const errors = validateBusinessOnboardingReviewFields(d);
  return Object.values(errors)[0] ?? null;
}

export function validateBusinessOnboardingStep(
  step: BusinessOnboardingStepId,
  d: BusinessOnboardingDraft
): string | null {
  if (step === 'identity') return validateBusinessOnboardingIdentity(d);
  if (step === 'contact') return validateBusinessOnboardingContact(d);
  if (step === 'documents') return validateBusinessOnboardingDocuments(d);
  return validateBusinessOnboardingReview(d);
}

export function validateBusinessOnboardingStepFields(
  step: BusinessOnboardingStepId,
  d: BusinessOnboardingDraft
): BusinessOnboardingFieldErrors {
  if (step === 'identity') return validateBusinessOnboardingIdentityFields(d);
  if (step === 'contact') return validateBusinessOnboardingContactFields(d);
  if (step === 'documents') return validateBusinessOnboardingDocumentFields(d);
  return validateBusinessOnboardingReviewFields(d);
}

export function firstBusinessOnboardingErrorField(
  errors: BusinessOnboardingFieldErrors
): keyof BusinessOnboardingFieldErrors | null {
  const order: (keyof BusinessOnboardingFieldErrors)[] = [
    'display_name',
    'company_legal_name',
    'business_type',
    'company_registration_number',
    'tax_id',
    'directors',
    'vat_id',
    'contact_phone',
    'address_street',
    'address_postal_code',
    'address_city',
    'address_country',
    'company_registration_document_path',
    'owner_authority_confirmed',
  ];
  for (const key of order) {
    if (errors[key]) return key;
  }
  return null;
}
