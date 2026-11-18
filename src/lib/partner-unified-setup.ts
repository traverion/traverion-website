/**
 * P9.40 — Unified supplier onboarding: one progress model across Finish setup,
 * business verification, and payout / Connect.
 *
 * Does not invent Verified / payout-ready from local drafts alone.
 */

import type { SupplierProfileRow } from '../data/supabase-supplier-profile';
import {
  isSupplierBankingReadyForPublish,
  isSupplierBusinessProfileComplete,
  isSupplierPayoutConfigured,
} from './supplierOnboarding';
import {
  buildPayoutReadinessLanes,
  loadPayoutWizardDraft,
  summarizePayoutWizardLocalProgress,
  type PayoutWizardStepId,
} from './payout-setup-wizard';
import {
  emptyBusinessOnboardingDraft,
  loadBusinessOnboardingDraft,
  type BusinessOnboardingStepId,
} from './business-onboarding-wizard';
import { partnerBusinessReviewState, partnerPayoutReviewState } from './partnerVerificationStatus';
import { connectOnboardingLabel } from './connect-payout-status';

export type UnifiedSetupPhaseId =
  | 'business'
  | 'documents'
  | 'representative'
  | 'payout'
  | 'status';

export type UnifiedSetupScreen = {
  id: UnifiedSetupPhaseId;
  title: string;
  lede: string;
};

export const UNIFIED_SETUP_SCREENS: UnifiedSetupScreen[] = [
  {
    id: 'business',
    title: 'Company',
    lede: 'Your registered business and how travelers see your brand.',
  },
  {
    id: 'documents',
    title: 'Documents',
    lede: 'Upload registration proof so Traverion can review your business.',
  },
  {
    id: 'representative',
    title: 'Representative',
    lede: 'Who is authorized to act for the business for payouts.',
  },
  {
    id: 'payout',
    title: 'Payouts',
    lede: 'Where payouts should go, and how often you prefer them.',
  },
  {
    id: 'status',
    title: 'Status',
    lede: 'What is saved, what Traverion approved, and what Stripe still needs.',
  },
];

export type PartnerSetupProgress = {
  phase: UnifiedSetupPhaseId;
  businessDraftComplete: boolean;
  businessReview: ReturnType<typeof partnerBusinessReviewState>;
  payoutConfigured: boolean;
  bankingReady: boolean;
  payoutReview: ReturnType<typeof partnerPayoutReviewState>;
  hasListing: boolean;
  publishReady: boolean;
  nextPhase: UnifiedSetupPhaseId;
  nextCta: string;
  nextHint: string;
  formProgressLabel: string;
  businessHref: string;
  payoutHref: string;
  listingsHref: string;
  /** Requirement met (not merely visited). Status is never counted as a requirement. */
  phaseComplete: Record<Exclude<UnifiedSetupPhaseId, 'status'>, boolean>;
  requirementsDone: number;
  requirementsTotal: number;
};

/** Map unified phase → business wizard step. */
export function businessStepForPhase(phase: UnifiedSetupPhaseId): BusinessOnboardingStepId {
  if (phase === 'documents') return 'documents';
  if (phase === 'status') return 'review';
  return 'identity';
}

/** Map unified phase → payout wizard step. */
export function payoutStepForPhase(phase: UnifiedSetupPhaseId): PayoutWizardStepId {
  if (phase === 'representative') return 'representative';
  if (phase === 'payout') return 'bank';
  if (phase === 'status') return 'review';
  return 'business';
}

/** Business wizard step → unified phase (company vs documents). */
export function unifiedPhaseFromBusinessStep(step: BusinessOnboardingStepId): UnifiedSetupPhaseId {
  if (step === 'documents' || step === 'review') return 'documents';
  return 'business';
}

/** Payout wizard step → unified phase. */
export function unifiedPhaseFromPayoutStep(step: PayoutWizardStepId): UnifiedSetupPhaseId {
  if (step === 'bank' || step === 'preferences') return 'payout';
  if (step === 'review') return 'status';
  if (step === 'business') return 'business';
  return 'representative';
}

