/**
 * P9.1 / P8.8 Unified payout setup wizard — 6-step model + draft resume.
 *
 * Custom without Connect yet: Traverion draft forms for business / preferences.
 * Custom with Connect (Accounts v2 dashboard:none): Traverion forms submit through
 * Accounts v2 and the Persons API (P9.52). The full embedded questionnaire is not the supplier form.
 * Express: Traverion owns business/preferences; Stripe embeds for representative /
 * identity / bank (auth popup may appear — cannot be disabled).
 */

import { parseIsoDob, validateIsoDob } from './date-of-birth';
import { PARTNER_TERMS_VERSION } from './partnerPortalPaths';

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
    lede: 'Confirm the company used for payouts.',
    collector: 'traverion',
  },
  {
    id: 'representative',
    title: 'Identity',
    lede: 'Who is authorized to act for the business.',
    collector: 'traverion',
  },
  {
    id: 'identity',
    title: 'Identity',
    lede: 'Secure checks run inside Traverion when connection is open.',
    collector: 'mixed',
  },
  {
    id: 'bank',
    title: 'Bank account',
    lede: 'Where payouts should go.',
    collector: 'traverion',
  },
  {
    id: 'preferences',
    title: 'Preferences',
    lede: 'How often you prefer payouts.',
    collector: 'traverion',
  },
  {
    id: 'review',
    title: 'Review',
    lede: 'What is saved versus what still needs verification.',
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
  /** Company director flag. Collected explicitly; defaults on for companies until the supplier changes it. */
  rep_is_director: boolean;
  /** Supplier agreed Traverion may send the verified company record and this person’s identity. */
  verification_consent: boolean;
  /** Published Partner Terms of Service version the supplier accepted, or null. */
  supplier_terms_version: string | null;
  /** When the supplier accepted that version. */
  supplier_terms_accepted_at: string | null;
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

/** Unified onboarding status after Stripe return / wizard completion. */
export const PAYOUT_WIZARD_RETURN_HREF = '/partner/onboarding?phase=status';

/**
 * Soft-suggest representative name from a single known director.
 * Never invents DOB, ownership, email, or phone — Stripe still collects those.
 */
export function suggestRepresentativeNameFromDirectors(
  managingDirectors: string | null | undefined
): { first_name: string; last_name: string } | null {
  const lines = (managingDirectors ?? '')
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length !== 1) return null;
  const parts = lines[0]!.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    first_name: parts[0]!,
    last_name: parts.slice(1).join(' '),
  };
}

export type PayoutWizardLocalProgress = {
  hasSavedProgress: boolean;
  savedStepCount: number;
  wizardCompleted: boolean;
  representativeSaved: boolean;
  identitySaved: boolean;
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
      representativeSaved: false,
      identitySaved: false,
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
    representativeSaved: Boolean(draft.representativeSavedAt),
    identitySaved: Boolean(draft.identitySavedAt),
    bankSavedLocally: Boolean(draft.bankSavedAt),
    bankDeferred: Boolean(draft.bankDeferredAt) && !draft.bankSavedAt,
    bankLast4: draft.bankLast4?.trim() || null,
    preferencesSaved: Boolean(draft.preferencesSavedAt),
    lastStep: isWizardStep(draft.step) ? draft.step : 'business',
  };
}

/**
 * Supplier-facing Stripe verification chip when Connect is still not_started.
 * Never upgrades to Verified from draft markers alone.
 */
export function payoutVerificationPresentation(opts: {
  connectLabel: string;
  hasConnectedAccount: boolean;
  localProgress: PayoutWizardLocalProgress;
}): string {
  if (opts.connectLabel !== 'Not started') return opts.connectLabel;
  if (opts.hasConnectedAccount) return opts.connectLabel;
  if (opts.localProgress.wizardCompleted || opts.localProgress.hasSavedProgress) {
    return 'Details saved — verification not started';
  }
  return 'Not started';
}

/** Traverion business verification — independent from Stripe Connect. */
export function traverionBusinessVerificationLabel(
  verificationStatus: string | null | undefined
): string {
  switch ((verificationStatus ?? '').trim().toLowerCase()) {
    case 'verified':
      return 'Approved';
    case 'pending':
      return 'In review';
    case 'rejected':
      return 'Needs changes';
    default:
      return 'Not submitted';
  }
}

