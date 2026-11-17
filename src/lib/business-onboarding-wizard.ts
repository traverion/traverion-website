/**
 * P9.16 — Traverion business onboarding wizard (4 steps).
 * Separate from Stripe payout setup. Submits into existing supplier_profiles verification.
 */

import {
  getSupplierBusinessProfileMissingReasons,
  type SupplierBusinessProfileDraft,
} from './supplierOnboarding';

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

const DRAFT_PREFIX = 'tv-business-onboarding:v1:';

export function businessOnboardingDraftKey(userId: string): string {
  return `${DRAFT_PREFIX}${userId}`;
}

export function emptyBusinessOnboardingDraft(
  partial?: Partial<BusinessOnboardingDraft>
): BusinessOnboardingDraft {
  return {
    step: 'identity',
    display_name: '',
    company_legal_name: '',
    business_type: '',
    company_registration_number: '',
    tax_id: '',
    vat_id: '',
    managing_directors: '',
    contact_phone: '',
    address_street: '',
    address_city: '',
    address_postal_code: '',
    address_country: '',
    company_registration_document_path: '',
    owner_authority_confirmed: false,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export function loadBusinessOnboardingDraft(userId: string): BusinessOnboardingDraft | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage.getItem(businessOnboardingDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BusinessOnboardingDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    return emptyBusinessOnboardingDraft(parsed);
  } catch {
    return null;
  }
}

export function saveBusinessOnboardingDraft(userId: string, draft: BusinessOnboardingDraft): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(
      businessOnboardingDraftKey(userId),
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() })
    );
  } catch {
    /* ignore quota */
  }
}

export function clearBusinessOnboardingDraft(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.removeItem(businessOnboardingDraftKey(userId));
  } catch {
    /* ignore */
  }
}

export function businessOnboardingStepIndex(step: BusinessOnboardingStepId): number {
  const i = BUSINESS_ONBOARDING_SCREENS.findIndex((s) => s.id === step);
  return i >= 0 ? i : 0;
}

export function draftToBusinessProfileDraft(d: BusinessOnboardingDraft): SupplierBusinessProfileDraft {
  return {
    display_name: d.display_name,
    company_legal_name: d.company_legal_name,
    contact_phone: d.contact_phone,
    address_street: d.address_street,
    address_city: d.address_city,
    address_postal_code: d.address_postal_code,
    address_country: d.address_country,
    business_type: d.business_type || null,
    company_registration_number: d.company_registration_number,
    tax_id: d.tax_id,
    company_registration_document_path: d.company_registration_document_path,
  };
}

export function validateBusinessOnboardingIdentity(d: BusinessOnboardingDraft): string | null {
  if (!d.display_name.trim()) return 'Enter your brand or trading name.';
  if (!d.business_type) return 'Select whether you are a registered company or an individual trader.';
  if (!d.company_legal_name.trim()) return 'Enter your registered legal business name.';
  if (d.business_type === 'company' && !d.company_registration_number.trim()) {
    return 'Enter your company registration number.';
  }
  if (d.business_type === 'individual' && !d.tax_id.trim()) {
    return 'Enter your tax or business ID.';
  }
  return null;
}

export function validateBusinessOnboardingContact(d: BusinessOnboardingDraft): string | null {
  if (!d.contact_phone.trim()) return 'Enter a contact phone number.';
  if (!d.address_street.trim()) return 'Enter your street address.';
  if (!d.address_city.trim()) return 'Enter your city.';
  if (!d.address_postal_code.trim()) return 'Enter your postal code.';
  if (!d.address_country.trim()) return 'Select your country.';
  return null;
}

export function validateBusinessOnboardingDocuments(d: BusinessOnboardingDraft): string | null {
  if (!d.company_registration_document_path.trim()) {
    return 'Upload your business registration proof (PDF or image).';
  }
  return null;
}

export function validateBusinessOnboardingReview(d: BusinessOnboardingDraft): string | null {
  const identity = validateBusinessOnboardingIdentity(d);
  if (identity) return identity;
  const contact = validateBusinessOnboardingContact(d);
  if (contact) return contact;
  const docs = validateBusinessOnboardingDocuments(d);
  if (docs) return docs;
  if (!d.owner_authority_confirmed) {
    return 'Confirm you are the owner or an authorized representative.';
  }
  const gaps = getSupplierBusinessProfileMissingReasons(draftToBusinessProfileDraft(d));
  if (gaps.length) return `Still missing: ${gaps[0]}`;
  return null;
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