export function readOnboardingPhaseFromUrl(): UnifiedSetupPhaseId | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return parseUnifiedSetupPhase(params.get('phase') ?? params.get('step'));
}

export function writeOnboardingPhaseToUrl(phase: UnifiedSetupPhaseId): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('phase', phase);
  url.searchParams.delete('step');
  url.searchParams.delete('focus');
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

export function parseUnifiedSetupPhase(raw: string | null | undefined): UnifiedSetupPhaseId | null {
  const t = (raw ?? '').trim().toLowerCase();
  return UNIFIED_SETUP_SCREENS.some((s) => s.id === t) ? (t as UnifiedSetupPhaseId) : null;
}

/**
 * Resolve the next actionable phase from real profile + local drafts.
 * Never skips Traverion business completeness before payout collection.
 */
export function resolveUnifiedSetupPhase(
  profile: SupplierProfileRow | null | undefined,
  opts?: { userId?: string; hasListing?: boolean; requested?: UnifiedSetupPhaseId | null }
): UnifiedSetupPhaseId {
  if (opts?.requested) return opts.requested;
  const fieldsComplete = isSupplierBusinessProfileComplete(profile);
  const businessReview = partnerBusinessReviewState({
    verificationStatus: profile?.verification_status,
    submittedAt: profile?.verification_submitted_at,
    draftComplete: fieldsComplete,
    feedback: profile?.business_verification_feedback,
  });
  const businessComplete =
    fieldsComplete || businessReview === 'pending' || businessReview === 'verified';
  const payoutProgress = opts?.userId
    ? summarizePayoutWizardLocalProgress(loadPayoutWizardDraft(opts.userId))
    : summarizePayoutWizardLocalProgress(null);
  const bankingReady = isSupplierBankingReadyForPublish(profile);
  const payoutConfigured =
    bankingReady ||
    isSupplierPayoutConfigured(profile) ||
    payoutProgress.hasSavedProgress ||
    payoutProgress.wizardCompleted;

  if (businessReview === 'rejected') return 'documents';
  if (!businessComplete) {
    const bizDraft = opts?.userId ? loadBusinessOnboardingDraft(opts.userId) : null;
    if (
      bizDraft?.company_registration_document_path ||
      bizDraft?.step === 'documents' ||
      bizDraft?.step === 'review'
    ) {
      return 'documents';
    }
    return 'business';
  }
  if (!payoutConfigured) {
    if (
      payoutProgress.lastStep === 'bank' ||
      payoutProgress.lastStep === 'preferences' ||
      payoutProgress.lastStep === 'review' ||
      payoutProgress.bankDeferred ||
      payoutProgress.bankSavedLocally ||
      payoutProgress.preferencesSaved
    ) {
      return 'payout';
    }
    return 'representative';
  }
  return 'status';
}