export type PayoutReadinessLane = {
  formProgress: string;
  businessVerification: string;
  stripeVerification: string;
  payoutReadiness: string;
  nextStep: string;
};

/**
 * Four honest lanes for review / completion / settings.
 * Never maps form completion → Stripe Verified or payouts enabled.
 */
export function buildPayoutReadinessLanes(opts: {
  localProgress: PayoutWizardLocalProgress;
  verificationStatus: string | null | undefined;
  connectLabel: string;
  hasConnectedAccount: boolean;
  canReceiveTransfers: boolean;
  connectLivemode: boolean | null | undefined;
  connectSetupUnavailable: boolean;
  liveCreateAllowed: boolean;
  platformEnvironment: 'test' | 'live' | null;
}): PayoutReadinessLane {
  const formProgress = opts.localProgress.wizardCompleted
    ? 'Setup finished'
    : opts.localProgress.hasSavedProgress
      ? 'In progress'
      : 'Not started';

  const businessVerification = traverionBusinessVerificationLabel(opts.verificationStatus);

  let stripeVerification = opts.connectLabel;
  if (opts.connectLabel === 'Not started') {
    stripeVerification = payoutVerificationPresentation({
      connectLabel: opts.connectLabel,
      hasConnectedAccount: opts.hasConnectedAccount,
      localProgress: opts.localProgress,
    });
  }

  let payoutReadiness: string;
  if (opts.canReceiveTransfers && opts.connectLivemode === true) {
    payoutReadiness = 'Ready when payouts are enabled';
  } else if (opts.platformEnvironment === 'test' && opts.canReceiveTransfers) {
    payoutReadiness = 'TEST only — not LIVE payouts';
  } else if (!opts.hasConnectedAccount) {
    if (opts.liveCreateAllowed || opts.platformEnvironment === 'test') {
      payoutReadiness = 'Ready to connect payouts';
    } else if (opts.connectSetupUnavailable) {
      payoutReadiness = 'Waiting to connect';
    } else {
      payoutReadiness = 'Not connected';
    }
  } else if (
    opts.connectLabel === 'Action required' ||
    opts.connectLabel === 'Restricted' ||
    opts.connectLabel === 'LIVE onboarding required'
  ) {
    payoutReadiness = 'Needs attention';
  } else {
    payoutReadiness = 'Waiting for confirmation';
  }

  let nextStep: string;
  if (businessVerification !== 'Approved') {
    nextStep = 'Finish Traverion business verification first.';
  } else if (!opts.hasConnectedAccount) {
    if (opts.liveCreateAllowed || opts.platformEnvironment === 'test') {
      nextStep = 'Continue secure verification for identity and bank details.';
    } else {
      nextStep = 'Your details stay saved. Continue when payout connection opens for you.';
    }
  } else if (
    opts.connectLabel === 'Action required' ||
    opts.connectLabel === 'Restricted' ||
    opts.connectLabel === 'LIVE onboarding required'
  ) {
    nextStep = 'Continue verification to finish the items still needed.';
  } else if (opts.canReceiveTransfers && opts.connectLivemode === true) {
    nextStep = 'Payout verification is complete. Payouts start only after Traverion enables them.';
  } else {
    nextStep = 'Wait for verification to confirm your details, or refresh status.';
  }

  return {
    formProgress,
    businessVerification,
    stripeVerification,
    payoutReadiness,
    nextStep,
  };
}

/** Bank status for Settings / completion — honest about deferred vs attached. */
export function payoutBankPresentation(opts: {
  bankManaged: boolean;
  bankMasked?: string | null;
  localProgress: PayoutWizardLocalProgress;
  /** When LIVE create is blocked and no Connect account exists, never imply Stripe has the bank. */
  connectSetupUnavailable?: boolean;
  hasConnectedAccount?: boolean;
}): string {
  if (opts.bankManaged || opts.bankMasked) {
    return opts.bankMasked?.trim() || 'On file';
  }
  if (opts.connectSetupUnavailable && !opts.hasConnectedAccount) {
    if (opts.localProgress.bankDeferred || opts.localProgress.bankSavedLocally) {
      return 'Saved for later — not submitted yet';
    }
    return 'Not added';
  }
  if (opts.localProgress.bankSavedLocally) {
    return opts.localProgress.bankLast4
      ? `•••• ${opts.localProgress.bankLast4} — awaiting confirmation`
      : 'Submitted — awaiting confirmation';
  }
  if (opts.localProgress.bankDeferred) return 'Not submitted yet';
  return 'Not added';
}

