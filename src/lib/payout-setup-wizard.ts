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
    lede: 'Confirm the registered company used for payouts. Changes to approved identity go through business setup.',
    collector: 'traverion',
  },
  {
    id: 'representative',
    title: 'Representative',
    lede: 'Add the authorized representative and any beneficial owners. Ownership must total at most 100%.',
    collector: 'traverion',
  },
  {
    id: 'identity',
    title: 'Identity',
    lede: 'Accept the recipient agreement and provide identity details when requested. Verification stays with the provider.',
    collector: 'mixed',
  },
  {
    id: 'bank',
    title: 'Bank account',
    lede: 'Enter where payouts should be sent. Traverion never stores the full account number.',
    collector: 'traverion',
  },
  {
    id: 'preferences',
    title: 'Preferences',
    lede: 'Choose payout frequency and a minimum threshold. Preferences do not move money by themselves.',
    collector: 'traverion',
  },
  {
    id: 'review',
    title: 'Review',
    lede: 'Check what is saved locally versus what the provider has verified. Finish when you are ready.',
    collector: 'mixed',
  },
];

/** Additional beneficial owner (never auto-created from directors). */
export type PayoutBeneficialOwnerDraft = {
  id: string;
  first_name: string;
  last_name: string;
  /** ISO date YYYY-MM-DD when required */
  dob: string;
  email: string;
  percent_ownership: string;
};

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
  /** Stripe Person id after native submit (session only). */
  rep_person_id: string;
  /** Extra beneficial owners — separate from company directors and from the representative. */
  beneficial_owners: PayoutBeneficialOwnerDraft[];
  tos_accepted: boolean;
  payment_cycle: '' | 'monthly' | 'biweekly';
  payout_threshold_min: string;
  /** Partner acknowledged the single Stripe auth notice for Express drafts. */
  stripeAuthAcknowledged: boolean;
  businessSavedAt: string | null;
  representativeSavedAt: string | null;
  identitySavedAt: string | null;
  /**
   * Set only after a bank token was attached to Stripe, or bank is already managed on the
   * connected account. Never set for draft-first LIVE continue-without-IBAN.
   */
  bankSavedAt: string | null;
  /**
   * Partner continued past bank while Connect create is unavailable — no IBAN was stored or sent.
   */
  bankDeferredAt: string | null;
  /** Last 4 of IBAN after successful tokenize/attach only — never the full account number. */
  bankLast4: string | null;
  preferencesSavedAt: string | null;
  /** Set when the supplier finishes the Review step (local completion, not provider verification). */
  wizardCompletedAt: string | null;
  updatedAt: string;
};

/** Partner Income settings deep-link after wizard completion. */
export const PAYOUT_WIZARD_RETURN_HREF = '/partner/money?tab=settings#income-payout-settings';

export type PayoutWizardLocalProgress = {
  hasSavedProgress: boolean;
  savedStepCount: number;
  wizardCompleted: boolean;
  /** True only when a bank was actually attached / managed — not deferred draft continue. */
  bankSavedLocally: boolean;
  /** True when bank step was deferred because Connect create is unavailable. */
  bankDeferred: boolean;
  bankLast4: string | null;
  preferencesSaved: boolean;
  lastStep: PayoutWizardStepId;
};

/** Summarize durable device draft for Settings sync — never implies provider Verified. */
export function summarizePayoutWizardLocalProgress(
  draft: PayoutWizardDraft | null | undefined
): PayoutWizardLocalProgress {
  if (!draft) {
    return {
      hasSavedProgress: false,
      savedStepCount: 0,
      wizardCompleted: false,
      bankSavedLocally: false,
      bankDeferred: false,
      bankLast4: null,
      preferencesSaved: false,
      lastStep: 'business',
    };
  }
  const markers = [
    draft.businessSavedAt,
    draft.representativeSavedAt,
    draft.identitySavedAt,
    draft.bankSavedAt,
    draft.bankDeferredAt,
    draft.preferencesSavedAt,
  ];
  const savedStepCount = markers.filter(Boolean).length;
  return {
    hasSavedProgress: savedStepCount > 0 || Boolean(draft.wizardCompletedAt),
    savedStepCount,
    wizardCompleted: Boolean(draft.wizardCompletedAt),
    bankSavedLocally: Boolean(draft.bankSavedAt),
    bankDeferred: Boolean(draft.bankDeferredAt) && !draft.bankSavedAt,
    bankLast4: draft.bankLast4?.trim() || null,
    preferencesSaved: Boolean(draft.preferencesSavedAt),
    lastStep: isWizardStep(draft.step) ? draft.step : 'business',
  };
}

/**
 * Supplier-facing verification chip when Connect is still not_started.
 * Never upgrades to Verified from local draft markers alone.
 */
