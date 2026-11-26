/**
 * Focused supplier onboarding screens — one question at a time,
 * same progression idea as tour, rental, and stay creation.
 */

export const SUPPLIER_ONBOARDING_SCREENS = [
  {
    id: 'company',
    group: 'Company',
    phase: 'business',
    title: 'Business details',
    body: 'Enter your company details as they appear in the official business register.',
  },
  {
    id: 'address',
    group: 'Company',
    phase: 'business',
    title: 'Business address',
    body: 'Enter your company’s registered business address.',
  },
  {
    id: 'documents',
    group: 'Documents',
    phase: 'documents',
    title: 'Registration document',
    body: 'Upload your company’s official registration document.',
  },
  {
    id: 'person',
    group: 'Identity',
    phase: 'representative',
    title: 'Personal details',
    body: 'The person who legally represents the business.',
  },
  {
    id: 'dob',
    group: 'Identity',
    phase: 'representative',
    title: 'What is their date of birth?',
    body: 'Enter the date of birth for the person who represents the business.',
  },
  {
    id: 'director',
    group: 'Identity',
    phase: 'representative',
    title: 'Role and ownership',
    body: 'Whether this person is a director, and whether they own part of the company.',
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
    title: 'Other owners',
    body: 'Add anyone else who owns 25% or more.',
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
    title: 'Confirm the representative',
    body: 'Confirm that these details are correct.',
  },
  {
    id: 'bank',
    group: 'Bank',
    phase: 'payout',
    title: 'Payout account',
    body: 'The company account that receives payouts.',
  },
  {
    id: 'terms',
    group: 'Bank',
    phase: 'payout',
    title: 'Accept the payout terms',
    body: 'Review and accept the payout terms.',
  },
  {
    id: 'status',
    group: 'Verification',
    phase: 'status',
    title: 'Review',
    body: 'Check the details before you continue.',
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
  const ids: SupplierOnboardingScreenId[] = ['company', 'address'];
  if (!input.hasRegistrationFile || input.businessRejected) ids.push('documents');
  if (input.identityOpen) {
    ids.push('person');
    if (input.isCompany) ids.push('director');
    if (input.isCompany && !(input.owns && input.share === 100)) ids.push('others');
    ids.push('bank');
  } else if (input.bankOpen) ids.push('bank');
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

export const ONBOARDING_PHASE_STEPS = [
  { phase: 'business', label: 'Company' },
  { phase: 'documents', label: 'Documents' },
  { phase: 'representative', label: 'Identity' },
  { phase: 'payout', label: 'Payouts' },
  { phase: 'status', label: 'Review' },
] as const;

export function onboardingPhaseIndex(phase: SupplierOnboardingPhase): number {
  return ONBOARDING_PHASE_STEPS.findIndex((step) => step.phase === phase);
}

export function onboardingPhaseEntryScreen(
  phase: SupplierOnboardingPhase,
  visible: readonly SupplierOnboardingScreenId[]
): SupplierOnboardingScreenId | null {
  return visible.find((id) => supplierOnboardingScreen(id).phase === phase) ?? null;
}

/** Completed phases can be reopened only when that phase still has a screen in the journey. */
export function canRevisitOnboardingPhase(
  phase: SupplierOnboardingPhase,
  current: SupplierOnboardingPhase,
  visible: readonly SupplierOnboardingScreenId[]
): boolean {
  if (onboardingPhaseIndex(phase) < 0 || onboardingPhaseIndex(phase) >= onboardingPhaseIndex(current)) return false;
  return onboardingPhaseEntryScreen(phase, visible) != null;
}

const ONBOARDING_SCREEN_ORDER = SUPPLIER_ONBOARDING_SCREENS.map((screen) => screen.id);

/** Place the open screen in journey order so the counter and bar share one position. */
export function onboardingOverallStep(
  visible: readonly SupplierOnboardingScreenId[],
  screen: SupplierOnboardingScreenId
): { index: number; total: number } {
  const steps = visible.includes(screen) ? [...visible] : insertOnboardingScreen(visible, screen);
  const index = Math.max(0, steps.indexOf(screen));
  return { index: index + 1, total: Math.max(steps.length, 1) };
}

function insertOnboardingScreen(
  visible: readonly SupplierOnboardingScreenId[],
  screen: SupplierOnboardingScreenId
): SupplierOnboardingScreenId[] {
  const next = [...visible];
  const order = ONBOARDING_SCREEN_ORDER.indexOf(screen);
  const at = next.findIndex((id) => ONBOARDING_SCREEN_ORDER.indexOf(id) > order);
  next.splice(at === -1 ? next.length : at, 0, screen);
  return next;
}

export function companyOnboardingPresentation(input: {
  verified: boolean;
  pendingReview: boolean;
  hasCompany: boolean;
}): { title: string; body: string; mode: 'form' | 'draft' | 'pending' | 'verified' } {
  if (input.verified && input.hasCompany) {
    return {
      title: 'Confirm your company',
      body: '',
      mode: 'verified',
    };
  }
  if (input.pendingReview && input.hasCompany) {
    return {
      title: 'Business details',
      body: '',
      mode: 'pending',
    };
  }
  if (input.hasCompany) {
    return {
      title: 'Business details',
      body: 'Enter your company details as they appear in the official business register.',
      mode: 'draft',
    };
  }
  return {
    title: 'Business details',
    body: 'Enter your company details as they appear in the official business register.',
    mode: 'form',
  };
}

export function screenFromOnboardingUrl(
  search: string,
  visible: readonly SupplierOnboardingScreenId[],
  opts?: { forceCompany?: boolean }
): SupplierOnboardingScreenId {
  if (opts?.forceCompany) return 'company';
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('screen');
  const requested =
    raw === 'dob'
      ? 'person'
      : raw === 'ownership' || raw === 'share'
        ? 'director'
        : raw === 'owner'
          ? 'others'
          : raw === 'consent' || raw === 'terms'
            ? 'bank'
            : raw;
  if (requested === 'documents' || requested === 'company' || requested === 'bank') {
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