const DRAFT_PREFIX = 'tv-payout-wizard:v5:';
const LEGACY_DRAFT_PREFIXES = [
  'tv-payout-wizard:v4:',
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
    rep_is_director: true,
    verification_consent: false,
    supplier_terms_version: null,
    supplier_terms_accepted_at: null,
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

/** Timestamp already on disk. Does not rewrite the browser draft. */
export function readStoredDraftUpdatedAt(userId: string): string | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage?.getItem(payoutWizardDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    return typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
  } catch {
    return null;
  }
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
  const safe = sanitizeDevicePayoutWizardDraft({
    ...draft,
    updatedAt: new Date().toISOString(),
  });
  const payload = JSON.stringify(safe);
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

/**
 * Stripe TEST may create accounts.
 * LIVE creates only when the edge reports live_create_allowed (gate + allowlist),
 * or when a connected account already exists.
 */
export function canProvisionConnectAccount(opts: {
  hasConnectedAccount: boolean;
  platformEnvironment: 'test' | 'live' | null;
  liveCreateAllowed?: boolean | null;
}): boolean {
  if (opts.hasConnectedAccount) return true;
  if (opts.platformEnvironment === 'test') return true;
  if (opts.platformEnvironment === 'live' && opts.liveCreateAllowed === true) return true;
  return false;
}

/** Build a server-safe draft payload (no IBAN, no full DOB). */
export function toServerPayoutWizardDraft(draft: PayoutWizardDraft): Record<string, unknown> {
  const dobYear = (iso: string): number | null => {
    const m = /^(\d{4})/.exec(iso.trim());
    if (!m) return null;
    const y = Number(m[1]);
    return y >= 1900 && y <= 2100 ? y : null;
  };
  return {
    version: 1,
    step: draft.step,
    rep: {
      first_name: draft.rep_first_name,
      last_name: draft.rep_last_name,
      email: draft.rep_email,
      phone: draft.rep_phone,
      title: draft.rep_title,
      is_owner: draft.rep_is_owner,
      is_director: draft.rep_is_director,
      verification_consent: draft.verification_consent,
      percent_ownership: draft.rep_percent_ownership,
      dob_year: dobYear(draft.rep_dob),
    },
    owners: draft.beneficial_owners.map((o) => ({
      id: o.id,
      first_name: o.first_name,
      last_name: o.last_name,
      email: o.email,
      percent_ownership: o.percent_ownership,
      dob_year: dobYear(o.dob),
    })),
    tos_accepted_intent: draft.tos_accepted,
    stripe_auth_acknowledged: draft.stripeAuthAcknowledged,
    payment_cycle: draft.payment_cycle,
    payout_threshold_min: draft.payout_threshold_min,
    markers: {
      businessSavedAt: draft.businessSavedAt,
      representativeSavedAt: draft.representativeSavedAt,
      identitySavedAt: draft.identitySavedAt,
      bankDeferredAt: draft.bankDeferredAt,
      bankSavedAt: draft.bankSavedAt,
      bankLast4: draft.bankLast4,
      supplierTermsVersion: draft.supplier_terms_version,
      supplierTermsAcceptedAt: draft.supplier_terms_accepted_at,
      preferencesSavedAt: draft.preferencesSavedAt,
      wizardCompletedAt: draft.wizardCompletedAt,
    },
  };
}

function countDraftMarkers(draft: Pick<
  PayoutWizardDraft,
  | 'businessSavedAt'
  | 'representativeSavedAt'
  | 'identitySavedAt'
  | 'bankSavedAt'
  | 'bankDeferredAt'
  | 'preferencesSavedAt'
  | 'wizardCompletedAt'
>): number {
  return [
    draft.businessSavedAt,
    draft.representativeSavedAt,
    draft.identitySavedAt,
    draft.bankSavedAt,
    draft.bankDeferredAt,
    draft.preferencesSavedAt,
    draft.wizardCompletedAt,
  ].filter(Boolean).length;
}

/**
 * Merge a sanitized server draft into a local draft without inventing full DOB/IBAN.
 * Server is preferred when it carries equal or richer progress (cross-device SoT).
 */
/** True when the server copy was written after this browser's draft. */
export function serverDraftSupersedesLocal(
  localUpdatedAt: string | null | undefined,
  serverUpdatedAt: string | null | undefined
): boolean {
  const serverMs = serverUpdatedAt ? Date.parse(serverUpdatedAt) : NaN;
  if (!Number.isFinite(serverMs)) return false;
  const localMs = localUpdatedAt ? Date.parse(localUpdatedAt) : NaN;
  return !Number.isFinite(localMs) || serverMs > localMs;
}

/** A reset draft has no saved-step markers and still sits on the first step. */
export function isOnboardingResetDraft(server: Record<string, unknown> | null | undefined): boolean {
  if (!server || typeof server !== 'object' || Array.isArray(server)) return false;
  const step = typeof server.step === 'string' && server.step ? server.step : 'business';
  if (step !== 'business') return false;
  const markers =
    server.markers && typeof server.markers === 'object' && !Array.isArray(server.markers)
      ? (server.markers as Record<string, unknown>)
      : {};
  const stamped = [
    markers.businessSavedAt,
    markers.representativeSavedAt,
    markers.identitySavedAt,
    markers.bankSavedAt,
    markers.bankDeferredAt,
    markers.preferencesSavedAt,
    markers.wizardCompletedAt,
  ].some((value) => typeof value === 'string' && value);
  return !stamped;
}

export function mergeServerPayoutWizardDraft(
  local: PayoutWizardDraft,
  server: Record<string, unknown> | null | undefined,
  opts?: { serverUpdatedAt?: string | null; localUpdatedAt?: string | null }
): PayoutWizardDraft {
  if (!server || typeof server !== 'object') return local;
  const markers =
    server.markers && typeof server.markers === 'object' && !Array.isArray(server.markers)
      ? (server.markers as Record<string, unknown>)
      : {};
  const rep =
    server.rep && typeof server.rep === 'object' && !Array.isArray(server.rep)
      ? (server.rep as Record<string, unknown>)
      : {};
  const ownersRaw = Array.isArray(server.owners) ? server.owners : [];
  const serverMarkerCount = [
    markers.businessSavedAt,
    markers.representativeSavedAt,
    markers.identitySavedAt,
    markers.bankSavedAt,
    markers.bankDeferredAt,
    markers.preferencesSavedAt,
    markers.wizardCompletedAt,
  ].filter((v) => typeof v === 'string' && v).length;
  const localMarkerCount = countDraftMarkers(local);
  const serverUpdatedMs = opts?.serverUpdatedAt ? Date.parse(opts.serverUpdatedAt) : NaN;
  const localUpdatedMs = opts?.localUpdatedAt
    ? Date.parse(opts.localUpdatedAt)
    : Date.parse(local.updatedAt);
  const serverSupersedes = serverDraftSupersedesLocal(
    Number.isFinite(localUpdatedMs) ? new Date(localUpdatedMs).toISOString() : null,
    Number.isFinite(serverUpdatedMs) ? new Date(serverUpdatedMs).toISOString() : null
  );
  const text = (value: unknown, fallback: string) => {
    if (serverSupersedes) return typeof value === 'string' ? value : '';
    return typeof value === 'string' && value ? value : fallback;
  };
  const flag = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : serverSupersedes ? fallback : fallback;
  const marker = (value: unknown, fallback: string | null) => {
    if (serverSupersedes) return typeof value === 'string' && value ? value : null;
    return typeof value === 'string' ? value : fallback;
  };
  const preferServerStep =
    serverSupersedes ||
    serverMarkerCount > localMarkerCount ||
    (serverMarkerCount === localMarkerCount &&
      Number.isFinite(serverUpdatedMs) &&
      (!Number.isFinite(localUpdatedMs) || serverUpdatedMs >= localUpdatedMs));

  return emptyPayoutWizardDraft({
    ...(serverSupersedes ? {} : local),
    step:
      (preferServerStep || serverSupersedes) && isWizardStep(server.step)
        ? server.step
        : isWizardStep(server.step) && localMarkerCount === 0
          ? server.step
          : serverSupersedes
            ? 'business'
            : local.step,
    rep_first_name: text(rep.first_name, local.rep_first_name),
    rep_last_name: text(rep.last_name, local.rep_last_name),
    rep_email: text(rep.email, local.rep_email),
    rep_phone: text(rep.phone, local.rep_phone),
    rep_title: text(rep.title, local.rep_title),
    rep_is_owner: flag(rep.is_owner, serverSupersedes ? false : local.rep_is_owner),
    rep_is_director: flag(rep.is_director, serverSupersedes ? true : local.rep_is_director),
    verification_consent: flag(
      rep.verification_consent,
      serverSupersedes ? false : local.verification_consent
    ),
    supplier_terms_version:
      markers.supplierTermsVersion === PARTNER_TERMS_VERSION
        ? PARTNER_TERMS_VERSION
        : serverSupersedes
          ? null
          : local.supplier_terms_version,
    supplier_terms_accepted_at:
      markers.supplierTermsVersion === PARTNER_TERMS_VERSION
        ? marker(markers.supplierTermsAcceptedAt, local.supplier_terms_accepted_at)
        : serverSupersedes
          ? null
          : local.supplier_terms_accepted_at,
    rep_percent_ownership: text(rep.percent_ownership, local.rep_percent_ownership),
    // Full DOB is never restored from server — partner re-enters before Stripe submit.
    rep_dob: serverSupersedes ? '' : local.rep_dob,
    beneficial_owners:
      serverSupersedes || ownersRaw.length > 0
        ? ownersRaw.map((owner, index) => {
            const o =
              owner && typeof owner === 'object' && !Array.isArray(owner)
                ? (owner as Record<string, unknown>)
                : {};
            const existing = serverSupersedes ? undefined : local.beneficial_owners[index];
            return emptyBeneficialOwner({
              id: typeof o.id === 'string' ? o.id : existing?.id,
              first_name: typeof o.first_name === 'string' ? o.first_name : '',
              last_name: typeof o.last_name === 'string' ? o.last_name : '',
              email: typeof o.email === 'string' ? o.email : '',
              percent_ownership: typeof o.percent_ownership === 'string' ? o.percent_ownership : '',
              dob: serverSupersedes ? '' : (existing?.dob ?? ''),
            });
          })
        : local.beneficial_owners,
    tos_accepted: flag(server.tos_accepted_intent, serverSupersedes ? false : local.tos_accepted),
    stripeAuthAcknowledged: flag(
      server.stripe_auth_acknowledged,
      serverSupersedes ? false : local.stripeAuthAcknowledged
    ),
    payment_cycle:
      server.payment_cycle === 'monthly' || server.payment_cycle === 'biweekly'
        ? server.payment_cycle
        : serverSupersedes
          ? ''
          : local.payment_cycle,
    payout_threshold_min: text(server.payout_threshold_min, local.payout_threshold_min),
    businessSavedAt: marker(markers.businessSavedAt, local.businessSavedAt),
    representativeSavedAt: marker(markers.representativeSavedAt, local.representativeSavedAt),
    identitySavedAt: marker(markers.identitySavedAt, local.identitySavedAt),
    bankDeferredAt: marker(markers.bankDeferredAt, local.bankDeferredAt),
    bankSavedAt: marker(markers.bankSavedAt, local.bankSavedAt),
    bankLast4: marker(markers.bankLast4, local.bankLast4),
    preferencesSavedAt: marker(markers.preferencesSavedAt, local.preferencesSavedAt),
    wizardCompletedAt: marker(markers.wizardCompletedAt, local.wizardCompletedAt),
  });
}

/** Device cache must never hold IBAN or full DOB (re-enter before Stripe submit). */
export function sanitizeDevicePayoutWizardDraft(draft: PayoutWizardDraft): PayoutWizardDraft {
  return {
    ...draft,
    rep_dob: '',
    beneficial_owners: draft.beneficial_owners.map((o) => ({
      ...o,
      dob: '',
    })),
  };
}

export function parsePayoutWizardDob(
  value: string
): { day: number; month: number; year: number } | null {
  if (validateIsoDob(value, { required: true })) return null;
  return parseIsoDob(value);
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
    const ownerDobErr = validateIsoDob(owner.dob, { required: true });
    if (ownerDobErr) return `${label}: ${ownerDobErr.charAt(0).toLowerCase()}${ownerDobErr.slice(1)}`;
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
  const dobErr = validateIsoDob(draft.rep_dob, { required: true });
  if (dobErr) return dobErr;
  if (draft.rep_is_owner) {
    const ownershipErr = validateOwnershipPercent(draft.rep_percent_ownership, { required: true });
    if (ownershipErr) return ownershipErr;
  }
  const ownersErr = validateBeneficialOwners(draft);
  if (ownersErr) return ownersErr;
  return null;
}

/** IBAN checksum. Finnish accounts are FI plus 16 digits. The number is not stored. */
export function validateIban(raw: string | null | undefined, country?: string | null): string | null {
  const compact = (raw ?? '').replace(/\s+/g, '').toUpperCase();
  if (!compact) return 'Enter the IBAN.';
  const cc = (country ?? 'FI').trim().toUpperCase();
  if (cc === 'FI' && !/^FI\d{16}$/.test(compact)) {
    return 'Enter a Finnish IBAN. It starts with FI and has 18 characters.';
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) {
    return 'Enter a valid IBAN.';
  }
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const chunk = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of chunk) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  if (remainder !== 1) return 'That IBAN doesn’t look right. Check it and try again.';
  return null;
}