export function payoutVerificationPresentation(opts: {
  connectLabel: string;
  hasConnectedAccount: boolean;
  localProgress: PayoutWizardLocalProgress;
}): string {
  if (opts.connectLabel !== 'Not started') return opts.connectLabel;
  if (opts.hasConnectedAccount) return opts.connectLabel;
  if (opts.localProgress.wizardCompleted || opts.localProgress.hasSavedProgress) {
    return 'Details saved — connection not enabled';
  }
  return 'Not started';
}

/** Bank status for Settings / completion — honest about deferred vs attached. */
export function payoutBankPresentation(opts: {
  bankManaged: boolean;
  bankMasked?: string | null;
  localProgress: PayoutWizardLocalProgress;
}): string {
  if (opts.bankManaged || opts.bankMasked) {
    return opts.bankMasked?.trim() || 'On file';
  }
  if (opts.localProgress.bankSavedLocally) {
    return opts.localProgress.bankLast4
      ? `•••• ${opts.localProgress.bankLast4} — awaiting connection`
      : 'Sent to provider — awaiting connection';
  }
  if (opts.localProgress.bankDeferred) return 'Not sent to provider';
  return 'Not added';
}

const DRAFT_PREFIX = 'tv-payout-wizard:v4:';
const LEGACY_DRAFT_PREFIXES = [
  'tv-payout-wizard:v3:',
  'tv-payout-wizard:v2:',
  'tv-payout-wizard:v1:',
] as const;

export function payoutWizardDraftKey(userId: string): string {
  return `${DRAFT_PREFIX}${userId}`;
}

function readDraftRaw(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  const key = payoutWizardDraftKey(userId);
  try {
    const fromLocal = window.localStorage?.getItem(key);
    if (fromLocal) return fromLocal;
  } catch {
    // ignore
  }
  try {
    const fromSession = window.sessionStorage?.getItem(key);
    if (fromSession) return fromSession;
  } catch {
    // ignore
  }
  for (const prefix of LEGACY_DRAFT_PREFIXES) {
    const legacyKey = `${prefix}${userId}`;
    try {
      const fromLocal = window.localStorage?.getItem(legacyKey);
      if (fromLocal) return fromLocal;
    } catch {
      // ignore
    }
    try {
      const fromSession = window.sessionStorage?.getItem(legacyKey);
      if (fromSession) return fromSession;
    } catch {
      // ignore
    }
  }
  return null;
}

export function emptyBeneficialOwner(
  partial?: Partial<PayoutBeneficialOwnerDraft>
): PayoutBeneficialOwnerDraft {
  return {
    id:
      partial?.id ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    first_name: '',
    last_name: '',
    dob: '',
    email: '',
    percent_ownership: '',
    ...partial,
  };
}

