/**
 * Focused supplier onboarding screens — one question at a time,
 * same progression idea as tour, rental, and stay creation.
 */

export const SUPPLIER_ONBOARDING_SCREENS = [
  {
    id: 'company',
    group: 'Company',
    phase: 'business',
    title: 'Confirm your company',
    body: 'This is the verified company record.',
  },
  {
    id: 'documents',
    group: 'Documents',
    phase: 'documents',
    title: 'Registration document',
    body: 'One document for the company.',
  },
  {
    id: 'person',
    group: 'Identity',
    phase: 'representative',
    title: 'Who acts for this company?',
    body: 'The name already saved for this person.',
  },
  {
    id: 'dob',
    group: 'Identity',
    phase: 'representative',
    title: 'What is their date of birth?',
    body: 'Used for verification. Traverion does not store the date.',
  },
  {
    id: 'director',
    group: 'Identity',
    phase: 'representative',
    title: 'Is this person a director?',
    body: 'A director is named on the company record.',
  },
  {
    id: 'ownership',
    group: 'Identity',
    phase: 'representative',
    title: 'Do they own part of the company?',
    body: 'Ownership means a share of the company.',
  },
  {
    id: 'share',
    group: 'Identity',
    phase: 'representative',
    title: 'What percentage do they own?',
    body: 'Use 100 if they own the company outright.',
  },
  {
    id: 'others',
    group: 'Identity',
    phase: 'representative',
    title: 'Does anyone else own 25% or more?',
    body: 'Only people with a significant share need to be added.',
  },
  {
    id: 'owner',
    group: 'Identity',
    phase: 'representative',
    title: 'Who else owns part of the company?',
    body: 'Their name, date of birth, and share.',
  },
  {
    id: 'consent',
    group: 'Identity',
    phase: 'representative',
    title: 'Send this for verification?',
    body: 'Traverion sends the verified company record and this person’s name and date of birth.',
  },
  {
    id: 'bank',
    group: 'Bank',
    phase: 'payout',
    title: 'Where should payouts go?',
    body: 'The account holder is the verified company.',
  },
  {
    id: 'terms',
    group: 'Bank',
    phase: 'payout',
    title: 'Accept the payout terms',
    body: 'The IBAN is checked on this device, then sent as a secure token.',
  },
  {
    id: 'status',
    group: 'Verification',
    phase: 'status',
    title: 'Verification pending',
    body: 'This page updates when the review moves forward.',
  },
] as const;

export type SupplierOnboardingScreenId = (typeof SUPPLIER_ONBOARDING_SCREENS)[number]['id'];

export type SupplierOnboardingPhase = (typeof SUPPLIER_ONBOARDING_SCREENS)[number]['phase'];

const SCREEN_BY_ID = Object.fromEntries(
  SUPPLIER_ONBOARDING_SCREENS.map((screen) => [screen.id, screen])
) as Record<SupplierOnboardingScreenId, (typeof SUPPLIER_ONBOARDING_SCREENS)[number]>;

export function supplierOnboardingScreen(id: SupplierOnboardingScreenId) {
  return SCREEN_BY_ID[id];
}

export type SupplierOnboardingVisibility = {
  isCompany: boolean;
  hasRegistrationFile: boolean;
  businessRejected: boolean;
  identityOpen: boolean;
  owns: boolean;
  share: number | null;
  others: boolean | null;
  hasExtraOwner: boolean;
  bankOpen: boolean;
  termsOpen: boolean;
};

export function visibleSupplierOnboardingScreens(
  input: SupplierOnboardingVisibility
): SupplierOnboardingScreenId[] {
  const ids: SupplierOnboardingScreenId[] = ['company'];
  if (!input.hasRegistrationFile || input.businessRejected) ids.push('documents');
  if (input.identityOpen) {
    ids.push('person', 'dob');
    if (input.isCompany) {
      ids.push('director', 'ownership');
      if (input.owns) ids.push('share');
      if (!(input.owns && input.share === 100)) ids.push('others');
      if (input.others === true || input.hasExtraOwner) ids.push('owner');
    }
    ids.push('consent');
  }
  if (input.bankOpen || input.termsOpen) ids.push('bank', 'terms');
  ids.push('status');
  return ids;
}

export function onboardingGroupProgress(
  visible: readonly SupplierOnboardingScreenId[],
  id: SupplierOnboardingScreenId
): { group: string; index: number; total: number } {
  const screen = supplierOnboardingScreen(id);
  const group = visible.filter((item) => supplierOnboardingScreen(item).group === screen.group);
  const index = Math.max(0, group.indexOf(id));
  return { group: screen.group, index: index + 1, total: group.length };
}

export function screenFromOnboardingUrl(
  search: string,
  visible: readonly SupplierOnboardingScreenId[]
): SupplierOnboardingScreenId {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const requested = params.get('screen');
  if (requested === 'documents' || requested === 'company') {
    return requested;
  }
  if (requested && visible.includes(requested as SupplierOnboardingScreenId)) {
    return requested as SupplierOnboardingScreenId;
  }
  const phase = params.get('phase');
  if (phase === 'documents') return 'documents';
  if (phase) {
    const match = visible.find((id) => supplierOnboardingScreen(id).phase === phase);
    if (match) return match;
    const any = SUPPLIER_ONBOARDING_SCREENS.find((screen) => screen.phase === phase);
    if (any && visible.includes(any.id)) return any.id;
  }
  return visible[0] ?? 'company';
}

export function requirementFlags(due: readonly string[], hasAccount: boolean): {
  identityOpen: boolean;
  bankOpen: boolean;
  termsOpen: boolean;
} {
  if (!hasAccount) return { identityOpen: true, bankOpen: true, termsOpen: true };
  const keys = due.map((key) => key.toLowerCase());
  return {
    identityOpen: keys.some((key) =>
      /director|dob|first_name|last_name|owner|representative|verification\.document|primary_verification/.test(key)
    ),
    bankOpen: keys.some((key) => /external_account|bank_account/.test(key)),
    termsOpen: keys.some((key) => /tos_acceptance/.test(key)),
  };
}