export function derivePartnerSetupProgress(
  profile: SupplierProfileRow | null | undefined,
  opts: { userId: string; hasListing: boolean }
): PartnerSetupProgress {
  const fieldsComplete = isSupplierBusinessProfileComplete(profile);
  const businessReview = partnerBusinessReviewState({
    verificationStatus: profile?.verification_status,
    submittedAt: profile?.verification_submitted_at,
    draftComplete: fieldsComplete,
    feedback: profile?.business_verification_feedback,
  });
  // Pending / verified submissions already passed Traverion intake — treat as form-complete
  // even if a later completeness helper tightens required fields.
  const businessDraftComplete =
    fieldsComplete || businessReview === 'pending' || businessReview === 'verified';
  const localPayout = summarizePayoutWizardLocalProgress(loadPayoutWizardDraft(opts.userId));
  const bankingReady = isSupplierBankingReadyForPublish(profile);
  const payoutConfigured =
    bankingReady ||
    isSupplierPayoutConfigured(profile) ||
    localPayout.wizardCompleted ||
    localPayout.hasSavedProgress;
  const payoutReview = partnerPayoutReviewState({
    verificationStatus: profile?.payout_verification_status,
    submittedAt: profile?.payout_verification_submitted_at,
    hasBankDetails: payoutConfigured || bankingReady,
  });
  const publishReady = businessReview === 'verified' && bankingReady && opts.hasListing;
  const phase = resolveUnifiedSetupPhase(profile, {
    userId: opts.userId,
    hasListing: opts.hasListing,
  });

  let nextPhase: UnifiedSetupPhaseId = phase;
  let nextCta = 'Continue setup';
  let nextHint = 'Continue where you left off.';

  if (businessReview === 'rejected') {
    nextPhase = 'documents';
    nextCta = 'Fix and resubmit';
    nextHint = 'Traverion asked for updates. Replace the document if needed, then resubmit.';
  } else if (!businessDraftComplete) {
    nextPhase = phase === 'documents' ? 'documents' : 'business';
    nextCta = nextPhase === 'documents' ? 'Add documents' : 'Add company details';
    nextHint = 'Enter your company details once — Traverion reuses them for payouts.';
  } else if (businessReview === 'pending' && !payoutConfigured) {
    nextPhase = 'representative';
    nextCta = 'Continue to payouts';
    nextHint = 'Business details are under review. You can still prepare payout information.';
  } else if (!payoutConfigured) {
    nextPhase = phase === 'payout' ? 'payout' : 'representative';
    nextCta = nextPhase === 'payout' ? 'Set up payouts' : 'Add representative';
    nextHint =
      'Confirm the authorized representative, then payout preferences. Continue with Stripe when connection opens.';
  } else if (!opts.hasListing) {
    nextPhase = 'status';
    nextCta = 'Create your first listing';
    nextHint = 'Setup details are on file. Create a listing when you are ready.';
  } else if (publishReady) {
    nextPhase = 'status';
    nextCta = 'Go to listings';
    nextHint = 'You are ready to publish when your listing is complete.';
  } else {
    nextPhase = 'status';
    nextCta = 'View status';
    nextHint = 'Details are saved. Publishing waits until Traverion and payout checks are complete.';
  }

  const formProgressLabel = localPayout.wizardCompleted
    ? 'Payout form finished'
    : localPayout.hasSavedProgress
      ? 'Payout form in progress'
      : businessDraftComplete
        ? 'Company details saved'
        : 'Not started';

  const hasRegDoc = Boolean(
    (profile?.company_registration_document_path ?? '').trim() ||
      (opts.userId ? loadBusinessOnboardingDraft(opts.userId)?.company_registration_document_path : '')
  );

  const phaseComplete = {
    business:
      businessDraftComplete && businessReview !== 'rejected',
    documents:
      businessReview === 'pending' ||
      businessReview === 'verified' ||
      (businessDraftComplete && hasRegDoc && businessReview !== 'rejected'),
    representative:
      bankingReady || localPayout.representativeSaved || localPayout.wizardCompleted,
    payout:
      bankingReady ||
      localPayout.bankSavedLocally ||
      localPayout.preferencesSaved ||
      localPayout.bankDeferred ||
      localPayout.wizardCompleted,
  } as const;
  const requirementsTotal = 4;
  const requirementsDone = (
    ['business', 'documents', 'representative', 'payout'] as const
  ).filter((id) => phaseComplete[id]).length;

  return {
    phase,
    businessDraftComplete,
    businessReview,
    payoutConfigured,
    bankingReady,
    payoutReview,
    hasListing: opts.hasListing,
    publishReady,
    nextPhase,
    nextCta,
    nextHint,
    formProgressLabel,
    businessHref: '/partner/onboarding?phase=business',
    payoutHref: '/partner/onboarding?phase=representative',
    listingsHref: '/partner/listings',
    phaseComplete,
    requirementsDone,
    requirementsTotal,
  };
}

