import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  fetchSupplierProfile,
  updateSupplierPayout,
  updateSupplierSetupProgress,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import {
  phaseFromPayoutStep,
  toServerSetupProgress,
  unifiedPhaseFromPayoutStep,
} from '../../lib/partner-unified-setup';
import {
  connectOnboardingUserMessage,
  fetchConnectAccountLink,
  invokeConnectSupplierOnboarding,
} from '../../data/supabase-connect-onboarding';
import type { SupplierCommercialTermsRow } from '../../data/supabase-earnings';
import { formatBpsAsPercent } from '../../lib/commercial-money';
import { humanizeConnectRequirements } from '../../lib/connect-requirement-labels';
import { connectCanReceiveTransfers, connectOnboardingLabel } from '../../lib/connect-payout-status';
import { bankAlreadyManaged } from '../../lib/verification-workspace-lifecycle';
import {
  catalogPayoutRates,
  catalogRateForPreference,
  parsePayoutThreshold,
  type PayoutCyclePreference,
} from '../../lib/payout-preference';
import {
  buildPayoutReadinessLanes,
  canProvisionConnectAccount,
  clearPayoutWizardDraft,
  emptyBeneficialOwner,
  emptyPayoutWizardDraft,
  suggestRepresentativeNameFromDirectors,
  supplierFacingLiveCreateBlockReason,
  emptyServerPayoutWizardDraft,
  formatPayoutBusinessAddress,
  isLiveAccountCreationGateError,
  loadPayoutWizardDraft,
  parseOwnershipPercent,
  parsePayoutWizardDob,
  PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY,
  PAYOUT_LIVE_SETUP_UNAVAILABLE_SHORT,
  PAYOUT_WIZARD_RETURN_HREF,
  PAYOUT_WIZARD_SCREENS,
  PAYOUT_WIZARD_STRIPE_AUTH_COPY,
  PAYOUT_WIZARD_TOS_COPY,
  firstOutstandingWizardStep,
  payoutWizardStepIndex,
  sanitizeOwnershipPercentInput,
  savePayoutWizardDraft,
  sumDeclaredOwnershipPercent,
  mergeServerPayoutWizardDraft,
  payoutBankPresentation,
  payoutVerificationPresentation,
  summarizePayoutWizardLocalProgress,
  toServerPayoutWizardDraft,
  validateOwnershipPercent,
  validateIban,
  validatePayoutBusinessFromProfile,
  validatePayoutWizardIdentity,
  validatePayoutWizardPreferences,
  validatePayoutWizardRepresentative,
  validatePayoutWizardRepresentativeFields,
  type PayoutWizardDraft,
  type PayoutWizardFieldErrors,
  type PayoutWizardStepId,
} from '../../lib/payout-setup-wizard';
import { isValidFinnishBusinessId, parseDirectors, serializeDirectors } from '../../lib/business-identity-validation';
import { STRIPE_RECIPIENT_AGREEMENT } from '../../lib/stripe-recipient-agreement';
import { createBankAccountToken } from '../../lib/stripe-js-client';
import { isSupplierBusinessIdentityLocked } from '../../lib/supplierVerificationLocks';
import {
  PARTNER_PAYOUT_FREQUENCY_MONTHLY_DETAIL,
  PARTNER_PAYOUT_FREQUENCY_MONTHLY_LABEL,
  PARTNER_PAYOUT_FREQUENCY_TWICE_MONTHLY_DETAIL,
  PARTNER_PAYOUT_FREQUENCY_TWICE_MONTHLY_LABEL,
} from '../../lib/booking-confirmation-copy';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_HELP } from '../../lib/partnerHelpCopy';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { partnerToast } from '../../lib/partner-toast';
import PartnerHelpTip from './PartnerHelpTip';
import DateOfBirthPicker from './DateOfBirthPicker';
import { validateIsoDob } from '../../lib/date-of-birth';

function normalizeCountryCode(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const lower = t.toLowerCase();
  if (lower === 'finland' || lower === 'suomi') return 'FI';
  return t;
}

const ConnectEmbeddedPanel = lazy(() => import('./ConnectEmbeddedPanel'));

type Props = {
  userId: string;
  profile: SupplierProfileRow | null;
  commercialTerms: SupplierCommercialTermsRow | null;
  payoutCurrency: string | null;
  canEdit: boolean;
  onProfile: (profile: SupplierProfileRow | null) => void;
  onClose: () => void;
  initialStep?: PayoutWizardStepId;
  /** Authoritative shell phase when embedded — parent owns URL/sidebar. */
  unifiedPhase?: 'representative' | 'payout';
  /** P9.41 — embed inside unified Partner setup shell. */
  variant?: 'fullscreen' | 'embedded';
  onUnifiedPhaseChange?: (phase: 'representative' | 'payout' | 'status') => void;
  onBackToPreviousPhase?: () => void;
};

/**
 * Prefill company fields from the business profile (SoT).
 * Never invent DOB, ownership, or a representative from directors —
 * a director is not automatically the legal representative.
 */
function prefillFromProfile(profile: SupplierProfileRow | null): Partial<PayoutWizardDraft> {
  const directors = serializeDirectors(parseDirectors(profile?.managing_directors));
  // Soft-suggest name only when a single director is known — never DOB / ownership.
  const suggested = suggestRepresentativeNameFromDirectors(profile?.managing_directors);
  return {
    company_legal_name: profile?.company_legal_name ?? profile?.display_name ?? '',
    business_type:
      profile?.business_type === 'company' || profile?.business_type === 'individual'
        ? profile.business_type
        : '',
    company_registration_number: profile?.company_registration_number ?? '',
    address_street: profile?.address_street ?? '',
    address_city: profile?.address_city ?? '',
    address_postal_code: profile?.address_postal_code ?? '',
    address_country: profile?.address_country ?? '',
    contact_phone: profile?.contact_phone ?? '',
    managing_directors: directors,
    ...(suggested
      ? { rep_first_name: suggested.first_name, rep_last_name: suggested.last_name }
      : {}),
    payment_cycle:
      profile?.payment_cycle === 'monthly' || profile?.payment_cycle === 'biweekly'
        ? profile.payment_cycle
        : '',
    payout_threshold_min:
      profile?.payout_threshold_min != null ? String(profile.payout_threshold_min) : '',
  };
}

function FieldLabel({
  children,
  help,
  optional,
}: {
  children: string;
  help?: string;
  optional?: boolean;
}) {
  return (
    <span className="mb-1.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#17191d]">
      {children}
      {optional ? <span className="font-normal text-[#5c6570]">(optional)</span> : null}
      {help ? <PartnerHelpTip label={`About ${children}`}>{help}</PartnerHelpTip> : null}
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-[12px] font-medium text-[#9f1239]" role="alert">
      {message}
    </p>
  );
}

function OwnershipPercentInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const bump = (delta: number) => {
    const current = parseOwnershipPercent(value) ?? 0;
    const next = Math.min(100, Math.max(0, Math.round((current + delta) * 100) / 100));
    onChange(String(next));
  };
  return (
    <div className="tv-ownership-stepper">
      <button type="button" aria-label="Decrease ownership" disabled={disabled} onClick={() => bump(-1)}>
        −
      </button>
      <input
        className="tv-input h-11"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(sanitizeOwnershipPercentInput(e.target.value))}
        aria-label="Ownership percent"
      />
      <button type="button" aria-label="Increase ownership" disabled={disabled} onClick={() => bump(1)}>
        +
      </button>
    </div>
  );
}

function scrollToFirstFieldError(errors: PayoutWizardFieldErrors) {
  const order: Array<keyof PayoutWizardFieldErrors> = [
    'rep_first_name',
    'rep_last_name',
    'rep_dob',
    'rep_percent_ownership',
    'beneficial_owners',
    'company_legal_name',
    'business_type',
    'address_street',
    'address_city',
    'address_postal_code',
    'address_country',
    'payment_cycle',
    'payout_threshold_min',
    'tos_accepted',
  ];
  const key = order.find((k) => errors[k]);
  if (!key || typeof document === 'undefined') return;
  const root = document.querySelector(`[data-field="${key}"]`);
  root?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  const focusable = root?.querySelector<HTMLElement>('input,button,select,textarea');
  focusable?.focus({ preventScroll: true });
}