export function validatePayoutWizardRepresentativeFields(
  draft: PayoutWizardDraft
): PayoutWizardFieldErrors {
  const errors: PayoutWizardFieldErrors = {};
  if (!draft.rep_first_name.trim()) errors.rep_first_name = 'Enter the first name.';
  if (!draft.rep_last_name.trim()) errors.rep_last_name = 'Enter the last name.';
  const dobErr = validateIsoDob(draft.rep_dob, { required: true });
  if (dobErr) errors.rep_dob = dobErr;
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
  return /LIVE payout account creation is turned off|not approved for LIVE payout account creation|Payout connection is not open|Payout connection is being prepared|Finish Traverion business verification|pilot approval/i.test(
    message ?? ''
  );
}

export const PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY =
  'Payout connection is not open yet. Your details stay saved here — bank numbers are not submitted until you continue.';

/** Shorter in-flow notice — full copy stays in help / status. */
export const PAYOUT_LIVE_SETUP_UNAVAILABLE_SHORT =
  'Payout connection opens next. You can save these details now.';

/** Map edge / gate errors to short supplier instructions. */
export function supplierFacingLiveCreateBlockReason(
  raw: string | null | undefined
): string {
  const msg = (raw ?? '').trim();
  if (!msg) return PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY;
  if (/turned off|not open|not available|not enabled/i.test(msg)) {
    return PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY;
  }
  if (/not approved|pilot|being prepared/i.test(msg)) {
    return 'Payout connection is being prepared for your account. Your details stay saved.';
  }
  if (/business verification/i.test(msg)) {
    return 'Finish business verification first. You can keep saving payout details meanwhile.';
  }
  if (/already in progress/i.test(msg)) {
    return 'Payout account setup is already in progress. Wait a moment, then continue.';
  }
  return msg;
}

