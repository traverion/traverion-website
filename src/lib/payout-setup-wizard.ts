/**
 * P9.1 / P8.8 Unified payout setup wizard — 6-step model + draft resume.
 *
 * Custom (api_native): Traverion collects business, representative, identity/TOS, bank.
 * Express (legacy embedded): Traverion owns business/preferences; Stripe embeds for
 * representative / identity / bank (auth popup may appear — cannot be disabled).
 */

export type PayoutWizardStepId =
  | 'business'
  | 'representative'
  | 'identity'
  | 'bank'
  | 'preferences'
  | 'review';

export type PayoutWizardCollector = 'traverion' | 'stripe' | 'mixed';

export type PayoutWizardScreen = {
  id: PayoutWizardStepId;
  title: string;
  lede: string;
  /** Default collector hint; runtime may override for Express vs Custom. */
  collector: PayoutWizardCollector;
};

export const PAYOUT_WIZARD_SCREENS: PayoutWizardScreen[] = [
  {
    id: 'business',
    title: 'Business details',
    lede: 'Confirm company info used for payouts.',
    collector: 'traverion',
  },
  {
    id: 'representative',
    title: 'Representative',
    lede: 'Who is authorized to manage payouts.',
    collector: 'traverion',
  },
  {
    id: 'identity',
    title: 'Identity',
    lede: 'Confirm identity and accept the agreement.',
    collector: 'mixed',
  },
  {
    id: 'bank',
    title: 'Bank account',
    lede: 'Where payouts should be sent.',
    collector: 'traverion',
  },
  {
    id: 'preferences',
    title: 'Preferences',
    lede: 'Schedule and minimum payout amount.',
    collector: 'traverion',
  },
  {
    id: 'review',
    title: 'Review',
    lede: 'Confirm what’s done.',
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
  /** Custom-native representative fields (not used on Express embeds). */
  rep_first_name: string;
  rep_last_name: string;
  rep_email: string;
  rep_phone: string;
  rep_title: string;
  /** ISO date YYYY-MM-DD */
  rep_dob: string;
  rep_is_owner: boolean;
  rep_percent_ownership: string;
  tos_accepted: boolean;
  payment_cycle: '' | 'monthly' | 'biweekly';
  payout_threshold_min: string;
  /** Partner acknowledged the single Stripe auth notice for Express drafts. */
  stripeAuthAcknowledged: boolean;
  businessSavedAt: string | null;
  representativeSavedAt: string | null;
  identitySavedAt: string | null;
  bankSavedAt: string | null;
  preferencesSavedAt: string | null;
  updatedAt: string;
};

const DRAFT_PREFIX = 'tv-payout-wizard:v2:';

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
    rep_first_name: '',
    rep_last_name: '',
    rep_email: '',
    rep_phone: '',
    rep_title: '',
    rep_dob: '',
    // Never assume the representative owns shares — collect ownership explicitly.
    rep_is_owner: false,
    rep_percent_ownership: '',
    tos_accepted: false,
    payment_cycle: '',
    payout_threshold_min: '',
    stripeAuthAcknowledged: false,
    businessSavedAt: null,
    representativeSavedAt: null,
    identitySavedAt: null,
    bankSavedAt: null,
    preferencesSavedAt: null,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

function isWizardStep(value: unknown): value is PayoutWizardStepId {
  return PAYOUT_WIZARD_SCREENS.some((s) => s.id === value);
}

/** Map legacy 5-step draft steps onto the 6-step model. */
function migrateLegacyStep(step: unknown): PayoutWizardStepId {
  if (isWizardStep(step)) return step;
  return 'business';
}

export function loadPayoutWizardDraft(userId: string): PayoutWizardDraft | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw =
      sessionStorage.getItem(payoutWizardDraftKey(userId)) ??
      sessionStorage.getItem(`tv-payout-wizard:v1:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PayoutWizardDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    const step = migrateLegacyStep(parsed.step);
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
    sessionStorage.removeItem(`tv-payout-wizard:v1:${userId}`);
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

/** Who drives the step for this connected-account type. */
export function payoutWizardCollectorFor(
  step: PayoutWizardStepId,
  accountType: string | null | undefined
): PayoutWizardCollector {
  const isExpress = accountType === 'express';
  if (step === 'business' || step === 'preferences') return 'traverion';
  if (step === 'review') return 'mixed';
  if (isExpress) {
    if (step === 'representative' || step === 'identity' || step === 'bank') return 'stripe';
  }
  if (step === 'identity') return 'mixed';
  return 'traverion';
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

export function parsePayoutWizardDob(
  value: string
): { day: number; month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export type PayoutWizardFieldErrors = Partial<
  Record<
    | 'company_legal_name'
    | 'business_type'
    | 'address_street'
    | 'address_city'
    | 'address_postal_code'
    | 'address_country'
    | 'rep_first_name'
    | 'rep_last_name'
    | 'rep_dob'
    | 'rep_percent_ownership'
    | 'payment_cycle'
    | 'payout_threshold_min'
    | 'tos_accepted',
    string
  >
>;

/** Normalize ownership input: digits + optional single decimal separator. */
export function sanitizeOwnershipPercentInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(/,/g, '.');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned.slice(0, 6);
  const head = cleaned.slice(0, firstDot + 1);
  const tail = cleaned.slice(firstDot + 1).replace(/\./g, '');
  return `${head}${tail.slice(0, 2)}`.slice(0, 8);
}

/**
 * Parse ownership percent. Returns null when empty/invalid.
 * Accepts 0–100 inclusive with up to 2 decimal places.
 */
export function parseOwnershipPercent(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim().replace(/,/g, '.');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

export function validateOwnershipPercent(
  raw: string | null | undefined,
  opts?: { required?: boolean }
): string | null {
  const t = (raw ?? '').trim();
  if (!t) {
    return opts?.required ? 'Enter an ownership percentage from 0 to 100.' : null;
  }
  if (/[^\d.,]/.test(t)) {
    return 'Use numbers only (for example 25 or 25.5).';
  }
  const n = parseOwnershipPercent(t);
  if (n == null) {
    if (Number(t.replace(',', '.')) < 0) return 'Ownership cannot be negative.';
    if (Number(t.replace(',', '.')) > 100) return 'Ownership cannot be more than 100%.';
    return 'Enter a valid ownership percentage from 0 to 100.';
  }
  return null;
}

export function validatePayoutWizardRepresentative(draft: PayoutWizardDraft): string | null {
  if (!draft.rep_first_name.trim()) return 'Enter the representative’s first name.';
  if (!draft.rep_last_name.trim()) return 'Enter the representative’s last name.';
  if (!parsePayoutWizardDob(draft.rep_dob)) {
    return 'Enter a valid date of birth.';
  }
  if (draft.rep_is_owner) {
    const ownershipErr = validateOwnershipPercent(draft.rep_percent_ownership, { required: true });
    if (ownershipErr) return ownershipErr;
  }
  return null;
}

export function validatePayoutWizardRepresentativeFields(
  draft: PayoutWizardDraft
): PayoutWizardFieldErrors {
  const errors: PayoutWizardFieldErrors = {};
  if (!draft.rep_first_name.trim()) errors.rep_first_name = 'Enter the first name.';
  if (!draft.rep_last_name.trim()) errors.rep_last_name = 'Enter the last name.';
  if (!parsePayoutWizardDob(draft.rep_dob)) {
    errors.rep_dob = 'Enter a valid date of birth.';
  }
  if (draft.rep_is_owner) {
    const ownershipErr = validateOwnershipPercent(draft.rep_percent_ownership, { required: true });
    if (ownershipErr) errors.rep_percent_ownership = ownershipErr;
  }
  return errors;
}

/** True when edge/gate refused LIVE Custom account creation (expected while production gate is OFF). */
export function isLiveAccountCreationGateError(message: string | null | undefined): boolean {
  return /LIVE payout account creation is turned off|not approved for LIVE payout account creation/i.test(
    message ?? ''
  );
}

export const PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY =
  'Payout account connection is not available yet. Your details are saved here — Traverion will enable connection when your account is ready. This is not a verification failure.';

export function validatePayoutWizardIdentity(draft: PayoutWizardDraft): string | null {
  if (!draft.tos_accepted) {
    return 'Accept the Stripe Recipient Agreement to continue.';
  }
  return null;
}

/** Map a Stripe requirement key onto the six-step wizard so a supplier can resume the right screen. */
export function payoutWizardStepForRequirement(requirement: string): PayoutWizardStepId {
  const key = requirement.toLowerCase();
  if (/external_account|bank_account|iban|payout_method/.test(key)) return 'bank';
  if (/terms_of_service|tos_acceptance|agreement/.test(key)) return 'identity';
  if (/verification\.document|additional_document|documents|proof_of_liveness|liveness|ssn_last_4/.test(key)) {
    return 'identity';
  }
  if (/business_details|registered_name|business_url|fi_yt|id_numbers/.test(key)) return 'business';
  if (/persons_provided|owners|directors|executives|representative|individual\./.test(key)) {
    return 'representative';
  }
  if (/id_number/.test(key)) return 'identity';
  return 'business';
}

const WIZARD_STEP_ORDER: PayoutWizardStepId[] = [
  'business',
  'representative',
  'identity',
  'bank',
  'preferences',
  'review',
];

/** Earliest wizard step that can clear one of the outstanding requirement keys. */
export function firstOutstandingWizardStep(
  requirements: readonly string[] | null | undefined
): PayoutWizardStepId | null {
  if (!requirements?.length) return null;
  const needed = new Set(requirements.map((item) => payoutWizardStepForRequirement(item)));
  return WIZARD_STEP_ORDER.find((step) => needed.has(step)) ?? null;
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

/** Short partner-facing auth copy — Express embeds only. */
export const PAYOUT_WIZARD_STRIPE_AUTH_COPY =
  'For security, you may need to confirm your email or phone before identity or bank details. Complete that step, then continue here. Traverion never sees your password or identity documents.';

/** Partner-facing legal disclosure for the native identity step. */
export { STRIPE_RECIPIENT_DISCLOSURE as PAYOUT_WIZARD_TOS_COPY } from './stripe-recipient-agreement';