export function emptyPayoutWizardDraft(
  partial?: Partial<PayoutWizardDraft>
): PayoutWizardDraft {
  const { beneficial_owners: rawOwners, ...rest } = partial ?? {};
  const owners = Array.isArray(rawOwners)
    ? rawOwners.map((o) => emptyBeneficialOwner(o))
    : [];
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
    rep_person_id: '',
    tos_accepted: false,
    payment_cycle: '',
    payout_threshold_min: '',
    stripeAuthAcknowledged: false,
    businessSavedAt: null,
    representativeSavedAt: null,
    identitySavedAt: null,
    bankSavedAt: null,
    bankDeferredAt: null,
    bankLast4: null,
    preferencesSavedAt: null,
    wizardCompletedAt: null,
    updatedAt: new Date().toISOString(),
    ...rest,
    beneficial_owners: owners,
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
  try {
    const raw = readDraftRaw(userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PayoutWizardDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    const step = migrateLegacyStep(parsed.step);
    const draft = emptyPayoutWizardDraft({ ...parsed, step });
    // Migrate legacy session drafts onto durable localStorage once.
    savePayoutWizardDraft(userId, draft);
    return draft;
  } catch {
    return null;
  }
}

export function savePayoutWizardDraft(userId: string, draft: PayoutWizardDraft): void {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify({ ...draft, updatedAt: new Date().toISOString() });
  const key = payoutWizardDraftKey(userId);
  try {
    window.localStorage?.setItem(key, payload);
  } catch {
    // Fall back to session when localStorage is blocked.
    try {
      window.sessionStorage?.setItem(key, payload);
    } catch {
      // Ignore quota / private mode.
    }
  }
}

export function clearPayoutWizardDraft(userId: string): void {
  if (typeof window === 'undefined') return;
  const keys = [payoutWizardDraftKey(userId), ...LEGACY_DRAFT_PREFIXES.map((p) => `${p}${userId}`)];
  for (const key of keys) {
    try {
      window.localStorage?.removeItem(key);
    } catch {
      // ignore
    }
    try {
      window.sessionStorage?.removeItem(key);
    } catch {
      // ignore
    }
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

/** Business step uses supplier_profiles as SoT — never invent company fields here. */
export type PayoutBusinessProfileSnapshot = {
  company_legal_name?: string | null;
  business_type?: string | null;
  company_registration_number?: string | null;
  vat_id?: string | null;
  tax_id?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
};

export function formatPayoutBusinessAddress(
  profile: PayoutBusinessProfileSnapshot | null | undefined
): string {
  if (!profile) return '';
  const line = [
    profile.address_street?.trim(),
    [profile.address_postal_code?.trim(), profile.address_city?.trim()].filter(Boolean).join(' '),
    profile.address_country?.trim()?.toUpperCase(),
  ]
    .filter(Boolean)
    .join(', ');
  return line;
}

export function validatePayoutBusinessFromProfile(
  profile: PayoutBusinessProfileSnapshot | null | undefined
): string | null {
  if (!profile?.company_legal_name?.trim()) {
    return 'Add your legal company name in business details before continuing.';
  }
  if (profile.business_type !== 'company' && profile.business_type !== 'individual') {
    return 'Set your business type in business details before continuing.';
  }
  if (!profile.address_street?.trim()) {
    return 'Add your registered street address in business details before continuing.';
  }
  if (!profile.address_city?.trim()) {
    return 'Add your city in business details before continuing.';
  }
  if (!profile.address_postal_code?.trim()) {
    return 'Add your postal code in business details before continuing.';
  }
  if (!profile.address_country?.trim()) {
    return 'Add your country in business details before continuing.';
  }
  return null;
}

/** Stripe TEST may create accounts; LIVE stays draft-first until an account already exists. */
export function canProvisionConnectAccount(opts: {
  hasConnectedAccount: boolean;
  platformEnvironment: 'test' | 'live' | null;
}): boolean {
  if (opts.hasConnectedAccount) return true;
  return opts.platformEnvironment === 'test';
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
    | 'beneficial_owners'
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

/** Sum declared ownership (rep + beneficial owners). Returns null if any declared % is invalid. */
export function sumDeclaredOwnershipPercent(draft: PayoutWizardDraft): number | null {
  let total = 0;
  if (draft.rep_is_owner) {
    const n = parseOwnershipPercent(draft.rep_percent_ownership);
    if (n == null) return null;
    total += n;
  }
  for (const owner of draft.beneficial_owners) {
    const n = parseOwnershipPercent(owner.percent_ownership);
    if (n == null) return null;
    total += n;
  }
  return Math.round(total * 100) / 100;
}

export function validateBeneficialOwners(draft: PayoutWizardDraft): string | null {
  for (let i = 0; i < draft.beneficial_owners.length; i++) {
    const owner = draft.beneficial_owners[i]!;
    const label = `Owner ${i + 1}`;
    if (!owner.first_name.trim()) return `${label}: enter a first name.`;
    if (!owner.last_name.trim()) return `${label}: enter a last name.`;
    if (!parsePayoutWizardDob(owner.dob)) return `${label}: enter a valid date of birth.`;
    const ownershipErr = validateOwnershipPercent(owner.percent_ownership, { required: true });
    if (ownershipErr) return `${label}: ${ownershipErr}`;
  }
  if (draft.beneficial_owners.length === 0 && !draft.rep_is_owner) {
    return null;
  }
  const total = sumDeclaredOwnershipPercent(draft);
  if (total == null) return 'Check ownership percentages (0–100 each).';
  if (total > 100) {
    return `Ownership adds up to ${total}%. Total declared ownership cannot exceed 100%.`;
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
  const ownersErr = validateBeneficialOwners(draft);
  if (ownersErr) return ownersErr;
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
  const ownersErr = validateBeneficialOwners(draft);
  if (ownersErr) errors.beneficial_owners = ownersErr;
  return errors;
}

/** True when edge/gate refused LIVE Custom account creation (expected while production gate is OFF). */
export function isLiveAccountCreationGateError(message: string | null | undefined): boolean {
  return /LIVE payout account creation is turned off|not approved for LIVE payout account creation/i.test(
    message ?? ''
  );
}

export const PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY =
  'Payout account connection is not available yet. Details stay on this device until Traverion enables connection. This is not a verification failure, and your bank account has not been sent to the payment provider.';

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
  if (/business_details|registered_name|business_url|fi_yt|id_numbers|directors_provided|directors\./.test(key)) {
    return 'business';
  }
  if (/persons_provided|owners|executives|representative|individual\./.test(key)) {
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