export type OnboardingCompletionState =
  | 'setup_submitted'
  | 'verification_pending'
  | 'ready_to_receive';

/** Honest completion headline for Status / finish screens. */
export function resolveOnboardingCompletionState(opts: {
  hasConnectedAccount: boolean;
  canReceiveTransfers: boolean;
  connectLivemode?: boolean | null;
  wizardCompleted?: boolean;
  payoutConfigured?: boolean;
  /** Both Traverion payout gates. Closed gates must not say payouts are ready. */
  payoutGatesOpen?: boolean;
}): OnboardingCompletionState {
  if (opts.canReceiveTransfers && opts.connectLivemode === true && opts.payoutGatesOpen === true) {
    return 'ready_to_receive';
  }
  if (opts.hasConnectedAccount) {
    return 'verification_pending';
  }
  if (opts.wizardCompleted || opts.payoutConfigured) {
    return 'setup_submitted';
  }
  return 'setup_submitted';
}

export function onboardingCompletionCopy(state: OnboardingCompletionState): {
  kicker: string;
  title: string;
  lede: string;
} {
  if (state === 'ready_to_receive') {
    return {
      kicker: 'Verified',
      title: 'Ready to receive payouts',
      lede: 'Stripe confirmed this account and Traverion payouts are open.',
    };
  }
  if (state === 'verification_pending') {
    return {
      kicker: 'Verification',
      title: 'Verification pending',
      lede: 'Finish any remaining secure checks. You will return here automatically.',
    };
  }
  return {
    kicker: 'Saved',
    title: 'Setup submitted',
    lede: 'Your details are on file. Continue when payout connection is available, or create a listing meanwhile.',
  };
}

/** Empty server draft payload used when clearing progress across devices. */
export function emptyServerPayoutWizardDraft(): Record<string, unknown> {
  return toServerPayoutWizardDraft(emptyPayoutWizardDraft({ step: 'business' }));
}

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
