/**
 * P8.8 Unified payout setup wizard — step model + draft resume.
 * Express embedded path: Traverion owns business/preferences; Stripe owns identity/bank.
 */

export type PayoutWizardStepId =
  | 'business'
  | 'representative'
  | 'bank'
  | 'preferences'
  | 'review';

export type PayoutWizardScreen = {
  id: PayoutWizardStepId;
  title: string;
  lede: string;
  /** Who drives collection for this step. */
  collector: 'traverion' | 'stripe' | 'mixed';
};

export const PAYOUT_WIZARD_SCREENS: PayoutWizardScreen[] = [
  {
    id: 'business',
    title: 'Business details',
    lede: 'Confirm the company information used for payouts.',
    collector: 'traverion',
  },
  {
    id: 'representative',
    title: 'Representative verification',
    lede: 'Verify the person authorized to manage this account.',
    collector: 'stripe',
  },
  {
    id: 'bank',
    title: 'Bank account',
    lede: 'Add where payouts should be sent. Full account numbers stay with Stripe.',
    collector: 'stripe',
  },
  {
    id: 'preferences',
    title: 'Payout preferences',
    lede: 'Choose how often you prefer payouts and a minimum amount.',
    collector: 'traverion',
  },
  {
    id: 'review',
    title: 'Review and finish',
    lede: 'Confirm what’s done and what still needs attention.',
    collector: 'mixed',
  },
];

export type PayoutWizardDraft = {
  step: PayoutWizardStepId;
  company_legal_name: string;
  business_type: '' | 'company' | 'individual';
  company_registration_number: string;
  address_street: string;
  address_city: string;
  address_postal_code: string;
  address_country: string;
  contact_phone: string;
  managing_directors: string;
  payment_cycle: '' | 'monthly' | 'biweekly';
  payout_threshold_min: string;
  /** Partner acknowledged the single Stripe auth notice for this draft. */
  stripeAuthAcknowledged: boolean;
  /** Soft markers — never claim Stripe verification complete without provider state. */
  businessSavedAt: string | null;
  preferencesSavedAt: string | null;
  updatedAt: string;
};

const DRAFT_PREFIX = 'tv-payout-wizard:v1:';

export function payoutWizardDraftKey(userId: string): string {
  return `${DRAFT_PREFIX}${userId}`;
}

export function emptyPayoutWizardDraft(
  partial?: Partial<PayoutWizardDraft>
): PayoutWizardDraft {
  return {
    step: 'business',
    company_legal_name: '',
    business_type: '',
    company_registration_number: '',
    address_street: '',
    address_city: '',
    address_postal_code: '',
    address_country: '',
    contact_phone: '',
    managing_directors: '',
    payment_cycle: '',
    payout_threshold_min: '',
    stripeAuthAcknowledged: false,
    businessSavedAt: null,
    preferencesSavedAt: null,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export function loadPayoutWizardDraft(userId: string): PayoutWizardDraft | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(payoutWizardDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PayoutWizardDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    const step = PAYOUT_WIZARD_SCREENS.some((s) => s.id === parsed.step)
      ? (parsed.step as PayoutWizardStepId)
      : 'business';
    return emptyPayoutWizardDraft({ ...parsed, step });
  } catch {
    return null;
  }
}

export function savePayoutWizardDraft(userId: string, draft: PayoutWizardDraft): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      payoutWizardDraftKey(userId),
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() })
    );
  } catch {
    // Ignore quota / private mode.
  }
}

export function clearPayoutWizardDraft(userId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(payoutWizardDraftKey(userId));
  } catch {
    // ignore
  }
}

export function payoutWizardStepIndex(step: PayoutWizardStepId): number {
  return Math.max(
    0,
    PAYOUT_WIZARD_SCREENS.findIndex((s) => s.id === step)
  );
}

export function validatePayoutWizardBusiness(draft: PayoutWizardDraft): string | null {
  if (!draft.company_legal_name.trim()) return 'Enter the legal business name.';
  if (!draft.business_type) return 'Select a business type.';
  if (!draft.address_street.trim()) return 'Enter the street address.';
  if (!draft.address_city.trim()) return 'Enter the city.';
  if (!draft.address_postal_code.trim()) return 'Enter the postal code.';
  if (!draft.address_country.trim()) return 'Enter the country code (for example FI).';
  return null;
}

export function validatePayoutWizardPreferences(draft: PayoutWizardDraft): string | null {
  if (draft.payment_cycle !== 'monthly' && draft.payment_cycle !== 'biweekly') {
    return 'Choose monthly or twice monthly.';
  }
  const t = draft.payout_threshold_min.trim();
  if (!t) return 'Enter a minimum payout threshold.';
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 'Enter a valid minimum amount.';
  return null;
}

/** Short partner-facing auth copy — shown once in the wizard. */
export const PAYOUT_WIZARD_STRIPE_AUTH_COPY =
  'Stripe may ask you to confirm your email or phone before identity or bank details. Complete that step, then continue here. Traverion never sees your Stripe password or identity documents.';