/** Sanitize business draft for setup_progress jsonb (no document bytes). */
export function toServerSetupProgress(input: {
  phase?: UnifiedSetupPhaseId;
  business_step?: BusinessOnboardingStepId;
  payout_step?: PayoutWizardStepId;
  business_draft?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const draft = input.business_draft && typeof input.business_draft === 'object' ? input.business_draft : {};
  const safeDraft: Record<string, unknown> = {};
  for (const key of [
    'step',
    'display_name',
    'company_legal_name',
    'business_type',
    'company_registration_number',
    'tax_id',
    'vat_id',
    'directors',
    'managing_directors',
    'contact_phone',
    'address_street',
    'address_city',
    'address_postal_code',
    'address_country',
    'company_registration_document_path',
    'owner_authority_confirmed',
    'updatedAt',
  ] as const) {
    if (key in draft) safeDraft[key] = draft[key];
  }
  return {
    version: 1,
    phase: input.phase ?? null,
    business_step: input.business_step ?? null,
    payout_step: input.payout_step ?? null,
    business_draft: safeDraft,
    updated_at: new Date().toISOString(),
  };
}

function parseIsoMs(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Merge server setup_progress business draft into local resume state.
 * Newer timestamp wins; never invent verification from drafts.
 */
export function mergeServerBusinessSetupDraft(
  local: ReturnType<typeof loadBusinessOnboardingDraft>,
  serverProgress: unknown,
  opts?: { serverUpdatedAt?: string | null }
): ReturnType<typeof loadBusinessOnboardingDraft> {
  if (!serverProgress || typeof serverProgress !== 'object') return local;
  const root = serverProgress as Record<string, unknown>;
  const serverDraft =
    root.business_draft && typeof root.business_draft === 'object'
      ? (root.business_draft as Record<string, unknown>)
      : null;
  if (!serverDraft) return local;

  const serverMs = Math.max(
    parseIsoMs(opts?.serverUpdatedAt),
    parseIsoMs(root.updated_at),
    parseIsoMs(serverDraft.updatedAt)
  );
  const localMs = parseIsoMs(local?.updatedAt);
  if (local && localMs >= serverMs) return local;

  const stepRaw = typeof serverDraft.step === 'string' ? serverDraft.step : local?.step;
  const step =
    stepRaw === 'identity' ||
    stepRaw === 'contact' ||
    stepRaw === 'documents' ||
    stepRaw === 'review'
      ? stepRaw
      : local?.step ?? 'identity';

  return emptyBusinessOnboardingDraft({
    ...(local ?? {}),
    ...serverDraft,
    step,
    updatedAt: new Date(serverMs || Date.now()).toISOString(),
  });
}

export function phaseFromBusinessStep(step: BusinessOnboardingStepId): UnifiedSetupPhaseId {
  if (step === 'documents' || step === 'review') return 'documents';
  return 'business';
}

export function phaseFromPayoutStep(step: PayoutWizardStepId): UnifiedSetupPhaseId {
  if (step === 'bank' || step === 'preferences') return 'payout';
  if (step === 'review') return 'status';
  if (step === 'representative' || step === 'identity') return 'representative';
  return 'representative';
}

export function readinessCopyFromProfile(
  profile: SupplierProfileRow | null | undefined,
  userId: string
) {
  const localProgress = summarizePayoutWizardLocalProgress(loadPayoutWizardDraft(userId));
  const connectLabel = connectOnboardingLabel(profile?.connect_onboarding_status, {
    connect_account_livemode: profile?.connect_account_livemode,
  });
  return buildPayoutReadinessLanes({
    localProgress,
    verificationStatus: profile?.verification_status,
    connectLabel,
    hasConnectedAccount: Boolean(profile?.stripe_connected_account_id),
    canReceiveTransfers: Boolean(profile?.connect_payouts_enabled),
    connectLivemode: profile?.connect_account_livemode,
    connectSetupUnavailable: !profile?.stripe_connected_account_id,
    liveCreateAllowed: false,
    platformEnvironment: profile?.connect_account_livemode === false ? 'test' : 'live',
  });
}