export default function PayoutSetupWizard({
  userId,
  profile,
  commercialTerms,
  payoutCurrency,
  canEdit,
  onProfile,
  onClose,
  initialStep,
  unifiedPhase,
  variant = 'fullscreen',
  onUnifiedPhaseChange,
  onBackToPreviousPhase,
}: Props) {
  const embedded = variant === 'embedded';
  const shellPhase = unifiedPhase ?? null;
  const rates = catalogPayoutRates();
  const currency = (payoutCurrency || profile?.connect_default_currency || 'EUR').toUpperCase();
  // DEV-only UI probe (?express_embed_probe=1): exercise Express embed gating without mutating Stripe.
  const expressEmbedProbe =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('express_embed_probe') === '1';
  const isExpress = expressEmbedProbe || profile?.connect_account_type === 'express';
  const isCustom = profile?.connect_account_type === 'custom' || !isExpress;
  const canReceive = connectCanReceiveTransfers(profile ?? {});
  const bankManaged = bankAlreadyManaged(profile);
  const outstandingKeys = [
    ...(Array.isArray(profile?.connect_requirements_currently_due)
      ? profile!.connect_requirements_currently_due!
      : []),
    ...(Array.isArray(profile?.connect_requirements_past_due)
      ? profile!.connect_requirements_past_due!
      : []),
  ].map(String);
  const outstandingLabels = humanizeConnectRequirements(outstandingKeys);
  const identityDocumentDue = outstandingKeys.some((key) =>
    /verification\.document|additional_document|identity_document|primary_verification/i.test(key)
  );
  const providerControlledDue = outstandingKeys.some((key) =>
    /liveness|selfie|risk_review|electronic_id|proof_of_liveness/i.test(key)
  );
  const bankRequirementDue = outstandingKeys.some((key) =>
    /external_account|bank_account/i.test(key)
  );
  const accountRestricted = ['restricted', 'rejected'].includes(
    (profile?.connect_onboarding_status ?? '').toLowerCase()
  );
  const resumeStep = firstOutstandingWizardStep(outstandingKeys);

  const [draft, setDraft] = useState<PayoutWizardDraft>(() => {
    const saved = loadPayoutWizardDraft(userId);
    const prefill = prefillFromProfile(profile);
    let merged = emptyPayoutWizardDraft({
      ...prefill,
      ...(saved ?? {}),
      tos_accepted: false,
      step: initialStep ?? saved?.step ?? (embedded ? 'representative' : 'business'),
    });
    merged = mergeServerPayoutWizardDraft(merged, profile?.payout_wizard_draft ?? null, {
      serverUpdatedAt: profile?.payout_wizard_draft_updated_at,
    });
    if (embedded && initialStep) merged.step = initialStep;
    // Keep soft-suggested names when a prior draft left them blank.
    if (!merged.rep_first_name.trim() && prefill.rep_first_name) {
      merged.rep_first_name = prefill.rep_first_name;
    }
    if (!merged.rep_last_name.trim() && prefill.rep_last_name) {
      merged.rep_last_name = prefill.rep_last_name;
    }
    if (profile?.business_type === 'individual' && !saved?.representativeSavedAt && !merged.representativeSavedAt) {
      merged.rep_is_director = false;
    }
    return merged;
  });
  // The shell can mount this form before the profile row arrives. Fill a blank
  // name from the saved draft once, without waiting for the Stripe status call.
  useEffect(() => {
    if (!profile) return;
    setDraft((current) => {
      if (current.rep_first_name.trim() && current.rep_last_name.trim()) return current;
      const prefill = prefillFromProfile(profile);
      const merged = mergeServerPayoutWizardDraft(current, profile.payout_wizard_draft ?? null, {
        serverUpdatedAt: profile.payout_wizard_draft_updated_at,
      });
      if (!merged.rep_first_name.trim() && prefill.rep_first_name) {
        merged.rep_first_name = prefill.rep_first_name;
      }
      if (!merged.rep_last_name.trim() && prefill.rep_last_name) {
        merged.rep_last_name = prefill.rep_last_name;
      }
      if (embedded && initialStep) merged.step = initialStep;
      if (
        merged.rep_first_name === current.rep_first_name &&
        merged.rep_last_name === current.rep_last_name
      ) {
        return current;
      }
      return merged;
    });
  }, [profile, embedded, initialStep]);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [phase, setPhase] = useState<'steps' | 'complete'>('steps');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<PayoutWizardFieldErrors>({});
  const [connectSetupUnavailable, setConnectSetupUnavailable] = useState(false);
  const [showStripeEmbed, setShowStripeEmbed] = useState(false);
  const [expressLaunchFailed, setExpressLaunchFailed] = useState(false);
  const [showIdentityRemediation, setShowIdentityRemediation] = useState(false);
  const [hostedFallbackUrl, setHostedFallbackUrl] = useState<string | null>(null);
  const [hostedLinkBusy, setHostedLinkBusy] = useState(false);
  const [persistLabel, setPersistLabel] = useState<string | null>(null);
  const [serverHydrated, setServerHydrated] = useState(false);
  const [bankIban, setBankIban] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [bankMasked, setBankMasked] = useState<string | null>(null);
  const [platformEnvironment, setPlatformEnvironment] = useState<'test' | 'live' | null>(null);
  const [liveCreateAllowed, setLiveCreateAllowed] = useState(false);
  const [liveCreateBlockedReason, setLiveCreateBlockedReason] = useState<string | null>(null);
  const [identityDocSide, setIdentityDocSide] = useState<'front' | 'back'>('front');
  const [identityUploadNote, setIdentityUploadNote] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const serverDraftTimer = useRef<number | null>(null);
  const hasConnectedAccount = Boolean(profile?.stripe_connected_account_id?.trim());
  const canProvisionConnect = canProvisionConnectAccount({
    hasConnectedAccount,
    platformEnvironment,
    liveCreateAllowed,
  });

  const payoutStepBucket = (step: PayoutWizardStepId) =>
    step === 'bank' || step === 'preferences' || step === 'review'
      ? 'payout'
      : step === 'business'
        ? 'business'
        : 'representative';

  /** Prefer shell-driven step on first paint so sidebar/URL never disagree with content. */
  const displayStep: PayoutWizardStepId =
    embedded && initialStep && payoutStepBucket(draft.step) !== payoutStepBucket(initialStep)
      ? initialStep
      : draft.step;

  const stepIndex = payoutWizardStepIndex(displayStep);
  const screen = PAYOUT_WIZARD_SCREENS[stepIndex]!;
  const progressPct = Math.round(((stepIndex + 1) / PAYOUT_WIZARD_SCREENS.length) * 100);
  const onboardingStatus = (profile?.connect_onboarding_status ?? '').toLowerCase();
  // P9.52: Custom Accounts v2 (dashboard none, platform collects requirements) uses Traverion forms.
  // Stripe is updated through server APIs. Do not mount the full embedded questionnaire.
  const customUsesEmbeddedVerification = false;
  const useStripeEmbed =
    (isExpress || customUsesEmbeddedVerification) &&
    (displayStep === 'representative' || displayStep === 'identity' || displayStep === 'bank');
  /** Express still needs Stripe-collected KYC — never auto-mount; user must start it. Custom auto-mounts (no Stripe login). */
  const expressVerificationMandatory =
    isExpress &&
    (outstandingKeys.length > 0 ||
      accountRestricted ||
      onboardingStatus === 'not_started' ||
      onboardingStatus === 'pending' ||
      onboardingStatus === '' ||
      !profile?.connect_details_submitted);
  const customVerificationMandatory =
    customUsesEmbeddedVerification &&
    (outstandingKeys.length > 0 ||
      accountRestricted ||
      onboardingStatus === 'not_started' ||
      onboardingStatus === 'pending' ||
      onboardingStatus === 'restricted' ||
      onboardingStatus === '' ||
      !canReceive ||
      !profile?.connect_details_submitted);

  // Parent shell owns phase/URL. Sync draft step DOWN before paint — never fight back upward.
  useLayoutEffect(() => {
    if (!embedded || !initialStep) return;
    setDraft((d) => {
      const target = payoutStepBucket(initialStep);
      const current = payoutStepBucket(d.step);
      if (current === target) {
        // Keep in-phase progress (e.g. preferences while shell says payout).
        return d;
      }
      return { ...d, step: initialStep };
    });
  }, [embedded, initialStep]);

  // P9.49: Custom + connected → mount official embedded onboarding automatically (no Account Link redirect).
  useEffect(() => {
    if (!customUsesEmbeddedVerification || !useStripeEmbed || !canEdit) return;
    if (!customVerificationMandatory || showStripeEmbed || hostedFallbackUrl) return;
    setShowStripeEmbed(true);
  }, [
    customUsesEmbeddedVerification,
    useStripeEmbed,
    canEdit,
    customVerificationMandatory,
    showStripeEmbed,
    hostedFallbackUrl,
  ]);

  useEffect(() => {
    if (embedded) return;
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('step') === draft.step) return;
    url.searchParams.set('step', draft.step);
    url.searchParams.delete('focus');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [draft.step, embedded]);

  useEffect(() => {
    // Local cache is a UX resume aid only — never the cross-device source of truth.
    savePayoutWizardDraft(userId, draft);
    if (!serverHydrated) return;
    setPersistLabel('Saving…');
    const t = window.setTimeout(() => setPersistLabel(null), 1800);
    if (serverDraftTimer.current) window.clearTimeout(serverDraftTimer.current);
    serverDraftTimer.current = window.setTimeout(() => {
      void Promise.all([
        invokeConnectSupplierOnboarding('save_wizard_draft', {
          wizard_draft: toServerPayoutWizardDraft(draft),
        }),
        updateSupplierSetupProgress(
          userId,
          toServerSetupProgress({
            phase: phaseFromPayoutStep(draft.step),
            payout_step: draft.step,
          })
        ),
      ]).then(([result]) => {
        if (result.success) setPersistLabel('Saved to your account');
        else setPersistLabel('Could not sync — retrying on next change');
        window.setTimeout(() => setPersistLabel(null), 1800);
      });
    }, 900);
    return () => {
      window.clearTimeout(t);
      if (serverDraftTimer.current) window.clearTimeout(serverDraftTimer.current);
    };
  }, [userId, draft, serverHydrated]);

  useEffect(() => {
    let cancelled = false;
    void invokeConnectSupplierOnboarding('status')
      .then((result) => {
        if (cancelled) return;
        if (result.environment === 'test' || result.environment === 'live') {
          setPlatformEnvironment(result.environment);
        }
        const allowed = result.live_create_allowed === true || result.environment === 'test';
        setLiveCreateAllowed(Boolean(result.live_create_allowed) || result.environment === 'test');
        setLiveCreateBlockedReason(
          result.environment === 'live' && !result.live_create_allowed
            ? supplierFacingLiveCreateBlockReason(
                result.live_create_blocked_reason ?? PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY
              )
            : null
        );
        if (!allowed && result.environment === 'live' && !hasConnectedAccount) {
          setConnectSetupUnavailable(true);
        } else if (allowed || hasConnectedAccount) {
          setConnectSetupUnavailable(false);
        }
        if (result.wizard_draft && typeof result.wizard_draft === 'object') {
          setDraft((current) => {
            const merged = mergeServerPayoutWizardDraft(current, result.wizard_draft, {
              serverUpdatedAt: result.wizard_draft_updated_at,
            });
            // Keep hydrated step inside the shell phase so parent navigation stays authoritative.
            if (embedded && shellPhase) {
              const mergedPhase = unifiedPhaseFromPayoutStep(merged.step);
              if (mergedPhase !== shellPhase && mergedPhase !== 'status' && mergedPhase !== 'business') {
                merged.step = initialStep ?? (shellPhase === 'payout' ? 'bank' : 'representative');
              }
            }
            savePayoutWizardDraft(userId, merged);
            return merged;
          });
        }
        if (result.onboarding && typeof result.onboarding === 'object') {
          // Status sync from Stripe mirror — never invent Verified from local markers.
          void fetchSupplierProfile(userId).then((next) => {
            if (!cancelled) onProfile(next);
          });
        }
      })
      .finally(() => {
        if (!cancelled) setServerHydrated(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount hydrate only
  }, []);

  // Express embeds stay user-initiated. Custom accounts that already require verification
  // keep the embedded component mounted across Identity and Bank so it does not flash blank.
  useEffect(() => {
    const keepCustomEmbed =
      customUsesEmbeddedVerification &&
      customVerificationMandatory &&
      (draft.step === 'representative' || draft.step === 'identity' || draft.step === 'bank');
    if (!keepCustomEmbed) {
      setShowStripeEmbed(false);
      setHostedFallbackUrl(null);
      setShowIdentityRemediation(false);
      setExpressLaunchFailed(false);
    }
    setIdentityUploadNote(null);
  }, [draft.step, customUsesEmbeddedVerification, customVerificationMandatory]);

  useEffect(() => {
    const holder =
      profile?.company_legal_name?.trim() || draft.company_legal_name.trim() || '';
    if (!bankHolder && holder) {
      setBankHolder(holder);
    }
  }, [profile?.company_legal_name, draft.company_legal_name, bankHolder]);

  const patch = (partial: Partial<PayoutWizardDraft>) => {
    setDraft((d) => ({ ...d, ...partial }));
  };

  const goTo = (step: PayoutWizardStepId, dir: 'forward' | 'back') => {
    setPhase('steps');
    setDirection(dir);
    setError(null);
    setNote(null);
    setFieldErrors({});
    patch({ step });
    if (embedded) {
      const nextPhase = unifiedPhaseFromPayoutStep(step);
      if (nextPhase === 'representative' || nextPhase === 'payout' || nextPhase === 'status') {
        onUnifiedPhaseChange?.(nextPhase);
      }
    }
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: 0, behavior: 'auto' });
    // Do not focus the heading. Programmatic focus drew a rectangle around the title on each phase.
  }, [draft.step, phase]);

  const businessLocked = isSupplierBusinessIdentityLocked(
    profile?.verification_status,
    profile?.verification_submitted_at,
    profile?.business_type,
    profile?.business_verification_feedback
  );

  const openBusinessAmendment = () => {
    if (embedded) {
      onBackToPreviousPhase?.();
      return;
    }
    navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding?phase=business`);
  };

  /** Stripe TEST may create; LIVE creates only when edge reports live_create_allowed. */
  const ensureConnectWhenAllowed = async (): Promise<{
    ok: boolean;
    provisioned: boolean;
    error?: string;
  }> => {
    if (hasConnectedAccount) return { ok: true, provisioned: true };
    if (!canProvisionConnectAccount({
      hasConnectedAccount: false,
      platformEnvironment,
      liveCreateAllowed,
    })) {
      setConnectSetupUnavailable(true);
      setNote(
        supplierFacingLiveCreateBlockReason(
          liveCreateBlockedReason || PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY
        )
      );
      return { ok: true, provisioned: false };
    }
    const ensured = await invokeConnectSupplierOnboarding('ensure_account');
    if (!ensured.success) {
      if (isLiveAccountCreationGateError(ensured.error)) {
        setConnectSetupUnavailable(true);
        setLiveCreateAllowed(false);
        setNote(supplierFacingLiveCreateBlockReason(ensured.error));
        return { ok: true, provisioned: false };
      }
      return { ok: false, provisioned: false, error: ensured.error };
    }
    onProfile(await fetchSupplierProfile(userId));
    setConnectSetupUnavailable(false);
    return { ok: true, provisioned: true };
  };

  const persistServerDraft = async (next: PayoutWizardDraft = draft): Promise<boolean> => {
    const result = await invokeConnectSupplierOnboarding('save_wizard_draft', {
      wizard_draft: toServerPayoutWizardDraft(next),
    });
    return result.success;
  };

  const saveBusiness = async (): Promise<boolean> => {
    const invalid = validatePayoutBusinessFromProfile(profile);
    if (invalid) {
      setError(invalid);
      return false;
    }
    if (!canEdit) {
      setError('Your role can view setup but cannot change it.');
      return false;
    }
    setBusy(true);
    setError(null);

    const legalName = (profile?.company_legal_name ?? '').trim();
    const businessType =
      profile?.business_type === 'company' || profile?.business_type === 'individual'
        ? profile.business_type
        : '';
    const normalizedCountry = normalizeCountryCode(profile?.address_country ?? '');
    // Keep draft mirrors for later Stripe submit / bank holder — do not write back to profile.
    patch({
      company_legal_name: legalName,
      business_type: businessType,
      company_registration_number: profile?.company_registration_number ?? '',
      address_street: profile?.address_street ?? '',
      address_city: profile?.address_city ?? '',
      address_postal_code: profile?.address_postal_code ?? '',
      address_country: normalizedCountry,
      contact_phone: profile?.contact_phone ?? '',
      managing_directors: serializeDirectors(parseDirectors(profile?.managing_directors)),
    });

    if (canProvisionConnect && isCustom && !isExpress) {
      const ensured = await ensureConnectWhenAllowed();
      if (!ensured.ok) {
        setBusy(false);
        setError(connectOnboardingUserMessage(ensured.error));
        return false;
      }
      if (ensured.provisioned) {
        const submit = await invokeConnectSupplierOnboarding('submit_business', {
          business: {
            legal_name: legalName || undefined,
            business_type: businessType || undefined,
            registration_number: profile?.company_registration_number?.trim() || undefined,
            tax_id: profile?.tax_id?.trim() || profile?.vat_id?.trim() || undefined,
            phone: profile?.contact_phone?.trim() || undefined,
            address: {
              line1: (profile?.address_street ?? '').trim(),
              city: (profile?.address_city ?? '').trim(),
              postal_code: (profile?.address_postal_code ?? '').trim(),
              country: normalizedCountry,
            },
          },
        });
        if (!submit.success) {
          if (isLiveAccountCreationGateError(submit.error)) {
            setConnectSetupUnavailable(true);
            setNote(supplierFacingLiveCreateBlockReason(PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY));
          } else if (!/409|express/i.test(submit.error ?? '')) {
            setBusy(false);
            setError(connectOnboardingUserMessage(submit.error));
            return false;
          }
        }
      }
    } else if (!hasConnectedAccount) {
      setConnectSetupUnavailable(true);
      setNote(supplierFacingLiveCreateBlockReason(PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY));
    }

    onProfile(await fetchSupplierProfile(userId));
    patch({ businessSavedAt: new Date().toISOString() });
    if (businessLocked && !connectSetupUnavailable) {
      setNote('Using your saved business profile. Edit business details to request changes.');
    }
    setBusy(false);
    return true;
  };

  const saveRepresentativeNative = async (): Promise<boolean> => {
    const fields = validatePayoutWizardRepresentativeFields(draft);
    if (Object.keys(fields).length) {
      setFieldErrors(fields);
      setError(validatePayoutWizardRepresentative(draft));
      scrollToFirstFieldError(fields);
      return false;
    }
    if (!canEdit) {
      setError('Your role can view setup but cannot change it.');
      return false;
    }
    const dobErr = validateIsoDob(draft.rep_dob, { required: true });
    const dob = parsePayoutWizardDob(draft.rep_dob);
    if (dobErr || !dob) {
      const msg = dobErr ?? 'Enter a valid date of birth.';
      setFieldErrors({ rep_dob: msg });
      setError(msg);
      scrollToFirstFieldError({ rep_dob: msg });
      return false;
    }
    const ownership = draft.rep_is_owner
      ? parseOwnershipPercent(draft.rep_percent_ownership)
      : null;
    if (draft.rep_is_owner && ownership == null) {
      const ownershipErr = validateOwnershipPercent(draft.rep_percent_ownership, { required: true });
      setFieldErrors({ rep_percent_ownership: ownershipErr ?? 'Enter a valid ownership percentage.' });
      setError(ownershipErr);
      return false;
    }
    if (!draft.verification_consent) {
      setError('Confirm that Traverion may send the company record and this person’s details for verification.');
      return false;
    }
    const registrationCountry = normalizeCountryCode(profile?.address_country || draft.address_country || '');
    if (
      (profile?.business_type || draft.business_type) === 'company' &&
      registrationCountry === 'FI' &&
      !isValidFinnishBusinessId(profile?.company_registration_number || draft.company_registration_number)
    ) {
      setError('The Finnish Business ID on the company record needs to be corrected before it can be sent.');
      return false;
    }

    setBusy(true);
    setError(null);
    setFieldErrors({});

    // Draft-first on LIVE without an account; Stripe TEST may provision.
    if (!canProvisionConnect) {
      patch({ representativeSavedAt: new Date().toISOString() });
      setConnectSetupUnavailable(true);
      setNote(supplierFacingLiveCreateBlockReason(PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY));
      setBusy(false);
      return true;
    }

    const ensured = await ensureConnectWhenAllowed();
    if (!ensured.ok) {
      setBusy(false);
      setError(connectOnboardingUserMessage(ensured.error));
      return false;
    }
    if (!ensured.provisioned) {
      patch({ representativeSavedAt: new Date().toISOString() });
      setBusy(false);
      return true;
    }

    const country =
      normalizeCountryCode(draft.address_country || profile?.address_country || '') || 'FI';
    const businessSubmit = await invokeConnectSupplierOnboarding('submit_business', {
      business: {
        legal_name: (profile?.company_legal_name || draft.company_legal_name).trim() || undefined,
        business_type: profile?.business_type || draft.business_type || undefined,
        registration_number:
          (profile?.company_registration_number || draft.company_registration_number).trim() || undefined,
        phone: (profile?.contact_phone || draft.contact_phone).trim() || undefined,
        address: {
          line1: (profile?.address_street || draft.address_street).trim(),
          city: (profile?.address_city || draft.address_city).trim(),
          postal_code: (profile?.address_postal_code || draft.address_postal_code).trim(),
          country,
        },
      },
    });
    if (!businessSubmit.success && !isLiveAccountCreationGateError(businessSubmit.error)) {
      setBusy(false);
      setError(connectOnboardingUserMessage(businessSubmit.error));
      return false;
    }
    const result = await invokeConnectSupplierOnboarding('submit_representative', {
      representative: {
        first_name: draft.rep_first_name.trim(),
        last_name: draft.rep_last_name.trim(),
        email: draft.rep_email.trim() || undefined,
        phone: draft.rep_phone.trim() || draft.contact_phone.trim() || profile?.contact_phone || undefined,
        title: draft.rep_title.trim() || undefined,
        dob,
        address: {
          line1: (draft.address_street || profile?.address_street || '').trim(),
          city: (draft.address_city || profile?.address_city || '').trim(),
          postal_code: (draft.address_postal_code || profile?.address_postal_code || '').trim(),
          country,
        },
        relationship: {
          owner: draft.rep_is_owner,
          executive: true,
          // Do not mark every representative as a company director automatically.
          director: draft.rep_is_director,
          percent_ownership: draft.rep_is_owner ? ownership : null,
        },
      },
    });
    if (!result.success) {
      setBusy(false);
      if (isLiveAccountCreationGateError(result.error)) {
        setConnectSetupUnavailable(true);
        patch({ representativeSavedAt: new Date().toISOString() });
        setNote(supplierFacingLiveCreateBlockReason(PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY));
        return true;
      }
      setError(connectOnboardingUserMessage(result.error));
      return false;
    }

    if (draft.beneficial_owners.length > 0) {
      const ownersPayload = draft.beneficial_owners.map((owner) => {
        const ownerDob = parsePayoutWizardDob(owner.dob)!;
        return {
          first_name: owner.first_name.trim(),
          last_name: owner.last_name.trim(),
          email: owner.email.trim() || undefined,
          dob: ownerDob,
          percent_ownership: parseOwnershipPercent(owner.percent_ownership),
          address: {
            line1: (draft.address_street || profile?.address_street || '').trim(),
            city: (draft.address_city || profile?.address_city || '').trim(),
            postal_code: (draft.address_postal_code || profile?.address_postal_code || '').trim(),
            country,
          },
        };
      });
      const ownersResult = await invokeConnectSupplierOnboarding('submit_beneficial_owners', {
        owners: ownersPayload,
      });
      if (!ownersResult.success) {
        setBusy(false);
        setError(connectOnboardingUserMessage(ownersResult.error));
        return false;
      }
    }

    // Do not overwrite managing_directors — business onboarding remains SoT for directors.
    onProfile(await fetchSupplierProfile(userId));
    patch({
      representativeSavedAt: new Date().toISOString(),
      rep_person_id: result.person_id?.trim() || draft.rep_person_id,
    });
    setBusy(false);
    return true;
  };

  const saveIdentityNative = async (): Promise<boolean> => {
    const invalid = validatePayoutWizardIdentity(draft);
    if (invalid) {
      setError(invalid);
      return false;
    }
    if (!canEdit) {
      setError('Your role can view setup but cannot change it.');
      return false;
    }
    if (!canProvisionConnect) {
      patch({ identitySavedAt: new Date().toISOString() });
      setConnectSetupUnavailable(true);
      setNote(supplierFacingLiveCreateBlockReason(PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY));
      return true;
    }
    setBusy(true);
    setError(null);
    const ensured = await ensureConnectWhenAllowed();
    if (!ensured.ok) {
      setBusy(false);
      setError(connectOnboardingUserMessage(ensured.error));
      return false;
    }
    if (!ensured.provisioned) {
      patch({ identitySavedAt: new Date().toISOString() });
      setBusy(false);
      return true;
    }
    const result = await invokeConnectSupplierOnboarding('accept_tos', {
      tos_accepted: true,
      agreement_version: STRIPE_RECIPIENT_AGREEMENT.version,
    });
    if (!result.success) {
      setBusy(false);
      if (isLiveAccountCreationGateError(result.error)) {
        setConnectSetupUnavailable(true);
        patch({ identitySavedAt: new Date().toISOString() });
        setNote(supplierFacingLiveCreateBlockReason(PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY));
        return true;
      }
      setError(connectOnboardingUserMessage(result.error));
      return false;
    }
    onProfile(await fetchSupplierProfile(userId));
    patch({ identitySavedAt: new Date().toISOString() });
    setNote(
      identityDocumentDue
        ? 'Agreement recorded. Complete the identity document step below before finishing.'
        : 'Agreement recorded. Additional identity checks may still be required.'
    );
    setBusy(false);
    return true;
  };

  const uploadIdentityDocument = async (file: File): Promise<void> => {
    if (!canEdit) {
      setError('Your role can view setup but cannot change it.');
      return;
    }
    const personId = draft.rep_person_id.trim();
    if (!personId) {
      setError('Save the representative first, then upload an identity document.');
      return;
    }
    if (!canProvisionConnect) {
      setError('Identity document upload needs a connected payout account.');
      return;
    }
    setBusy(true);
    setError(null);
    setIdentityUploadNote(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      const content_base64 = btoa(binary);
      const result = await invokeConnectSupplierOnboarding('upload_identity_document', {
        identity_upload: {
          person_id: personId,
          side: identityDocSide,
          filename: file.name,
          content_type: file.type || 'image/jpeg',
          content_base64,
        },
      });
      if (!result.success) {
        setError(connectOnboardingUserMessage(result.error));
        setBusy(false);
        return;
      }
      onProfile(await fetchSupplierProfile(userId));
      setIdentityUploadNote(
        `Document (${identityDocSide}) sent securely for verification. Traverion does not keep a copy.`
      );
    } catch {
      setError('Could not read that file. Try a JPEG, PNG, or PDF under 8 MB.');
    }
    setBusy(false);
  };

  const saveBankNative = async (): Promise<boolean> => {
    if (!canEdit) {
      setError('Your role can view setup but cannot change it.');
      return false;
    }
    // Draft-first LIVE: do not pretend an IBAN was saved — only mark deferred.
    if (!canProvisionConnect) {
      setConnectSetupUnavailable(true);
      setNote(supplierFacingLiveCreateBlockReason(PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY));
      setBankIban('');
      patch({
        bankDeferredAt: new Date().toISOString(),
        bankSavedAt: null,
        bankLast4: null,
      });
      return true;
    }
    const ensured = await ensureConnectWhenAllowed();
    if (!ensured.ok) {
      setError(connectOnboardingUserMessage(ensured.error));
      return false;
    }
    if (!ensured.provisioned) {
      setBankIban('');
      patch({
        bankDeferredAt: new Date().toISOString(),
        bankSavedAt: null,
        bankLast4: null,
      });
      return true;
    }
    if (bankManaged && !bankRequirementDue && !bankIban.trim()) {
      patch({
        bankSavedAt: new Date().toISOString(),
        bankDeferredAt: null,
      });
      return true;
    }
    if (!bankIban.trim() || !bankHolder.trim()) {
      setError('Enter the account holder name and IBAN.');
      return false;
    }
    if (!draft.tos_accepted) {
      setError('Accept the terms before the bank account is sent.');
      return false;
    }
    const ibanError = validateIban(
      bankIban,
      normalizeCountryCode(draft.address_country || profile?.address_country || '') || 'FI'
    );
    if (ibanError) {
      setError(ibanError);
      return false;
    }
    setBusy(true);
    setError(null);
    const last4 = bankIban.replace(/\s+/g, '').slice(-4);
    const tokenized = await createBankAccountToken({
      country: normalizeCountryCode(draft.address_country) || 'FI',
      currency,
      accountNumber: bankIban,
      accountHolderName: bankHolder,
      accountHolderType: draft.business_type === 'individual' ? 'individual' : 'company',
    });
    if ('error' in tokenized) {
      setBusy(false);
      setError(tokenized.error);
      return false;
    }
    const result = await invokeConnectSupplierOnboarding('attach_bank_token', {
      bank_token: tokenized.tokenId,
    });
    if (!result.success) {
      setBusy(false);
      if (isLiveAccountCreationGateError(result.error)) {
        setConnectSetupUnavailable(true);
        setNote(supplierFacingLiveCreateBlockReason(PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY));
        setBankIban('');
        patch({
          bankDeferredAt: new Date().toISOString(),
          bankSavedAt: null,
          bankLast4: null,
        });
        return true;
      }
      setError(connectOnboardingUserMessage(result.error));
      return false;
    }
    setBankMasked(`•••• ${last4}`);
    setBankIban('');
    onProfile(await fetchSupplierProfile(userId));
    patch({
      bankSavedAt: new Date().toISOString(),
      bankDeferredAt: null,
      bankLast4: last4 || null,
    });
    setBusy(false);
    return true;
  };

  const savePreferences = async (): Promise<boolean> => {
    const invalid = validatePayoutWizardPreferences(draft);
    if (invalid) {
      setError(invalid);
      return false;
    }
    if (!canEdit) {
      setError('Your role can view preferences but cannot change them.');
      return false;
    }
    const parsed = parsePayoutThreshold(draft.payout_threshold_min);
    if (!parsed.ok) {
      setError(parsed.error);
      return false;
    }
    setBusy(true);
    setError(null);
    const res = await updateSupplierPayout(userId, {
      payment_cycle: draft.payment_cycle as PayoutCyclePreference,
      payout_threshold_min: parsed.value,
    });
    if (!res.success) {
      setBusy(false);
      const message = userFacingError(res.error, USER_ERROR.generic);
      setError(message);
      partnerToast.error(message);
      return false;
    }
    onProfile(await fetchSupplierProfile(userId));
    patch({ preferencesSavedAt: new Date().toISOString() });
    setBusy(false);
    partnerToast.success('Payout settings saved');
    return true;
  };

  const refreshConnect = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const result = await invokeConnectSupplierOnboarding('refresh');
    setBusy(false);
    if (!result.success) {
      setError(connectOnboardingUserMessage(result.error));
      return false;
    }
    onProfile(await fetchSupplierProfile(userId));
    setNote('Status updated.');
    return true;
  };

  const onContinue = async () => {
    if (expressVerificationMandatory && expressLaunchFailed) {
      setError(
        'Verification could not be started. Use Continue verification to try again.'
      );
      return;
    }
    if (draft.step === 'business') {
      const ok = await saveBusiness();
      if (!ok) return;
      goTo('representative', 'forward');
      return;
    }
    if (draft.step === 'representative') {
      if (isExpress || customUsesEmbeddedVerification) {
        const ok = await refreshConnect();
        if (!ok) return;
        goTo('identity', 'forward');
        return;
      }
      const ok = await saveRepresentativeNative();
      if (!ok) return;
      goTo('identity', 'forward');
      return;
    }
    if (draft.step === 'identity') {
      if (isExpress || customUsesEmbeddedVerification) {
        const ok = await refreshConnect();
        if (!ok) return;
        goTo('bank', 'forward');
        return;
      }
      const ok = await saveIdentityNative();
      if (!ok) return;
      goTo('bank', 'forward');
      return;
    }
    if (draft.step === 'bank') {
      if (isExpress || customUsesEmbeddedVerification) {
        const ok = await refreshConnect();
        if (!ok) return;
        goTo('preferences', 'forward');
        return;
      }
      const ok = await saveBankNative();
      if (!ok) return;
      goTo('preferences', 'forward');
      return;
    }
    if (draft.step === 'preferences') {
      const ok = await savePreferences();
      if (!ok) return;
      if (embedded) {
        // Status lives in the unified shell — do not keep a nested review screen.
        onUnifiedPhaseChange?.('status');
        return;
      }
      goTo('review', 'forward');
      return;
    }
    if (draft.step === 'review') {
      setBusy(true);
      setError(null);
      setNote(null);
      const completedAt = new Date().toISOString();
      const completedDraft = { ...draft, wizardCompletedAt: completedAt };
      patch({ wizardCompletedAt: completedAt });
      savePayoutWizardDraft(userId, completedDraft);
      const saved = await persistServerDraft(completedDraft);
      if (!saved) {
        setBusy(false);
        setError('Could not save setup progress. Check your connection and try again.');
        return;
      }
      const provisionNow = canProvisionConnectAccount({
        hasConnectedAccount,
        platformEnvironment,
        liveCreateAllowed,
      });
      // When LIVE create is approved (or TEST / existing account), ensure Connect then sync.
      if (provisionNow) {
        const ensured = await ensureConnectWhenAllowed();
        if (!ensured.ok) {
          setBusy(false);
          setError(connectOnboardingUserMessage(ensured.error));
          return;
        }
        const needsHosted =
          ensured.provisioned &&
          (!hasConnectedAccount ||
            identityDocumentDue ||
            accountRestricted ||
            outstandingKeys.length > 0 ||
            !canReceive);
        if (needsHosted) {
          setHostedLinkBusy(true);
          const link = await fetchConnectAccountLink();
          setHostedLinkBusy(false);
          if (link.url) {
            window.location.assign(link.url);
            return;
          }
          // Fall through to completion with honest next-step copy if Account Link fails.
          setNote(
            connectOnboardingUserMessage(link.error) ||
              'Setup is saved. Open Continue verification when you are ready.'
          );
        }
      }
      await refreshConnect();
      onProfile(await fetchSupplierProfile(userId));
      setBusy(false);
      // Completion UI reads Stripe-mirrored profile + honest markers — never simulates Verified.
      if (embedded) {
        onUnifiedPhaseChange?.('status');
        return;
      }
      setPhase('complete');
      return;
    }
    onClose();
  };

  const returnToIncomePayouts = () => {
    onClose();
    navigateSupplierUrl(PAYOUT_WIZARD_RETURN_HREF);
  };

  const editSubmittedDetails = () => {
    goTo('review', 'back');
  };

  const verificationStatusLabel = connectOnboardingLabel(profile?.connect_onboarding_status, {
    connect_account_livemode: profile?.connect_account_livemode,
  });

  const localProgress = summarizePayoutWizardLocalProgress(draft);

  const verificationPresentation = payoutVerificationPresentation({
    connectLabel: verificationStatusLabel,
    hasConnectedAccount,
    localProgress,
  });

  const readinessLanes = buildPayoutReadinessLanes({
    localProgress,
    verificationStatus: profile?.verification_status,
    connectLabel: verificationStatusLabel,
    hasConnectedAccount,
    canReceiveTransfers: canReceive,
    connectLivemode: profile?.connect_account_livemode,
    connectSetupUnavailable,
    liveCreateAllowed,
    platformEnvironment,
  });

  const completionBankLabel = payoutBankPresentation({
    bankManaged,
    bankMasked,
    localProgress,
    connectSetupUnavailable,
    hasConnectedAccount,
  });

  const showConnectionPendingNote =
    connectSetupUnavailable ||
    (!hasConnectedAccount && platformEnvironment === 'live' && !liveCreateAllowed);

  const canLaunchHostedStripe =
    isExpress &&
    canProvisionConnect &&
    (hasConnectedAccount || liveCreateAllowed || platformEnvironment === 'test');

  /** Prefer in-app embedded Account Onboarding for Custom; hosted Account Link only as fallback / create path. */
  const launchHostedStripe = async () => {
    setError(null);
    if (customUsesEmbeddedVerification) {
      setHostedFallbackUrl(null);
      setShowStripeEmbed(true);
      if (displayStep !== 'representative' && displayStep !== 'identity' && displayStep !== 'bank') {
        goTo('identity', 'forward');
      }
      return;
    }
    setBusy(true);
    setHostedLinkBusy(true);
    try {
      const ensured = await ensureConnectWhenAllowed();
      if (!ensured.ok) {
        setError(connectOnboardingUserMessage(ensured.error));
        return;
      }
      if (!ensured.provisioned && !hasConnectedAccount) {
        setNote(supplierFacingLiveCreateBlockReason(liveCreateBlockedReason || PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY));
        return;
      }
      // Custom accounts stay on Traverion forms. Express may still need hosted verification.
      if (isCustom) return;
      if (isExpress) {
        setShowStripeEmbed(true);
        return;
      }
      const link = await fetchConnectAccountLink();
      if (!link.url) {
        setError(connectOnboardingUserMessage(link.error) || 'Could not open secure verification.');
        return;
      }
      window.location.assign(link.url);
    } finally {
      setBusy(false);
      setHostedLinkBusy(false);
    }
  };

  const onBack = () => {
    if (stepIndex <= 0) {
      if (embedded) onBackToPreviousPhase?.() ?? onClose();
      else onClose();
      return;
    }
    const prev = PAYOUT_WIZARD_SCREENS[stepIndex - 1]!.id;
    // P9.41: company details already live in the unified shell — don't reopen payout "business".
    if (embedded && prev === 'business') {
      onBackToPreviousPhase?.() ?? onClose();
      return;
    }
    goTo(prev, 'back');
  };

  const onEmbedExit = async () => {
    setShowStripeEmbed(false);
    await refreshConnect();
    setNote(
      'You can continue when ready. Verification is only complete when your information is confirmed.'
    );
  };

  const preferenceOptions = useMemo(
    () =>
      [
        {
          value: 'monthly' as const,
          label: PARTNER_PAYOUT_FREQUENCY_MONTHLY_LABEL,
          rate: rates.standardLabel,
          tip: PARTNER_PAYOUT_FREQUENCY_MONTHLY_DETAIL,
        },
        {
          value: 'biweekly' as const,
          label: PARTNER_PAYOUT_FREQUENCY_TWICE_MONTHLY_LABEL,
          rate: rates.twiceMonthlyLabel,
          tip: PARTNER_PAYOUT_FREQUENCY_TWICE_MONTHLY_DETAIL,
        },
      ] as const,
    [rates.standardLabel, rates.twiceMonthlyLabel]
  );

  const continueLabel =
    draft.step === 'review'
      ? canLaunchHostedStripe && !hasConnectedAccount
        ? busy
          ? 'Connecting…'
          : 'Connect payouts'
        : canLaunchHostedStripe && (identityDocumentDue || accountRestricted || outstandingKeys.length > 0)
          ? busy
            ? 'Opening verification…'
            : 'Continue verification'
          : busy
            ? 'Saving…'
            : 'Save & finish'
      : busy
        ? 'Saving…'
        : 'Continue';

  const stageClass = [
    'payout-wizard__stage',
    direction === 'back' ? 'stay-stage-back' : 'stay-stage-forward',
  ].join(' ');

  const railItems = PAYOUT_WIZARD_SCREENS.map((s, i) => {
    let state: 'complete' | 'current' | 'upcoming' | 'locked' = 'upcoming';
    if (i < stepIndex) state = 'complete';
    else if (i === stepIndex) state = 'current';
    else if (i > stepIndex + 1) state = 'locked';
    return { id: s.id, label: s.title, state };
  });

  const selectRailStep = (index: number) => {
    if (index > stepIndex + 1) return;
    if (index > stepIndex) return;
    goTo(PAYOUT_WIZARD_SCREENS[index]!.id, index < stepIndex ? 'back' : 'forward');
  };

  const reviewIdentityLabel = () => {
    // Never present TEST suppliers as LIVE Verified.
    if (profile?.connect_account_livemode === false || platformEnvironment === 'test') {
      if (identityDocumentDue || accountRestricted) return 'Action required (TEST)';
      if (draft.identitySavedAt || profile?.connect_details_submitted) return 'Submitted (TEST)';
      return 'Incomplete';
    }
    if (canReceive && profile?.connect_account_livemode === true) return 'Verified';
    if (identityDocumentDue || accountRestricted) return 'Action required';
    // Draft-first LIVE (no connected account yet) — do not imply Stripe is reviewing.
    if (connectSetupUnavailable && !hasConnectedAccount) {
      return draft.identitySavedAt ? 'Saved to your account' : 'Incomplete';
    }
    if (draft.identitySavedAt || profile?.connect_details_submitted) {
      return 'Under review';
    }
    return 'Incomplete';
  };

  const reviewRepLabel = () => {
    if (draft.representativeSavedAt) {
      const ownerCount = (draft.rep_is_owner ? 1 : 0) + draft.beneficial_owners.length;
      return ownerCount > 0 ? `Saved · ${ownerCount} owner${ownerCount === 1 ? '' : 's'}` : 'Saved';
    }
    if (profile?.connect_details_submitted || canReceive) return 'Saved';
    return isExpress ? 'In progress' : 'Needed';
  };

  if (phase === 'complete') {
    return (
      <div className="payout-wizard payout-wizard--complete fixed inset-0 z-[80] flex flex-col bg-white">
        <header className="payout-wizard__complete-chrome flex shrink-0 items-center justify-between gap-3 border-b border-[#e8ebf0] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8">
          <button
            type="button"
            className="lux-flat min-h-10 text-[13px] font-semibold text-[#5c6570] hover:text-[#17191d]"
            onClick={returnToIncomePayouts}
          >
            ← Income &amp; Payouts
          </button>
          <p className="text-[13px] font-semibold tracking-tight text-[#17191d]">Payout setup</p>
          <span className="min-w-16" aria-hidden="true" />
        </header>
        <div className="payout-wizard__complete" ref={scrollRef}>
          <div className="payout-wizard__complete-card">
            <div className="payout-wizard__complete-hero">
              <p className="payout-wizard__complete-kicker">Saved to your account</p>
              <h1 className="payout-wizard__complete-title">
                {showConnectionPendingNote
                  ? 'Setup saved'
                  : canLaunchHostedStripe && !canReceive
                    ? 'Continue verification'
                    : 'You’re ready for the next step'}
              </h1>
              <p className="payout-wizard__complete-lede">{readinessLanes.nextStep}</p>
            </div>

            <dl className="payout-wizard__status-grid" aria-label="Setup status">
              <div className="payout-wizard__status-row">
                <dt>Form progress</dt>
                <dd>
                  <span className="payout-wizard__status-pill payout-wizard__status-pill--saved">
                    {readinessLanes.formProgress}
                  </span>
                </dd>
              </div>
              <div className="payout-wizard__status-row">
                <dt>Traverion business</dt>
                <dd>
                  <span
                    className={[
                      'payout-wizard__status-pill',
                      readinessLanes.businessVerification === 'Approved'
                        ? 'payout-wizard__status-pill--ok'
                        : 'payout-wizard__status-pill--pending',
                    ].join(' ')}
                  >
                    {readinessLanes.businessVerification}
                  </span>
                </dd>
              </div>
              <div className="payout-wizard__status-row">
                <dt>Payout verification</dt>
                <dd>
                  <span
                    className={[
                      'payout-wizard__status-pill',
                      readinessLanes.stripeVerification === 'Verified'
                        ? 'payout-wizard__status-pill--ok'
                        : 'payout-wizard__status-pill--pending',
                    ].join(' ')}
                  >
                    {readinessLanes.stripeVerification}
                  </span>
                </dd>
              </div>
              <div className="payout-wizard__status-row">
                <dt>Payout readiness</dt>
                <dd>
                  <span className="payout-wizard__status-pill payout-wizard__status-pill--pending">
                    {readinessLanes.payoutReadiness}
                  </span>
                </dd>
              </div>
              <div className="payout-wizard__status-row">
                <dt>Bank account</dt>
                <dd>
                  <span
                    className={[
                      'payout-wizard__status-pill',
                      bankManaged || bankMasked
                        ? 'payout-wizard__status-pill--ok'
                        : 'payout-wizard__status-pill--pending',
                    ].join(' ')}
                  >
                    {completionBankLabel}
                  </span>
                </dd>
              </div>
            </dl>

            <p className="payout-wizard__complete-note" role="status">
              {showConnectionPendingNote
                ? 'Bank details stay on Traverion until payout connection opens for your account.'
                : 'Statuses update only from Traverion business review and payment-provider confirmation — never from finishing this form alone.'}
            </p>

            <div className="payout-wizard__complete-actions">
              {canLaunchHostedStripe && (!canReceive || identityDocumentDue || accountRestricted) ? (
                <button
                  type="button"
                  className="tv-btn-primary payout-wizard__complete-primary h-11 w-full px-4 text-[13px]"
                  disabled={busy || hostedLinkBusy || !canEdit}
                  onClick={() => void launchHostedStripe()}
                >
                  {hostedLinkBusy
                    ? 'Opening verification…'
                    : hasConnectedAccount
                      ? 'Continue verification'
                      : 'Connect payouts'}
                </button>
              ) : (
                <button
                  type="button"
                  className="tv-btn-primary payout-wizard__complete-primary h-11 w-full px-4 text-[13px]"
                  onClick={returnToIncomePayouts}
                >
                  Return to Income &amp; Payouts
                </button>
              )}
              <button
                type="button"
                className="lux-flat payout-wizard__complete-secondary min-h-10 text-[13px] font-semibold text-[#073b83] hover:text-[#052d65]"
                onClick={editSubmittedDetails}
              >
                Edit details
              </button>
              {canLaunchHostedStripe && (!canReceive || identityDocumentDue || accountRestricted) ? (
                <button
                  type="button"
                  className="lux-flat payout-wizard__complete-secondary min-h-10 text-[13px] font-semibold text-[#5c6570]"
                  onClick={returnToIncomePayouts}
                >
                  Return to Income &amp; Payouts
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? 'partner-setup-embed payout-wizard listing-creation-workspace stay-creator flex h-full min-h-0 w-full flex-1 flex-col bg-transparent'
          : 'payout-wizard listing-creation-workspace stay-creator fixed inset-0 z-[80] flex flex-col bg-white'
      }
    >
      <div className={embedded ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'payout-wizard__body'}>
      {!embedded ? (
      <aside className="payout-wizard__rail listing-creation-rail">
        <div className="payout-wizard__rail-head">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="lux-flat inline-flex min-h-10 items-center text-[13px] font-semibold text-[#71717a] hover:text-[#18181b] disabled:opacity-50"
          >
            ← Exit
          </button>
          <p className="mt-7 font-display text-[1.4rem] font-bold leading-[1.12] tracking-tight text-[#18181b]">
            Set up payouts
          </p>
          <div className="mt-2.5 min-h-5">
            {persistLabel ? (
              <p className="text-[11.5px] tabular-nums text-[#71717a]" aria-live="polite">
                {persistLabel}
              </p>
            ) : null}
          </div>
          <p className="mt-1 text-[11.5px] font-semibold tabular-nums tracking-wide text-[#71717a]">
            Step {stepIndex + 1} of {PAYOUT_WIZARD_SCREENS.length}
          </p>
          <div
            className="listing-creation-rail-progress mt-3"
            role="progressbar"
            aria-label="Payout setup progress"
            aria-valuemin={0}
            aria-valuemax={PAYOUT_WIZARD_SCREENS.length}
            aria-valuenow={stepIndex + 1}
          >
            <div
              className="listing-creation-rail-progress__fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <nav aria-label="Payout setup steps" className="payout-wizard__rail-nav">
          <ol className="space-y-1">
            {railItems.map((item, index) => {
              const current = item.state === 'current';
              const complete = item.state === 'complete';
              const locked = item.state === 'locked';
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => selectRailStep(index)}
                    aria-current={current ? 'step' : undefined}
                    aria-disabled={locked || undefined}
                    className={[
                      'lux-flat payout-wizard__rail-step',
                      complete ? 'payout-wizard__rail-step--complete' : '',
                      !current && !complete && !locked
                        ? 'font-medium text-[#71717a] hover:bg-[#eef1f5]'
                        : '',
                      complete && !current ? 'font-medium text-[#18181b] hover:bg-[#eef1f5]' : '',
                      locked ? 'cursor-default font-medium text-[#a1a1aa]' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="payout-wizard__rail-dot">{complete ? '✓' : index + 1}</span>
                    <span className="min-w-0 truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>
      ) : null}

      <div className={embedded ? 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'payout-wizard__panel'}>
        {!embedded ? (
        <header className="payout-wizard__mobile-bar flex items-center justify-between gap-3">
          <button
            type="button"
            className="min-h-11 text-sm font-semibold text-[#18181b]"
            onClick={onClose}
            disabled={busy}
          >
            Save &amp; exit
          </button>
          <p className="truncate text-sm font-semibold text-[#18181b]">Set up payouts</p>
          <p className="min-w-16 text-right text-xs text-[#71717a]" aria-live="polite">
            {persistLabel ?? `${stepIndex + 1}/${PAYOUT_WIZARD_SCREENS.length}`}
          </p>
        </header>
        ) : null}

        {!embedded ? (
        <div className="payout-wizard__mobile-bar lg:hidden" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div
            className="h-[3px] overflow-hidden rounded-full bg-[#e5e7eb]"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={PAYOUT_WIZARD_SCREENS.length}
            aria-valuenow={stepIndex + 1}
            aria-label={`Step ${stepIndex + 1} of ${PAYOUT_WIZARD_SCREENS.length}`}
          >
            <span
              className="block h-full rounded-full bg-[#073b83] transition-[width] duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83]">
            Step {stepIndex + 1} of {PAYOUT_WIZARD_SCREENS.length}
          </p>
        </div>
        ) : null}

        <main ref={scrollRef} className={embedded ? 'partner-unified-setup-main min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 sm:px-8 lg:px-10 [-webkit-overflow-scrolling:touch]' : 'payout-wizard__scroll'}>
          <div className={embedded ? 'partner-unified-setup-canvas mx-auto w-full' : 'payout-wizard__canvas'}>
            <div key={draft.step} className={embedded ? 'partner-unified-setup-stage' : stageClass}>
              {!embedded ? (
              <p className="mb-1 hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83] lg:block">
                Step {stepIndex + 1} of {PAYOUT_WIZARD_SCREENS.length}
              </p>
              ) : null}
              <h1 className="payout-wizard__title inline-flex flex-wrap items-center gap-1.5">
                {screen.title}
                {draft.step === 'representative' ? (
                  <PartnerHelpTip label="About representative">{PARTNER_HELP.representative}</PartnerHelpTip>
                ) : null}
                {draft.step === 'identity' ? (
                  <PartnerHelpTip label="About identity">{PARTNER_HELP.identityCheck}</PartnerHelpTip>
                ) : null}
                {draft.step === 'bank' ? (
                  <PartnerHelpTip label="About bank account">{PARTNER_HELP.bankAccount}</PartnerHelpTip>
                ) : null}
                {draft.step === 'preferences' ? (
                  <PartnerHelpTip label="About preferences">{PARTNER_HELP.payoutSchedule}</PartnerHelpTip>
                ) : null}
              </h1>
              <p className="payout-wizard__lede">{screen.lede}</p>

              {/* P9.42: show LIVE gate notice once per flow (representative), not on every step. */}
              {connectSetupUnavailable &&
              !hasConnectedAccount &&
              (!embedded || draft.step === 'representative') ? (
                <p
                  className="mt-3 inline-flex max-w-xl items-start gap-1.5 border-l-2 border-[#073b83] pl-3 text-[13px] leading-snug text-[#1e3a5f]"
                  role="status"
                >
                  <span>
                    {embedded
                      ? PAYOUT_LIVE_SETUP_UNAVAILABLE_SHORT
                      : PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY}
                  </span>
                  {embedded ? (
                    <PartnerHelpTip label="About payout connection">
                      {PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY}
                    </PartnerHelpTip>
                  ) : null}
                </p>
              ) : null}
              {error ? (
                <p className="mt-3 text-[13px] font-medium text-[#9f1239]" role="alert">
                  {error}
                </p>
              ) : null}
              {note &&
              !(connectSetupUnavailable && note === PAYOUT_LIVE_SETUP_UNAVAILABLE_COPY) ? (
                <p className="mt-3 text-[12px] text-[#5c6570]" role="status">
                  {note}
                </p>
              ) : null}

              {draft.step === 'business' ? (
                <div className="mt-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-xl text-[13px] leading-snug text-[#5c6570]">
                      {PARTNER_HELP.payoutBusinessSummary}
                    </p>
                    {canEdit ? (
                      <button
                        type="button"
                        className="tv-btn-secondary h-10 shrink-0 px-3 text-[13px]"
                        onClick={openBusinessAmendment}
                      >
                        Edit business details
                      </button>
                    ) : null}
                  </div>
                  {validatePayoutBusinessFromProfile(profile) ? (
                    <p
                      className="border-l-2 border-amber-400 bg-amber-50/60 px-3 py-2 text-[13px] leading-snug text-amber-950"
                      role="status"
                    >
                      Business details are incomplete. Use Edit business details to finish them, then return
                      here.
                    </p>
                  ) : null}
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        label: 'Legal company name',
                        value: profile?.company_legal_name?.trim() || '—',
                        help: PARTNER_HELP.legalName,
                      },
                      {
                        label: 'Country',
                        value: (profile?.address_country ?? '').trim().toUpperCase() || '—',
                      },
                      {
                        label: 'Registration number',
                        value: profile?.company_registration_number?.trim() || '—',
                        help: PARTNER_HELP.registrationNumber,
                      },
                      {
                        label: 'VAT ID',
                        value: profile?.vat_id?.trim() || '—',
                        help: PARTNER_HELP.vatId,
                      },
                      {
                        label: 'Registered address',
                        value: formatPayoutBusinessAddress(profile) || '—',
                        help: PARTNER_HELP.registeredAddress,
                        wide: true,
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className={row.wide ? 'sm:col-span-2' : undefined}
                      >
                        <dt className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                          {row.label}
                          {row.help ? (
                            <PartnerHelpTip label={`About ${row.label}`}>{row.help}</PartnerHelpTip>
                          ) : null}
                        </dt>
                        <dd className="mt-1 text-[14px] font-medium leading-snug text-[#18181b]">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {businessLocked ? (
                    <p className="border-l-2 border-[#073b83]/40 pl-3 text-[13px] leading-snug text-[#5c6570]">
                      Approved business records stay unchanged here. Use Edit business details for the
                      controlled amendment flow.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {draft.step === 'representative' && !isExpress && !customUsesEmbeddedVerification ? (
                <form
                  className="po-form po-identity grid gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onContinue();
                  }}
                >
                  <p className="text-[13px] leading-snug text-[#5c6570]">
                    The verified company record stays as entered. This step adds the person who acts for it.
                  </p>
                  <div className="partner-onboarding-grid mt-1">
                    <label className="block" data-field="rep_first_name">
                      <FieldLabel>First name</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.rep_first_name}
                        onChange={(e) => {
                          patch({ rep_first_name: e.target.value });
                          setFieldErrors((f) => ({ ...f, rep_first_name: undefined }));
                        }}
                        autoComplete="given-name"
                        aria-invalid={Boolean(fieldErrors.rep_first_name) || undefined}
                        required
                      />
                      <FieldError message={fieldErrors.rep_first_name} />
                    </label>
                    <label className="block" data-field="rep_last_name">
                      <FieldLabel>Last name</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.rep_last_name}
                        onChange={(e) => {
                          patch({ rep_last_name: e.target.value });
                          setFieldErrors((f) => ({ ...f, rep_last_name: undefined }));
                        }}
                        autoComplete="family-name"
                        aria-invalid={Boolean(fieldErrors.rep_last_name) || undefined}
                        required
                      />
                      <FieldError message={fieldErrors.rep_last_name} />
                    </label>
                    <div className="block" data-field="rep_dob">
                      <FieldLabel help="Required for identity checks.">Date of birth</FieldLabel>
                      <DateOfBirthPicker
                        value={draft.rep_dob}
                        disabled={!canEdit}
                        required
                        aria-invalid={Boolean(fieldErrors.rep_dob)}
                        onChange={(iso) => {
                          patch({ rep_dob: iso });
                          setFieldErrors((f) => ({ ...f, rep_dob: undefined }));
                        }}
                      />
                      <FieldError message={fieldErrors.rep_dob} />
                    </div>
                    <label className="block">
                      <FieldLabel optional>Title / role</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.rep_title}
                        onChange={(e) => patch({ rep_title: e.target.value })}
                        placeholder="Managing director"
                      />
                    </label>
                    <label className="block">
                      <FieldLabel optional>Email</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        type="email"
                        value={draft.rep_email}
                        onChange={(e) => patch({ rep_email: e.target.value })}
                        autoComplete="email"
                      />
                    </label>
                    <label className="block">
                      <FieldLabel optional>Phone</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.rep_phone}
                        onChange={(e) => patch({ rep_phone: e.target.value })}
                        autoComplete="tel"
                      />
                    </label>
                  </div>
                  <div className="po-roles" role="group" aria-label="Role in the business">
                    {profile?.business_type !== 'individual' ? (
                      <label className="po-choice">
                        <input
                          type="checkbox"
                          checked={draft.rep_is_director}
                          onChange={(e) => patch({ rep_is_director: e.target.checked })}
                        />
                        <span>
                          Director
                          <PartnerHelpTip label="About directors">
                            Finnish companies need at least one director on the payout account. The name
                            and date of birth are sent for verification. Traverion does not keep a copy of
                            an identity document.
                          </PartnerHelpTip>
                        </span>
                      </label>
                    ) : null}
                    <label className="po-choice">
                      <input
                        type="checkbox"
                        checked={draft.rep_is_owner}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          patch({
                            rep_is_owner: checked,
                            rep_percent_ownership: checked ? draft.rep_percent_ownership : '',
                          });
                          setFieldErrors((f) => ({
                            ...f,
                            rep_percent_ownership: undefined,
                            beneficial_owners: undefined,
                          }));
                        }}
                      />
                      <span>
                        Owner
                        <PartnerHelpTip label="About ownership">
                          Tick this only when this person owns shares. A director can act for the company
                          without being an owner.
                        </PartnerHelpTip>
                      </span>
                    </label>
                  </div>
                  <label className="po-choice po-consent">
                    <input
                      type="checkbox"
                      checked={draft.verification_consent}
                      onChange={(e) => patch({ verification_consent: e.target.checked })}
                    />
                    <span>
                      Send for verification
                      <PartnerHelpTip label="About sending these details">
                        Traverion sends the verified company record and this person’s name and date of
                        birth. The date of birth is not stored in Traverion.
                      </PartnerHelpTip>
                    </span>
                  </label>
                    {draft.rep_is_owner ? (
                      <div className="mt-3" data-field="rep_percent_ownership">
                        <FieldLabel>Ownership %</FieldLabel>
                        <OwnershipPercentInput
                          value={draft.rep_percent_ownership}
                          disabled={!canEdit || busy}
                          onChange={(next) => {
                            patch({ rep_percent_ownership: next });
                            const err = validateOwnershipPercent(next, { required: true });
                            setFieldErrors((f) => ({
                              ...f,
                              rep_percent_ownership: err ?? undefined,
                              beneficial_owners: undefined,
                            }));
                          }}
                        />
                        <FieldError message={fieldErrors.rep_percent_ownership} />
                      </div>
                    ) : null}

                  <div className="border-t border-[#E8EAED] pt-4" data-field="beneficial_owners">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#18181b]">
                        Additional owners
                        <PartnerHelpTip label="About beneficial owners">
                          {PARTNER_HELP.beneficialOwners}
                        </PartnerHelpTip>
                      </h2>
                      {canEdit ? (
                        <button
                          type="button"
                          className="tv-btn-secondary h-9 px-3 text-[12px]"
                          disabled={busy}
                          onClick={() => {
                            patch({
                              beneficial_owners: [
                                ...draft.beneficial_owners,
                                emptyBeneficialOwner(),
                              ],
                            });
                            setFieldErrors((f) => ({ ...f, beneficial_owners: undefined }));
                          }}
                        >
                          Add owner
                        </button>
                      ) : null}
                    </div>
                    {draft.beneficial_owners.length === 0 ? (
                      <p className="mt-3 text-[13px] text-[#71717a]">No additional owners added.</p>
                    ) : (
                      <ul className="mt-3 space-y-4">
                        {draft.beneficial_owners.map((owner, index) => (
                          <li
                            key={owner.id}
                            className="space-y-3 rounded-xl border border-[#eef1f4] bg-[#fafbfc] p-3.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[12px] font-semibold text-[#5c6570]">
                                Owner {index + 1}
                              </p>
                              <button
                                type="button"
                                className="text-[12px] font-semibold text-[#9f1239] disabled:opacity-50"
                                disabled={!canEdit || busy}
                                onClick={() => {
                                  patch({
                                    beneficial_owners: draft.beneficial_owners.filter(
                                      (o) => o.id !== owner.id
                                    ),
                                  });
                                  setFieldErrors((f) => ({ ...f, beneficial_owners: undefined }));
                                }}
                              >
                                Remove
                              </button>
                            </div>
                            <div className="partner-onboarding-grid">
                              <label className="block">
                                <FieldLabel>First name</FieldLabel>
                                <input
                                  className="tv-input h-11 w-full"
                                  value={owner.first_name}
                                  disabled={!canEdit || busy}
                                  onChange={(e) => {
                                    const next = draft.beneficial_owners.map((o) =>
                                      o.id === owner.id ? { ...o, first_name: e.target.value } : o
                                    );
                                    patch({ beneficial_owners: next });
                                  }}
                                />
                              </label>
                              <label className="block">
                                <FieldLabel>Last name</FieldLabel>
                                <input
                                  className="tv-input h-11 w-full"
                                  value={owner.last_name}
                                  disabled={!canEdit || busy}
                                  onChange={(e) => {
                                    const next = draft.beneficial_owners.map((o) =>
                                      o.id === owner.id ? { ...o, last_name: e.target.value } : o
                                    );
                                    patch({ beneficial_owners: next });
                                  }}
                                />
                              </label>
                              <div className="block">
                                <FieldLabel>Date of birth</FieldLabel>
                                <DateOfBirthPicker
                                  value={owner.dob}
                                  disabled={!canEdit || busy}
                                  onChange={(iso) => {
                                    const next = draft.beneficial_owners.map((o) =>
                                      o.id === owner.id ? { ...o, dob: iso } : o
                                    );
                                    patch({ beneficial_owners: next });
                                  }}
                                />
                              </div>
                              <div className="block">
                                <FieldLabel>Ownership %</FieldLabel>
                                <OwnershipPercentInput
                                  value={owner.percent_ownership}
                                  disabled={!canEdit || busy}
                                  onChange={(pct) => {
                                    const next = draft.beneficial_owners.map((o) =>
                                      o.id === owner.id ? { ...o, percent_ownership: pct } : o
                                    );
                                    patch({ beneficial_owners: next });
                                  }}
                                />
                              </div>
                              <label className="block partner-onboarding-span-2">
                                <FieldLabel optional>Email</FieldLabel>
                                <input
                                  className="tv-input h-11 w-full"
                                  type="email"
                                  value={owner.email}
                                  disabled={!canEdit || busy}
                                  onChange={(e) => {
                                    const next = draft.beneficial_owners.map((o) =>
                                      o.id === owner.id ? { ...o, email: e.target.value } : o
                                    );
                                    patch({ beneficial_owners: next });
                                  }}
                                />
                              </label>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(() => {
                      const total = sumDeclaredOwnershipPercent(draft);
                      if (total == null && !draft.rep_is_owner && draft.beneficial_owners.length === 0) {
                        return null;
                      }
                      return (
                        <p className="mt-3 text-[12px] text-[#52525b]">
                          Declared ownership total:{' '}
                          <span className="font-semibold text-[#18181b]">
                            {total == null ? '—' : `${total}%`}
                          </span>
                        </p>
                      );
                    })()}
                    <FieldError message={fieldErrors.beneficial_owners} />
                  </div>
                </form>
              ) : null}

              {draft.step === 'identity' && !isExpress && !customUsesEmbeddedVerification ? (
                <div className="mt-4 space-y-4">
                  {outstandingLabels.length > 0 ? (
                    <div className="rounded-[10px] border border-[#dbe4f0] bg-[#f0f4fa] px-3 py-3 text-[12px] leading-relaxed text-[#1e3a5f]">
                      <p className="font-semibold text-[#073b83]">Still needed</p>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {outstandingLabels.slice(0, 6).map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className="text-[13px] leading-relaxed text-[#52525b]">{PAYOUT_WIZARD_TOS_COPY}</p>
                  <p className="text-[13px] leading-relaxed text-[#18181b]">
                    <a
                      className="font-semibold text-[#073b83] underline"
                      href={STRIPE_RECIPIENT_AGREEMENT.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Stripe Recipient Agreement
                    </a>
                    {' · '}
                    <a
                      className="font-semibold text-[#073b83] underline"
                      href={STRIPE_RECIPIENT_AGREEMENT.privacyUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Stripe Privacy Policy
                    </a>
                  </p>
                  {outstandingKeys.some((key) => /terms_of_service|tos_acceptance|agreement/i.test(key)) ? (
                    <p className="text-[12px] leading-relaxed text-amber-950">
                      Please accept the current agreement again to continue.
                    </p>
                  ) : null}
                  <label className="flex items-start gap-2.5 text-[13px] text-[#18181b]">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={draft.tos_accepted}
                      onChange={(e) => patch({ tos_accepted: e.target.checked })}
                    />
                    <span>
                      I agree to the Stripe Recipient Agreement and authorize Traverion to share my business
                      and payout information with Stripe.
                    </span>
                  </label>
                  {identityDocumentDue ? (
                    <div className="space-y-3 rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-3">
                      <p className="text-[13px] font-semibold text-[#18181b]">Identity document</p>
                      <p className="text-[12px] leading-relaxed text-[#52525b]">
                        Stripe asked for an identity document. The file goes straight to Stripe. Traverion
                        does not keep a copy.
                      </p>
                      {draft.rep_person_id && canProvisionConnect ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {(['front', 'back'] as const).map((side) => (
                              <button
                                key={side}
                                type="button"
                                className={[
                                  'h-9 rounded-md px-3 text-[12px] font-semibold',
                                  identityDocSide === side
                                    ? 'bg-[#073b83] text-white'
                                    : 'bg-white text-[#18181b] ring-1 ring-[#e5e7eb]',
                                ].join(' ')}
                                onClick={() => setIdentityDocSide(side)}
                              >
                                {side === 'front' ? 'Front' : 'Back'}
                              </button>
                            ))}
                          </div>
                          <label className="block">
                            <span className="sr-only">Upload identity document</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,application/pdf"
                              className="block w-full text-[12px] text-[#52525b] file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-[#073b83] file:px-3 file:text-[12px] file:font-semibold file:text-white"
                              disabled={!canEdit || busy}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) void uploadIdentityDocument(file);
                              }}
                            />
                          </label>
                          {identityUploadNote ? (
                            <p className="text-[12px] text-emerald-800" role="status">
                              {identityUploadNote}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-[12px] leading-relaxed text-[#52525b]">
                          Save the representative first so the document can be attached to the right person.
                        </p>
                      )}
                    </div>
                  ) : null}
                  {providerControlledDue ? (
                    <div className="space-y-3 rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-3">
                      <p className="text-[13px] font-semibold text-[#18181b]">Stripe must finish this check</p>
                      <p className="text-[12px] leading-relaxed text-[#52525b]">
                        This item is a liveness or risk check. Traverion cannot complete it in the form.
                        The secure step opens only for that check.
                      </p>
                      {!showIdentityRemediation ? (
                        <button
                          type="button"
                          className="tv-btn-primary h-10 px-3 text-[13px]"
                          onClick={() => setShowIdentityRemediation(true)}
                        >
                          Continue this check
                        </button>
                      ) : (
                        <Suspense
                          fallback={<p className="text-[12px] text-[#71717a]">Loading verification…</p>}
                        >
                          <ConnectEmbeddedPanel
                            component="account_onboarding"
                            expectStripeAuth={false}
                            onExit={() => {
                              setShowIdentityRemediation(false);
                              void refreshConnect();
                            }}
                            onHostedFallback={(url) => {
                              setHostedFallbackUrl(url);
                              setShowIdentityRemediation(false);
                            }}
                            onError={(msg) => {
                              setShowIdentityRemediation(false);
                              setError(connectOnboardingUserMessage(msg));
                            }}
                          />
                        </Suspense>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {draft.step === 'bank' && !isExpress && !customUsesEmbeddedVerification ? (
                <form
                  className="po-form grid gap-3 sm:gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onContinue();
                  }}
                >
                  {(bankManaged || bankMasked) && (
                    <p className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-950">
                      Bank on file{bankMasked ? `: ${bankMasked}` : ''}. Enter a new IBAN only to replace it.
                    </p>
                  )}
                  <div className="partner-onboarding-grid">
                    <label className="block">
                      <FieldLabel>Account holder</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        value={bankHolder}
                        onChange={(e) => setBankHolder(e.target.value)}
                        autoComplete="name"
                      />
                    </label>
                    <label className="block">
                      <FieldLabel help="Checked on this device, then sent as a secure token. Traverion does not keep the full number.">
                        IBAN
                      </FieldLabel>
                      <input
                        className="tv-input h-11 w-full font-mono text-[13px]"
                        value={bankIban}
                        onChange={(e) => setBankIban(e.target.value)}
                        autoComplete="off"
                        placeholder="FI00 0000 0000 0000 00"
                        spellCheck={false}
                      />
                    </label>
                  </div>
                  <label className="po-choice">
                    <input
                      type="checkbox"
                      checked={draft.tos_accepted}
                      onChange={(e) => patch({ tos_accepted: e.target.checked })}
                    />
                    <span>
                      Accept the terms
                      <PartnerHelpTip label="About the terms">
                        This records acceptance of the recipient terms and confirms the bank account can be
                        tokenized. Traverion does not keep the IBAN.
                      </PartnerHelpTip>
                    </span>
                  </label>
                </form>
              ) : null}

              {useStripeEmbed ? (
                <div className="mt-4 space-y-3">
                  {customUsesEmbeddedVerification ? (
                    <p className="text-[13px] leading-relaxed text-[#5c6570]">
                      Complete identity and bank details below. Information already on your Traverion
                      account is reused where Stripe allows — documents and bank numbers stay in
                      Stripe’s secure component.
                    </p>
                  ) : null}
                  {expressVerificationMandatory && !showStripeEmbed && !hostedFallbackUrl ? (
                    <div className="rounded-[10px] border border-[#dbe4f0] bg-[#f0f4fa] px-3 py-3 text-[12px] leading-relaxed text-[#1e3a5f]">
                      <p className="font-semibold text-[#073b83]">Verification needed</p>
                      <p className="mt-1">{PAYOUT_WIZARD_STRIPE_AUTH_COPY}</p>
                      {outstandingLabels.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-[#1e3a5f]">
                          {outstandingLabels.slice(0, 6).map((label) => (
                            <li key={label}>{label}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-[12px] text-[#1e3a5f]">
                          Identity or bank confirmation is still needed.
                        </p>
                      )}
                      <button
                        type="button"
                        className="tv-btn-primary mt-3 h-10 w-full text-[13px]"
                        onClick={() => {
                          setError(null);
                          setExpressLaunchFailed(false);
                          patch({ stripeAuthAcknowledged: true });
                          setShowStripeEmbed(true);
                        }}
                      >
                        Continue verification
                      </button>
                    </div>
                  ) : null}

                  {!expressVerificationMandatory &&
                  !customVerificationMandatory &&
                  !showStripeEmbed ? (
                    <div className="rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-3 text-[12px] leading-relaxed text-[#52525b]">
                      <p className="font-semibold text-[#18181b]">Already set up</p>
                      <p className="mt-1">
                        Continue setup as usual. Open verification only if you need to update identity or bank
                        details.
                      </p>
                      <button
                        type="button"
                        className="tv-btn-secondary mt-3 h-10 w-full text-[13px]"
                        onClick={() => {
                          setError(null);
                          setExpressLaunchFailed(false);
                          patch({ stripeAuthAcknowledged: true });
                          setShowStripeEmbed(true);
                        }}
                      >
                        Continue verification
                      </button>
                    </div>
                  ) : null}

                  {showStripeEmbed ? (
                    <Suspense
                      fallback={
                        <p className="text-[13px] text-[#52525b]" role="status">
                          Loading secure step…
                        </p>
                      }
                    >
                      <ConnectEmbeddedPanel
                        component="account_onboarding"
                        expectStripeAuth={isExpress}
                        onExit={() => void onEmbedExit()}
                        onHostedFallback={(url) => {
                          setHostedFallbackUrl(url);
                          setShowStripeEmbed(false);
                          setExpressLaunchFailed(false);
                        }}
                        onError={(msg) => {
                          // Single wizard alert — unmount embed so Continue verification returns for retry.
                          setExpressLaunchFailed(true);
                          setShowStripeEmbed(false);
                          setError(connectOnboardingUserMessage(msg));
                        }}
                      />
                    </Suspense>
                  ) : null}

                  {hostedFallbackUrl ? (
                    <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] text-amber-950">
                      <p className="font-semibold">Continue securely</p>
                      <p className="mt-1">
                        A secure page is required for this step. You’ll return here afterward.
                      </p>
                      <button
                        type="button"
                        className="tv-btn-primary mt-2 h-10 px-3 text-[13px]"
                        onClick={() => window.location.assign(hostedFallbackUrl)}
                      >
                        Open secure step
                      </button>
                    </div>
                  ) : null}

                  {draft.step === 'bank' && bankManaged ? (
                    <p className="text-[12px] text-[#52525b]">
                      A bank destination is already on file. You can review or replace it above.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {draft.step === 'preferences' ? (
                <div className="mt-4 space-y-3">
                  <fieldset disabled={!canEdit || busy}>
                    <legend className="sr-only">Payout frequency</legend>
                    <div className="grid gap-2" role="radiogroup" aria-label="Payout frequency">
                      {preferenceOptions.map((option) => (
                        <label
                          key={option.value}
                          className="tv-income-pref-card"
                          data-selected={draft.payment_cycle === option.value ? 'true' : 'false'}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name="payout-wizard-frequency"
                            value={option.value}
                            checked={draft.payment_cycle === option.value}
                            onChange={() => patch({ payment_cycle: option.value })}
                          />
                          <span className="min-w-0">
                            <span className="tv-income-pref-card__title block">{option.label}</span>
                            <span className="tv-income-pref-card__meta block">{option.rate}</span>
                            <span className="tv-income-pref-card__hint block">{option.tip}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                      Minimum payout ({currency})
                    </span>
                    <input
                      className="tv-input h-11 w-40"
                      value={draft.payout_threshold_min}
                      onChange={(e) => patch({ payout_threshold_min: e.target.value })}
                      inputMode="decimal"
                      disabled={!canEdit || busy}
                    />
                  </label>
                  <p className="text-[11px] leading-relaxed text-[#71717a]">
                    Preferences are saved for when Traverion runs payouts. They do not move money by
                    themselves
                    {commercialTerms
                      ? ` · current agreement ${formatBpsAsPercent(commercialTerms.commission_bps)}`
                      : ''}
                    {draft.payment_cycle === 'monthly' || draft.payment_cycle === 'biweekly'
                      ? ` · catalog ${formatBpsAsPercent(catalogRateForPreference(draft.payment_cycle))}`
                      : ''}
                    .
                  </p>
                </div>
              ) : null}

              {draft.step === 'review' ? (
                <div className="payout-wizard__review mt-5 space-y-5 text-[13px]">
                  <dl className="payout-wizard__status-grid" aria-label="Readiness status">
                    <div className="payout-wizard__status-row">
                      <dt>Form progress</dt>
                      <dd>
                        <span className="payout-wizard__status-pill payout-wizard__status-pill--saved">
                          {readinessLanes.formProgress}
                        </span>
                      </dd>
                    </div>
                    <div className="payout-wizard__status-row">
                      <dt>Traverion business</dt>
                      <dd>
                        <span
                          className={[
                            'payout-wizard__status-pill',
                            readinessLanes.businessVerification === 'Approved'
                              ? 'payout-wizard__status-pill--ok'
                              : 'payout-wizard__status-pill--pending',
                          ].join(' ')}
                        >
                          {readinessLanes.businessVerification}
                        </span>
                      </dd>
                    </div>
                    <div className="payout-wizard__status-row">
                      <dt>Payout verification</dt>
                      <dd>
                        <span className="payout-wizard__status-pill payout-wizard__status-pill--pending">
                          {verificationPresentation}
                        </span>
                      </dd>
                    </div>
                    <div className="payout-wizard__status-row">
                      <dt>Payout readiness</dt>
                      <dd>
                        <span className="payout-wizard__status-pill payout-wizard__status-pill--pending">
                          {readinessLanes.payoutReadiness}
                        </span>
                      </dd>
                    </div>
                  </dl>

                  <p className="text-[12px] leading-relaxed text-[#5c6570]">{readinessLanes.nextStep}</p>

                  {profile?.connect_account_livemode === false || platformEnvironment === 'test' ? (
                    <p className="rounded-[10px] border border-[#e8ebf0] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#5c6570]">
                      This is Stripe TEST setup — not LIVE verification. LIVE payouts stay off until a
                      separate authorization.
                    </p>
                  ) : null}

                  <dl className="space-y-0 rounded-[12px] border border-[#eef2f7] bg-white px-3.5 py-1 text-[12px]">
                    <div className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2.5">
                      <dt className="text-[#52525b]">Business</dt>
                      <dd className="max-w-[60%] text-right font-semibold text-[#18181b]">
                        {profile?.company_legal_name?.trim() || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2.5">
                      <dt className="text-[#52525b]">Country / VAT</dt>
                      <dd className="text-right font-semibold text-[#18181b]">
                        {(profile?.address_country ?? '').toUpperCase() || '—'}
                        {profile?.vat_id?.trim() ? ` · ${profile.vat_id.trim()}` : ''}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2.5">
                      <dt className="text-[#52525b]">Registered address</dt>
                      <dd className="max-w-[60%] text-right font-medium text-[#18181b]">
                        {formatPayoutBusinessAddress(profile) || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-[#52525b]">Owners declared</dt>
                      <dd className="text-right font-semibold text-[#18181b]">
                        {(draft.rep_is_owner ? 1 : 0) + draft.beneficial_owners.length}
                        {sumDeclaredOwnershipPercent(draft) != null
                          ? ` · ${sumDeclaredOwnershipPercent(draft)}%`
                          : ''}
                      </dd>
                    </div>
                  </dl>

                  <ul className="space-y-0 rounded-[12px] border border-[#eef2f7] bg-[#fafbfc] px-3.5 py-1">
                    <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2.5">
                      <span className="text-[#52525b]">Business information</span>
                      <span className="font-semibold text-[#18181b]">
                        {draft.businessSavedAt || !validatePayoutBusinessFromProfile(profile)
                          ? 'Confirmed'
                          : 'Needed'}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2.5">
                      <span className="text-[#52525b]">Representative &amp; owners</span>
                      <span className="font-semibold text-[#18181b]">{reviewRepLabel()}</span>
                    </li>
                    <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2.5">
                      <span className="text-[#52525b]">Identity</span>
                      <span className="font-semibold text-[#18181b]">{reviewIdentityLabel()}</span>
                    </li>
                    <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2.5">
                      <span className="text-[#52525b]">Agreement</span>
                      <span className="font-semibold text-[#18181b]">
                        {draft.identitySavedAt || draft.tos_accepted ? 'Accepted' : 'Needed'}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2.5">
                      <span className="text-[#52525b]">Bank account</span>
                      <span className="font-semibold text-[#18181b]">
                        {payoutBankPresentation({
                          bankManaged,
                          bankMasked,
                          localProgress,
                          connectSetupUnavailable,
                          hasConnectedAccount,
                        })}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3 py-2.5">
                      <span className="text-[#52525b]">Payout preferences</span>
                      <span className="font-semibold text-[#18181b]">
                        {draft.preferencesSavedAt ||
                        (draft.payment_cycle && draft.payout_threshold_min)
                          ? `${
                              draft.payment_cycle === 'biweekly'
                                ? 'Twice monthly'
                                : draft.payment_cycle === 'monthly'
                                  ? 'Monthly'
                                  : 'Saved'
                            } · min ${draft.payout_threshold_min || profile?.payout_threshold_min || '—'}`
                          : 'Needed'}
                      </span>
                    </li>
                  </ul>

                  {accountRestricted ? (
                    <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-950">
                      This payout account needs attention before it can be used.
                      {profile?.connect_disabled_reason
                        ? ' Update the items below, then continue on Stripe.'
                        : ''}
                    </p>
                  ) : null}
                  {outstandingLabels.length > 0 ? (
                    <div>
                      <p className="text-[12px] font-semibold text-[#18181b]">Still needed</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-[#52525b]">
                        {outstandingLabels.map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                      {resumeStep && resumeStep !== 'review' ? (
                        <button
                          type="button"
                          className="mt-2 text-[13px] font-semibold text-[#073b83]"
                          onClick={() => goTo(resumeStep, 'back')}
                        >
                          Update this information
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <button
                      type="button"
                      className="text-[13px] font-semibold text-[#073b83]"
                      disabled={busy}
                      onClick={() => void refreshConnect()}
                    >
                      Refresh status
                    </button>
                    {canLaunchHostedStripe && hasConnectedAccount ? (
                      <button
                        type="button"
                        className="text-[13px] font-semibold text-[#073b83]"
                        disabled={busy || hostedLinkBusy || !canEdit}
                        onClick={() => void launchHostedStripe()}
                      >
                        {hostedLinkBusy ? 'Opening verification…' : 'Continue verification'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-[13px] font-semibold text-[#71717a]"
                      disabled={busy}
                      onClick={() => {
                        clearPayoutWizardDraft(userId);
                        const cleared = emptyPayoutWizardDraft({
                          ...prefillFromProfile(profile),
                          step: 'business',
                        });
                        setDraft(cleared);
                        void invokeConnectSupplierOnboarding('save_wizard_draft', {
                          wizard_draft: emptyServerPayoutWizardDraft(),
                        });
                        setNote('Saved progress cleared on this device and your Traverion account.');
                        setPhase('steps');
                      }}
                    >
                      Clear saved progress
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        <footer className="payout-wizard__footer listing-creation-footer po-step-footer -mx-4 sm:-mx-8 lg:-mx-10">
          <div className="payout-wizard__footer-inner">
            <button
              type="button"
              className="tv-btn-ghost payout-wizard__footer-back h-11 px-3 text-[13px]"
              onClick={onBack}
              disabled={busy}
            >
              {stepIndex === 0 ? 'Exit' : 'Back'}
            </button>
            {!embedded ? (
              <span className="justify-self-center text-[11px] font-medium text-[#a1a1aa]">
                {stepIndex + 1}/{PAYOUT_WIZARD_SCREENS.length}
              </span>
            ) : (
              <span aria-hidden className="justify-self-center" />
            )}
            <button
              type="button"
              className="tv-btn-primary payout-wizard__footer-next h-11 px-4 text-[13px]"
              onClick={() => void onContinue()}
              disabled={
                busy ||
                !canEdit ||
                (Boolean(useStripeEmbed) &&
                  ((expressVerificationMandatory && expressLaunchFailed) ||
                    (customVerificationMandatory && expressLaunchFailed && !showStripeEmbed)))
              }
            >
              {continueLabel}
            </button>
          </div>
        </footer>
        </main>
      </div>
      </div>
    </div>
  );
}
