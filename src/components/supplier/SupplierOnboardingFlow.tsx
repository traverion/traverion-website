import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import DateOfBirthPicker from './DateOfBirthPicker';
import OnboardingDocumentCard from './OnboardingDocumentCard';
import OnboardingStepper from './OnboardingStepper';
import RegisteredBusinessAddress from './RegisteredBusinessAddress';
import { ListingCreationWorkspace } from './listing-creation/ListingCreationWorkspace';
import {
  fetchSupplierProfile,
  invalidateSupplierProfileCache,
  patchSupplierProfile,
  removeSupplierVerificationDocumentFile,
  updateSupplierCompanyProfile,
  updateSupplierSetupProgress,
  uploadSupplierVerificationDocument,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import {
  connectOnboardingUserMessage,
  invokeConnectSupplierOnboarding,
} from '../../data/supabase-connect-onboarding';
import { isValidFinnishBusinessId, normalizeCountryCode, normalizeFinnishBusinessId } from '../../lib/business-identity-validation';
import {
  addressFieldErrors,
  type StructuredBusinessAddress,
} from '../../lib/business-address';
import { feedback } from '../../lib/feedback';
import { validateIsoDob } from '../../lib/date-of-birth';
import { onboardingBusinessReviewDraft, onboardingReviewBlocker } from '../../lib/onboarding-final-submission';
import { submitSupplierBusinessForReview } from '../../lib/submitSupplierBusinessForReview';
import { PARTNER_AFTER_EMAIL_CONFIRM_PATH, PARTNER_TERMS_OF_SERVICE_PATH, PARTNER_TERMS_VERSION } from '../../lib/partnerPortalPaths';
import {
  localDraftWouldEraseServer,
  onboardingDraftFlush,
  onboardingPopAction,
  adjacentOnboardingScreen,
  initialOnboardingJourney,
  onboardingMoveDirection,
  previousOnboardingScreen,
  reconcileOnboardingJourney,
} from '../../lib/supplier-onboarding-nav';
import {
  emptyBeneficialOwner,
  emptyPayoutWizardDraft,
  loadPayoutWizardDraft,
  mergeServerPayoutWizardDraft,
  nextOwnershipPercentInput,
  ownershipPercentForDraft,
  parseOwnershipPercent,
  parsePayoutWizardDob,
  savePayoutWizardDraft,
  suggestRepresentativeNameFromDirectors,
  toServerPayoutWizardDraft,
  validateIban,
  validateOwnershipPercent,
  type PayoutWizardDraft,
  type PayoutWizardStepId,
} from '../../lib/payout-setup-wizard';
import { createBankAccountToken } from '../../lib/stripe-js-client';
import { STRIPE_RECIPIENT_AGREEMENT } from '../../lib/stripe-recipient-agreement';
import {
  companyOnboardingPresentation,
  canRevisitOnboardingPhase,
  onboardingOverallStep,
  onboardingPhaseEntryScreen,
  requirementFlags,
  screenFromOnboardingUrl,
  supplierOnboardingScreen,
  visibleSupplierOnboardingScreens,
  type SupplierOnboardingPhase,
  type SupplierOnboardingScreenId,
  type SupplierOnboardingVisibility,
} from '../../lib/supplier-onboarding-steps';
import {
  onboardingLanesVerified,
  supplierOnboardingSnapshot,
  supplierSetupCompletionCopy,
} from '../../lib/supplier-onboarding-progress';
import { beginAuthTransition, failAuthTransition, succeedAuthTransition } from '../../lib/auth-transition';
import { supplierVerificationState } from '../../lib/supplier-verification-state';
import { partnerToast } from '../../lib/partner-toast';

function finishSupplierSetupStep(
  id: number,
  profile: SupplierProfileRow | null | undefined,
  pendingTitle: string,
  pendingMessage: string,
) {
  const verified = Boolean(profile && onboardingLanesVerified(supplierOnboardingSnapshot(profile)));
  const copy = supplierSetupCompletionCopy(verified, pendingTitle, pendingMessage);
  succeedAuthTransition(id, {
    title: copy.title,
    message: copy.message,
    page: 'partner',
  });
}

type OwnerEntry = { first_name: string; last_name: string; dob: string; percent_ownership: string };

function blankOwner(): OwnerEntry {
  return { first_name: '', last_name: '', dob: '', percent_ownership: '' };
}

function ReviewSection({ title, detail, onEdit }: { title: string; detail: string; onEdit: () => void }) {
  return (
    <section className="supplier-review__section">
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      <button type="button" className="tv-btn-ghost min-h-11 px-3 text-sm" onClick={onEdit}>
        Edit
      </button>
    </section>
  );
}

function presentationLocked(profile: SupplierProfileRow | null | undefined) {
  const status = (profile?.verification_status ?? '').toLowerCase();
  return status === 'verified' || (status === 'pending' && Boolean((profile?.verification_submitted_at ?? '').trim()));
}

function representativeDobKey(userId: string) {
  return `traverion.onboarding.rep-dob.${userId}`;
}

function readRepresentativeDob(userId: string): string {
  if (!userId || typeof window === 'undefined') return '';
  try {
    const value = window.sessionStorage.getItem(representativeDobKey(userId)) ?? '';
    return validateIsoDob(value, { required: true }) ? '' : value;
  } catch {
    return '';
  }
}

function writeRepresentativeDob(userId: string, value: string) {
  if (!userId || typeof window === 'undefined') return;
  try {
    const key = representativeDobKey(userId);
    if (validateIsoDob(value, { required: true })) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Private mode can block session storage. The date stays in this view.
  }
}

export default function SupplierOnboardingFlow({
  userId,
  profile,
  canEdit,
  onProfile,
  onExit,
  onOpenListings,
  hasListing,
}: {
  userId: string;
  profile: SupplierProfileRow | null;
  canEdit: boolean;
  onProfile: (profile: SupplierProfileRow | null) => void;
  onExit: () => void;
  onOpenListings: () => void;
  hasListing: boolean;
}) {
  const [draft, setDraft] = useState<PayoutWizardDraft>(() => initialDraft(userId, profile));
  const [repDob, setRepDob] = useState(() => readRepresentativeDob(userId));
  const [owner, setOwner] = useState<OwnerEntry>(blankOwner);
  const [others, setOthers] = useState<boolean | null>(null);
  const [iban, setIban] = useState('');
  const [companyLegal, setCompanyLegal] = useState(profile?.company_legal_name ?? '');
  const [companyReg, setCompanyReg] = useState(profile?.company_registration_number ?? '');
  const [companyCity, setCompanyCity] = useState(profile?.address_city ?? '');
  const [companyPostal, setCompanyPostal] = useState(profile?.address_postal_code ?? '');
  const [companyStreet, setCompanyStreet] = useState(profile?.address_street ?? '');
  const [companyCountry, setCompanyCountry] = useState(profile?.address_country ?? '');
  const [screen, setScreen] = useState<SupplierOnboardingScreenId | null>(null);
  const [journey, setJourney] = useState<SupplierOnboardingScreenId[]>([]);
  const [motion, setMotion] = useState<'forward' | 'back'>('forward');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const booted = useRef(false);
  const ownerHydrated = useRef(false);
  const submitting = useRef(false);
  const finalizing = useRef(false);
  const navLock = useRef(false);
  const historyPending = useRef(false);
  const journeyRef = useRef<SupplierOnboardingScreenId[]>([]);
  const companyEdited = useRef(false);
  const draftEdited = useRef(false);
  const historyStack = useRef<SupplierOnboardingScreenId[]>([]);
  const lastSavedSig = useRef<string | null>(null);
  const draftTimer = useRef<number | null>(null);
  const docLock = useRef(false);
  const screenRef = useRef<SupplierOnboardingScreenId | null>(null);
  const exitRef = useRef<() => Promise<void>>(async () => undefined);

  const due = useMemo(() => {
    const current = profile?.connect_requirements_currently_due ?? [];
    const past = profile?.connect_requirements_past_due ?? [];
    return [...current, ...past].map(String);
  }, [profile]);
  const hasAccount = Boolean(profile?.stripe_connected_account_id);
  const flags = requirementFlags(due, hasAccount);
  const isCompany = (profile?.business_type || draft.business_type) !== 'individual';
  const share = parseOwnershipPercent(draft.rep_percent_ownership);
  const hasFile = Boolean(profile?.company_registration_document_path?.trim());
  const visibility = useMemo<SupplierOnboardingVisibility>(
    () => ({
      isCompany,
      hasRegistrationFile: hasFile,
      businessRejected: profile?.verification_status === 'rejected',
      identityOpen: flags.identityOpen,
      owns: draft.rep_is_owner,
      share,
      others,
      hasExtraOwner: Boolean(owner.first_name.trim()),
      bankOpen: flags.bankOpen,
      termsOpen: flags.termsOpen,
    }),
    [isCompany, hasFile, profile?.verification_status, flags, draft.rep_is_owner, share, others, owner.first_name]
  );
  const visible = useMemo(() => visibleSupplierOnboardingScreens(visibility), [visibility]);
  const snapshot = useMemo(() => supplierOnboardingSnapshot(profile), [profile]);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  screenRef.current = screen;

  useEffect(() => {
    if (ownerHydrated.current) return;
    const row = draft.beneficial_owners[0];
    if (!row?.first_name.trim() && !row?.last_name.trim()) return;
    ownerHydrated.current = true;
    setOwner({
      first_name: row.first_name,
      last_name: row.last_name,
      dob: '',
      percent_ownership: row.percent_ownership,
    });
    setOthers(true);
  }, [draft.beneficial_owners]);

  useEffect(() => {
    if (companyEdited.current || !profile) return;
    setCompanyLegal(profile.company_legal_name ?? '');
    setCompanyReg(profile.company_registration_number ?? '');
    setCompanyStreet(profile.address_street ?? '');
    setCompanyPostal(profile.address_postal_code ?? '');
    setCompanyCity(profile.address_city ?? '');
    setCompanyCountry(profile.address_country ?? '');
  }, [profile]);

  const writeScreen = useCallback((next: SupplierOnboardingScreenId, mode: 'push' | 'replace') => {
    const phase = supplierOnboardingScreen(next).phase;
    const url = new URL(window.location.href);
    url.searchParams.set('phase', phase);
    url.searchParams.set('screen', next);
    const href = `${url.pathname}${url.search}`;
    const state = { onboardingScreen: next };
    if (mode === 'push') window.history.pushState(state, '', href);
    else window.history.replaceState(state, '', href);
  }, []);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const nextDraft = initialDraft(userId, profile);
    setDraft(nextDraft);
    const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    const explicit = params.has('screen') || params.has('phase');
    const resume = supplierOnboardingSnapshot(profile).nextScreen;
    const requested = explicit ? screenFromOnboardingUrl(window.location.search, visible) : resume;
    const next =
      visible.includes(requested) ||
      requested === 'company' ||
      requested === 'documents' ||
      requested === 'address' ||
      requested === 'bank'
        ? requested
        : visible[0] ?? 'company';
    const started = initialOnboardingJourney(visible, next);
    journeyRef.current = started;
    setJourney(started);
    setScreen(next);
    historyStack.current = [next];
    lastSavedSig.current = onboardingDraftSignature(nextDraft);
    writeScreen(next, 'replace');
    if (userId) void updateSupplierSetupProgress(userId, progressRecord(profile, next));
    // The first saved step is chosen once. Later edits must not jump the supplier back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPop = () => {
      const pending = historyPending.current;
      historyPending.current = false;
      if (navLock.current && !pending) {
        const current = screenRef.current;
        if (current) writeScreen(current, 'push');
        return;
      }
      const action = onboardingPopAction({
        pathname: window.location.pathname,
        search: window.location.search,
        visible,
      });
      if (action.type === 'ignore-email') {
        const current = screenRef.current;
        if (current) writeScreen(current, 'push');
        window.location.replace(PARTNER_AFTER_EMAIL_CONFIRM_PATH);
        return;
      }
      if (action.type === 'leave') {
        const current = screenRef.current;
        if (current) writeScreen(current, 'push');
        void exitRef.current();
        return;
      }
      if (action.type === 'stay') {
        const leaving = screenRef.current;
        const stack = historyStack.current;
        const idx = stack.lastIndexOf(action.screen);
        if (idx >= 0) historyStack.current = stack.slice(0, idx + 1);
        else historyStack.current = [...stack, action.screen];
        const base = journeyRef.current.length ? journeyRef.current : visible;
        const synced = initialOnboardingJourney(base, action.screen);
        journeyRef.current = synced;
        setJourney(synced);
        if (leaving && leaving !== action.screen) {
          setMotion(onboardingMoveDirection(synced, leaving, action.screen));
          void persistDraft('quiet').then((result) => {
            if (result !== 'failed' || !leaving) return;
            setMotion('forward');
            setScreen(leaving);
            historyStack.current = [...historyStack.current, leaving];
            writeScreen(leaving, 'push');
          });
        }
        setScreen(action.screen);
        setDraft((current) => {
          const updated = { ...current, step: wizardStepForScreen(action.screen) };
          draftRef.current = updated;
          return updated;
        });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [visible, writeScreen]);


  useEffect(() => {
    if (!screen) return;
    const node = document.querySelector('.partner-onboarding-frame .listing-creation-content');
    if (node instanceof HTMLElement) node.scrollTop = 0;
  }, [screen]);

  useEffect(() => {
    if (screen !== 'status' || !userId) return;
    const timer = window.setInterval(() => {
      invalidateSupplierProfileCache(userId);
      void fetchSupplierProfile(userId).then((next) => {
        if (next) onProfile(next);
      });
    }, 20000);
    return () => window.clearInterval(timer);
  }, [screen, userId, onProfile]);

  useEffect(() => {
    if (!userId || !booted.current) return;
    const current = draft;
    const signature = onboardingDraftSignature(current);
    const erase =
      localDraftWouldEraseServer(
        { firstName: current.rep_first_name, lastName: current.rep_last_name },
        profile?.payout_wizard_draft ?? null
      ) && !draftEdited.current;
    if (onboardingDraftFlush(lastSavedSig.current, signature, erase) === 'skip') return;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      draftTimer.current = null;
      void persistDraft('quiet');
    }, 500);
    return () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    };
  }, [userId, draft, profile?.payout_wizard_draft]);

  const persistDraft = async (mode: 'quiet' | 'blocking' = 'blocking'): Promise<'current' | 'saved' | 'failed'> => {
    const current = draftRef.current;
    if (!validateIsoDob(current.rep_dob, { required: true })) writeRepresentativeDob(userId, current.rep_dob);
    const stored = {
      ...current,
      rep_dob: '',
      beneficial_owners: current.beneficial_owners.map((row) => ({ ...row, dob: '' })),
    };
    const signature = onboardingDraftSignature(stored);
    const erase =
      localDraftWouldEraseServer(
        { firstName: current.rep_first_name, lastName: current.rep_last_name },
        profile?.payout_wizard_draft ?? null
      ) && !draftEdited.current;
    if (onboardingDraftFlush(lastSavedSig.current, signature, erase) === 'skip') return 'current';
    if (draftTimer.current) {
      window.clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    if (mode === 'blocking') setBusy(true);
    savePayoutWizardDraft(userId, stored);
    const draftSaved = await invokeConnectSupplierOnboarding('save_wizard_draft', {
      wizard_draft: toServerPayoutWizardDraft(stored),
    });
    if (mode === 'blocking') setBusy(false);
    if (!draftSaved.success) {
      setError(connectOnboardingUserMessage(draftSaved.error) || 'Progress could not be saved. Your entries are still on this page.');
      return 'failed';
    }
    lastSavedSig.current = signature;
    return 'saved';
  };

  const revealFieldErrors = (errors: Record<string, string>) => {
    setFieldErrors(errors);
    setError(null);
    const first = Object.keys(errors)[0];
    if (!first) return;
    window.setTimeout(() => {
      const root = document.querySelector(`[data-field="${first}"]`);
      if (!(root instanceof HTMLElement)) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      root.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      const target = root.querySelector('input, select, button, textarea');
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }, 120);
  };

  const clearFieldError = (id: string) => {
    setFieldErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const registrationValue = () => {
    const countryCode = normalizeCountryCode(companyCountry);
    return countryCode === 'FI' ? normalizeFinnishBusinessId(companyReg) : companyReg.trim();
  };

  const businessIdError = () => {
    const registration = companyReg.trim();
    if (!registration) return 'Enter the business registration number.';
    const countryCode = normalizeCountryCode(companyCountry);
    const normalized = normalizeFinnishBusinessId(registration);
    const finnishShape = /^\d{7}-\d$/.test(normalized);
    if ((countryCode === 'FI' || finnishShape) && !isValidFinnishBusinessId(normalized)) {
      return 'Enter a valid Finnish business ID.';
    }
    if (!finnishShape && countryCode !== 'FI' && registration.length < 3) {
      return 'Enter the business registration number.';
    }
    return null;
  };

  const sequence = (patch?: Partial<SupplierOnboardingVisibility>) =>
    visibleSupplierOnboardingScreens({ ...visibility, ...patch });

  const companyLocked = presentationLocked(profile);

  const publish = (next: SupplierOnboardingScreenId, direction: 'forward' | 'back') => {
    setError(null);
    setMotion(direction);
    setDraft((current) => {
      const updated = { ...current, step: wizardStepForScreen(next) };
      draftRef.current = updated;
      savePayoutWizardDraft(userId, updated);
      return updated;
    });
    setScreen(next);
    historyStack.current = [...historyStack.current, next];
    writeScreen(next, 'push');
    void updateSupplierSetupProgress(userId, progressRecord(profile, next));
  };

  const advance = async (id: SupplierOnboardingScreenId, patch?: Partial<SupplierOnboardingVisibility>) => {
    const saved = await persistDraft();
    if (saved === 'failed') return;
    if (saved === 'saved') feedback.success('Saved');
    const computed = sequence(patch);
    const nextJourney = reconcileOnboardingJourney(
      journeyRef.current.length ? journeyRef.current : computed,
      id,
      computed
    );
    journeyRef.current = nextJourney;
    setJourney(nextJourney);
    const next = adjacentOnboardingScreen(nextJourney, id, 1);
    if (!next) {
      setError('The next step could not be opened. Your answers are still on this page.');
      return;
    }
    publish(next, 'forward');
  };

  const saveBusinessDetails = async (): Promise<boolean> => {
    const legal = companyLegal.trim();
    const idError = businessIdError();
    const errors: Record<string, string> = {};
    if (!legal) errors['company-legal'] = 'Enter the registered legal name.';
    if (idError) errors['company-reg'] = idError;
    if (Object.keys(errors).length > 0) {
      revealFieldErrors(errors);
      return false;
    }
    setFieldErrors({});
    setBusy(true);
    setError(null);
    const saved = await updateSupplierCompanyProfile(userId, {
      company_legal_name: legal,
      company_registration_number: registrationValue(),
      business_type: profile?.business_type === 'individual' ? 'individual' : 'company',
    });
    setBusy(false);
    if (!saved.success) {
      setError(saved.error || 'The company details could not be saved.');
      return false;
    }
    if (profile) {
      onProfile({
        ...profile,
        company_legal_name: legal,
        company_registration_number: registrationValue(),
        business_type: profile.business_type === 'individual' ? 'individual' : 'company',
      });
    }
    feedback.success('Saved');
    return true;
  };

  const saveBusinessAddress = async (): Promise<boolean> => {
    const address: StructuredBusinessAddress = {
      street: companyStreet.trim(),
      postal: companyPostal.trim(),
      city: companyCity.trim(),
      country: companyCountry.trim(),
    };
    const errors = addressFieldErrors(address);
    const idError = businessIdError();
    if (normalizeCountryCode(address.country) === 'FI' && idError) {
      revealFieldErrors({ 'company-reg': idError });
      publish('company', 'back');
      return false;
    }
    if (Object.keys(errors).length > 0) {
      revealFieldErrors(errors);
      return false;
    }
    setFieldErrors({});
    setBusy(true);
    setError(null);
    const saved = await updateSupplierCompanyProfile(userId, {
      address_street: address.street,
      address_city: address.city,
      address_postal_code: address.postal,
      address_country: address.country,
    });
    setBusy(false);
    if (!saved.success) {
      setError(saved.error || 'The address could not be saved.');
      return false;
    }
    if (profile) {
      onProfile({
        ...profile,
        address_street: address.street,
        address_city: address.city,
        address_postal_code: address.postal,
        address_country: address.country,
      });
    }
    feedback.success('Saved');
    return true;
  };

  const exitAndSave = async () => {
    if (!screen || busy || documentBusy) return;
    setBusy(true);
    setError(null);
    const countryCode = normalizeCountryCode(companyCountry);
    const registration = countryCode === 'FI' ? normalizeFinnishBusinessId(companyReg) : companyReg.trim();
    const companyOpen =
      (profile?.verification_status ?? '').toLowerCase() !== 'verified' &&
      !(
        (profile?.verification_status ?? '').toLowerCase() === 'pending' &&
        Boolean((profile?.verification_submitted_at ?? '').trim())
      );
    if ((screen === 'company' || screen === 'address') && companyOpen) {
      if (countryCode === 'FI' && companyReg.trim() && !isValidFinnishBusinessId(registration)) {
        setBusy(false);
        setError('Enter a valid Finnish business ID before leaving, or clear it.');
        return;
      }
      const patch: {
        company_legal_name?: string;
        company_registration_number?: string;
        address_city?: string;
        address_postal_code?: string;
        address_street?: string;
        address_country?: string;
      } = {};
      if (companyLegal.trim()) patch.company_legal_name = companyLegal.trim();
      if (registration) patch.company_registration_number = registration;
      if (companyStreet.trim()) patch.address_street = companyStreet.trim();
      if (companyCity.trim()) patch.address_city = companyCity.trim();
      if (companyPostal.trim()) patch.address_postal_code = companyPostal.trim();
      if (companyCountry.trim()) patch.address_country = companyCountry.trim();
      if (Object.keys(patch).length > 0) {
        const saved = await updateSupplierCompanyProfile(userId, patch);
        if (!saved.success) {
          setBusy(false);
          setError(saved.error || 'The company details could not be saved. They are still on this page.');
          return;
        }
      }
    }
    const draftSaved = await persistDraft('quiet');
    if (draftSaved === 'failed') {
      setBusy(false);
      return;
    }
    const progressSaved = await updateSupplierSetupProgress(userId, progressRecord(profile, screen, true));
    if (!progressSaved.success) {
      setBusy(false);
      setError(progressSaved.error || 'Progress could not be saved. Your entries are still on this page.');
      return;
    }
    setBusy(false);
    feedback.success('Saved');
    onExit();
  };
  exitRef.current = exitAndSave;

  const back = async () => {
    const route = journeyRef.current.length ? journeyRef.current : visible;
    const previous = previousOnboardingScreen(route, screen);
    if (!previous || busy || documentBusy || navLock.current) return;
    navLock.current = true;
    try {
      setError(null);
      const saved = await persistDraft();
      if (saved === 'failed') return;
      if (saved === 'saved') feedback.success('Saved');
      const stack = historyStack.current;
      if (stack.length > 1 && stack[stack.length - 2] === previous) {
        // Apply the previous screen before history moves. A late popstate must not
        // leave the URL on one step and the form on another.
        historyStack.current = stack.slice(0, -1);
        screenRef.current = previous;
        setMotion('back');
        setDraft((current) => {
          const updated = { ...current, step: wizardStepForScreen(previous) };
          draftRef.current = updated;
          return updated;
        });
        setScreen(previous);
        void updateSupplierSetupProgress(userId, progressRecord(profile, previous));
        historyPending.current = true;
        window.history.back();
        return;
      }
      publish(previous, 'back');
    } finally {
      navLock.current = false;
    }
  };

  const openPhase = async (phase: SupplierOnboardingPhase) => {
    if (!screen || busy || documentBusy || navLock.current) return;
    navLock.current = true;
    try {
      const route = journeyRef.current.length ? journeyRef.current : visible;
      const currentPhase = supplierOnboardingScreen(screen).phase;
      if (!canRevisitOnboardingPhase(phase, currentPhase, route)) return;
      const target = onboardingPhaseEntryScreen(phase, route);
      if (!target || target === screen) return;
      setError(null);
      const saved = await persistDraft();
      if (saved === 'failed') return;
      if (saved === 'saved') feedback.success('Saved');
      publish(target, 'back');
    } finally {
      navLock.current = false;
    }
  };

  const editStep = (next: SupplierOnboardingScreenId) => {
    if (navLock.current) return;
    const route = journeyRef.current.length ? journeyRef.current : visible;
    const nextJourney = initialOnboardingJourney(route, next);
    journeyRef.current = nextJourney;
    setJourney(nextJourney);
    publish(next, onboardingMoveDirection(nextJourney, screen, next));
  };

  const onContinue = async () => {
    if (busy || documentBusy || submitting.current || finalizing.current || navLock.current) return;
    navLock.current = true;
    try {
    await continueFromScreen();
    } finally {
      navLock.current = false;
    }
  };

  const continueFromScreen = async () => {
    if (!canEdit && screen !== 'company' && screen !== 'address' && screen !== 'status') {
      setError('Your role can view setup but cannot change it.');
      return;
    }
    if (screen === 'company') {
      if (presentationLocked(profile)) {
        await advance('company');
        return;
      }
      const ok = await saveBusinessDetails();
      if (ok) await advance('company');
      return;
    }
    if (screen === 'address') {
      if (presentationLocked(profile)) {
        await advance('address');
        return;
      }
      const ok = await saveBusinessAddress();
      if (ok) await advance('address');
      return;
    }
    if (screen === 'documents') {
      if (!hasFile) {
        revealFieldErrors({ documents: 'Add the registration document.' });
        return;
      }
      await advance('documents');
      return;
    }
    if (screen === 'person') {
      const errors: Record<string, string> = {};
      if (!draft.rep_first_name.trim()) errors['rep-first'] = 'Enter the first name.';
      if (!draft.rep_last_name.trim()) errors['rep-last'] = 'Enter the last name.';
      const dobErr = validateIsoDob(repDob, { required: true });
      if (dobErr) errors['rep-dob'] = dobErr;
      if (Object.keys(errors).length > 0) {
        revealFieldErrors(errors);
        return;
      }
      const updated = {
        ...draftRef.current,
        rep_first_name: draft.rep_first_name.trim(),
        rep_last_name: draft.rep_last_name.trim(),
        rep_dob: repDob,
      };
      draftRef.current = updated;
      setDraft(updated);
      writeRepresentativeDob(userId, repDob);
      await advance('person');
      return;
    }
    if (screen === 'director') {
      const errors: Record<string, string> = {};
      if (isCompany && draft.rep_is_owner) {
        const percentErr = validateOwnershipPercent(draft.rep_percent_ownership, { required: true });
        if (percentErr) errors['rep-share'] = percentErr;
      }
      if (Object.keys(errors).length > 0) {
        revealFieldErrors(errors);
        return;
      }
      if (isCompany && draft.rep_is_owner && share === 100) setOthers(false);
      const updated = {
        ...draftRef.current,
        rep_is_director: draft.rep_is_director,
        rep_is_owner: draft.rep_is_owner,
        rep_percent_ownership: ownershipPercentForDraft(draft.rep_percent_ownership, draft.rep_is_owner),
        representativeSavedAt: new Date().toISOString(),
      };
      draftRef.current = updated;
      setDraft(updated);
      await advance('director', {
        owns: draft.rep_is_owner,
        share,
        others: isCompany && draft.rep_is_owner && share === 100 ? false : others,
      });
      return;
    }
    if (screen === 'others') {
      if (others == null) {
        revealFieldErrors({ 'other-owners': 'Choose yes or no.' });
        return;
      }
      if (others) {
        const percentErr = validateOwnershipPercent(owner.percent_ownership, { required: true });
        const dobErr = validateIsoDob(owner.dob, { required: true });
        const errors: Record<string, string> = {};
        if (!owner.first_name.trim()) errors['owner-first'] = 'Enter the first name.';
        if (!owner.last_name.trim()) errors['owner-last'] = 'Enter the last name.';
        if (dobErr) errors['owner-dob'] = dobErr;
        if (percentErr || parseOwnershipPercent(owner.percent_ownership) == null || (parseOwnershipPercent(owner.percent_ownership) ?? 0) <= 0) {
          errors['owner-share'] = percentErr ?? 'Enter an ownership percentage greater than 0 and up to 100.';
        }
        if (Object.keys(errors).length > 0) {
          revealFieldErrors(errors);
          return;
        }
        setDraft((current) => {
          const updated = {
            ...current,
            beneficial_owners: [
              emptyBeneficialOwner({
                first_name: owner.first_name.trim(),
                last_name: owner.last_name.trim(),
                percent_ownership: ownershipPercentForDraft(owner.percent_ownership, true),
                dob: '',
              }),
            ],
          };
          draftRef.current = updated;
          return updated;
        });
      }
      await advance('others', { others, hasExtraOwner: others });
      return;
    }
    if (screen === 'bank') {
      if (!iban.trim() && draft.bankSavedAt) {
        await advance('bank');
        return;
      }
      const ibanError = validateIban(iban, normalizeCountryCode(profile?.address_country) || 'FI');
      if (ibanError) {
        revealFieldErrors({ iban: ibanError });
        return;
      }
      await advance('bank');
      return;
    }
    if (draftReview) {
      void completeSetup();
      return;
    }
    if (verification.actionLabel && snapshot.nextScreen !== screen) {
      const route = journeyRef.current.length ? journeyRef.current : visible;
      const nextJourney = initialOnboardingJourney(route, snapshot.nextScreen);
      journeyRef.current = nextJourney;
      setJourney(nextJourney);
      publish(snapshot.nextScreen, onboardingMoveDirection(nextJourney, screen, snapshot.nextScreen));
      return;
    }
    onExit();
  };

  const submitIdentity = async (quiet = false): Promise<string | null> => {
    if (submitting.current) return 'Submission is already in progress.';
    const dob = parsePayoutWizardDob(repDob);
    if (!dob) return 'Enter a valid date of birth.';
    const country = normalizeCountryCode(profile?.address_country || '') || 'FI';
    if (isCompany && country === 'FI' && !isValidFinnishBusinessId(profile?.company_registration_number)) {
      return 'The Finnish Business ID on the company record needs to be corrected before it can be sent.';
    }
    if (!hasAccount) {
      const ensured = await invokeConnectSupplierOnboarding('ensure_account');
      if (!ensured.success) {
        return connectOnboardingUserMessage(ensured.error) || 'A payout account could not be opened yet.';
      }
      const refreshed = await fetchSupplierProfile(userId);
      if (refreshed) onProfile(refreshed);
      if (!refreshed?.stripe_connected_account_id) return 'A payout account could not be opened yet.';
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    const transitionId = quiet
      ? 0
      : beginAuthTransition({
          intent: 'setup',
          title: 'Sending your details...',
          message: 'One moment.',
        });
    const fail = (message: string) => {
      setBusy(false);
      submitting.current = false;
      setError(message);
      if (!quiet) failAuthTransition(transitionId, message);
      return message;
    };
    const business = await invokeConnectSupplierOnboarding('submit_business', {
      business: {
        legal_name: profile?.company_legal_name?.trim() || undefined,
        business_type: profile?.business_type || undefined,
        registration_number: profile?.company_registration_number?.trim() || undefined,
        phone: profile?.contact_phone?.trim() || undefined,
        address: {
          line1: (profile?.address_street ?? '').trim(),
          city: (profile?.address_city ?? '').trim(),
          postal_code: (profile?.address_postal_code ?? '').trim(),
          country,
        },
      },
    });
    if (!business.success) return fail(connectOnboardingUserMessage(business.error));
    const ownership = draft.rep_is_owner ? share : null;
    const person = await invokeConnectSupplierOnboarding('submit_representative', {
      representative: {
        first_name: draft.rep_first_name.trim(),
        last_name: draft.rep_last_name.trim(),
        email: draft.rep_email.trim() || undefined,
        phone: profile?.contact_phone?.trim() || undefined,
        title: draft.rep_title.trim() || undefined,
        dob,
        address: {
          line1: (profile?.address_street ?? '').trim(),
          city: (profile?.address_city ?? '').trim(),
          postal_code: (profile?.address_postal_code ?? '').trim(),
          country,
        },
        relationship: {
          owner: draft.rep_is_owner,
          executive: true,
          director: isCompany ? draft.rep_is_director : false,
          percent_ownership: ownership,
        },
      },
    });
    if (!person.success) return fail(connectOnboardingUserMessage(person.error));
    if (others && owner.first_name.trim()) {
      const ownerDob = parsePayoutWizardDob(owner.dob);
      const ownerShare = parseOwnershipPercent(owner.percent_ownership);
      if (!ownerDob || ownerShare == null) {
        return fail('Check the additional owner’s date of birth and share, then try again.');
      }
      const owners = await invokeConnectSupplierOnboarding('submit_beneficial_owners', {
        owners: [
          {
            first_name: owner.first_name.trim(),
            last_name: owner.last_name.trim(),
            dob: ownerDob,
            percent_ownership: ownerShare,
            address: {
              line1: (profile?.address_street ?? '').trim(),
              city: (profile?.address_city ?? '').trim(),
              postal_code: (profile?.address_postal_code ?? '').trim(),
              country,
            },
          },
        ],
      });
      if (!owners.success) return fail(connectOnboardingUserMessage(owners.error));
    }
    const next = await fetchSupplierProfile(userId);
    if (next) onProfile(next);
    setDraft((current) => ({ ...current, representativeSavedAt: new Date().toISOString(), rep_dob: '' }));
    if (!quiet) setRepDob('');
    setBusy(false);
    submitting.current = false;
    if (!quiet) {
      finishSupplierSetupStep(
        transitionId,
        next,
        'Verification sent',
        'We have your details for review. This is not an approval.',
      );
    }
    return null;
  };

  const submitBank = async (quiet = false): Promise<string | null> => {
    if (submitting.current) return 'Submission is already in progress.';
    const country = normalizeCountryCode(profile?.address_country) || 'FI';
    const holder = (profile?.company_legal_name || companyLegal || '').trim();
    const ibanError = validateIban(iban, country);
    if (!holder || ibanError) return ibanError ?? 'The company legal name is missing.';
    submitting.current = true;
    setBusy(true);
    setError(null);
    const transitionId = quiet
      ? 0
      : beginAuthTransition({
          intent: 'setup',
          title: 'Saving your payout account...',
          message: 'One moment.',
        });
    const fail = (message: string) => {
      setBusy(false);
      submitting.current = false;
      setError(message);
      if (!quiet) failAuthTransition(transitionId, message);
      return message;
    };
    if (flags.termsOpen || draft.tos_accepted) {
      const terms = await invokeConnectSupplierOnboarding('accept_tos', {
        tos_accepted: true,
        agreement_version: STRIPE_RECIPIENT_AGREEMENT.version,
      });
      if (!terms.success) return fail(connectOnboardingUserMessage(terms.error));
      setDraft((current) => ({ ...current, tos_accepted: true }));
    }
    const tokenized = await createBankAccountToken({
      country,
      currency: profile?.connect_default_currency || 'eur',
      accountNumber: iban,
      accountHolderName: holder,
      accountHolderType: isCompany ? 'company' : 'individual',
    });
    if ('error' in tokenized) return fail(tokenized.error);
    const attached = await invokeConnectSupplierOnboarding('attach_bank_token', {
      bank_token: tokenized.tokenId,
    });
    setIban('');
    if (!attached.success) return fail(connectOnboardingUserMessage(attached.error));
    const next = await fetchSupplierProfile(userId);
    if (next) onProfile(next);
    setDraft((current) => ({
      ...current,
      bankSavedAt: new Date().toISOString(),
      bankLast4: null,
      tos_accepted: true,
    }));
    setBusy(false);
    submitting.current = false;
    if (!quiet) {
      finishSupplierSetupStep(
        transitionId,
        next,
        'Payout account saved',
        'The account is saved. This does not enable payouts or approve the company.',
      );
    }
    return null;
  };

  const completeSetup = async () => {
    if (submitting.current || finalizing.current || busy) return;
    finalizing.current = true;
    let done = false;
    try {
    const representativeName = [draft.rep_first_name, draft.rep_last_name].filter(Boolean).join(' ').trim();
    const supplierTermsAccepted =
      draft.supplier_terms_version === PARTNER_TERMS_VERSION && Boolean(draft.supplier_terms_accepted_at);
    const blocker = onboardingReviewBlocker({
      legalName: companyLegal,
      registrationNumber: companyReg,
      street: companyStreet,
      postal: companyPostal,
      city: companyCity,
      country: companyCountry || profile?.address_country || '',
      phone: profile?.contact_phone || '',
      displayName: profile?.display_name || '',
      directors: profile?.managing_directors || '',
      vatId: profile?.vat_id || '',
      documentPath: profile?.company_registration_document_path || '',
      representativeName,
      consent: supplierTermsAccepted,
      termsAccepted: supplierTermsAccepted,
      ibanPresent: iban.trim().length > 0 || Boolean(draft.bankSavedAt),
      dateOfBirthPresent: Boolean(parsePayoutWizardDob(repDob)),
    });
    if (blocker) {
      if (/supplier terms/i.test(blocker)) revealFieldErrors({ 'supplier-terms': blocker });
      else setError(blocker);
      return;
    }
    const saved = await persistDraft();
    if (saved === 'failed') return;
    const transitionId = beginAuthTransition({
      intent: 'setup',
      title: 'Submitting your setup...',
      message: 'Sending the company, representative, and payout details.',
    });
    const identityError = await submitIdentity(true);
    if (identityError) {
      setError(identityError);
      failAuthTransition(transitionId, identityError);
      return;
    }
    const bankError = await submitBank(true);
    if (bankError) {
      setError(bankError);
      failAuthTransition(transitionId, bankError);
      return;
    }
    const review = await submitSupplierBusinessForReview(
      userId,
      onboardingBusinessReviewDraft({
        legalName: companyLegal,
        registrationNumber: companyReg,
        street: companyStreet,
        postal: companyPostal,
        city: companyCity,
        country: companyCountry || profile?.address_country || '',
        phone: profile?.contact_phone || '',
        displayName: profile?.display_name || '',
        directors: profile?.managing_directors || representativeName,
        vatId: profile?.vat_id || '',
        documentPath: profile?.company_registration_document_path || '',
        representativeName,
        consent: true,
        termsAccepted: true,
        ibanPresent: true,
        dateOfBirthPresent: true,
      })
    );
    if (!review.ok) {
      setError(review.error);
      failAuthTransition(transitionId, review.error);
      return;
    }
    if (review.profile) onProfile(review.profile);
    writeRepresentativeDob(userId, '');
    setRepDob('');
    const verified = Boolean(review.profile && onboardingLanesVerified(supplierOnboardingSnapshot(review.profile)));
    const copy = supplierSetupCompletionCopy(
      verified,
      'Setup submitted',
      'Your details were sent for review. This does not verify the company or enable payouts.',
    );
    done = true;
    succeedAuthTransition(transitionId, {
      title: copy.title,
      message: copy.message,
      page: 'partner',
      navigate: onExit,
    });
    } finally {
      if (!done) finalizing.current = false;
    }
  };

  const onUpload = async (file: File): Promise<boolean> => {
    if (!canEdit || !userId || docLock.current) return false;
    docLock.current = true;
    setDocumentBusy(true);
    setError(null);
    const up = await uploadSupplierVerificationDocument(userId, file);
    if (!up.path) {
      setDocumentBusy(false);
      docLock.current = false;
      setError(up.error || 'That document could not be uploaded.');
      return false;
    }
    const saved = await patchSupplierProfile(userId, { company_registration_document_path: up.path });
    setDocumentBusy(false);
    docLock.current = false;
    if (!saved.success) {
      setError(saved.error || 'That document could not be saved.');
      return false;
    }
    if (profile) onProfile({ ...profile, company_registration_document_path: up.path });
    return true;
  };

  const onRemoveDocument = async () => {
    const path = profile?.company_registration_document_path?.trim() ?? '';
    if (!canEdit || !userId || !path || docLock.current) return;
    docLock.current = true;
    setDocumentBusy(true);
    setError(null);
    const saved = await patchSupplierProfile(userId, { company_registration_document_path: null });
    if (!saved.success) {
      setDocumentBusy(false);
      docLock.current = false;
      setError(saved.error || 'The document could not be removed.');
      return;
    }
    await removeSupplierVerificationDocumentFile(path);
    setDocumentBusy(false);
    docLock.current = false;
    if (profile) onProfile({ ...profile, company_registration_document_path: null });
  };

  if (!screen) {
    return (
      <div className="partner-unified-setup-shell payout-wizard flex h-full min-h-0 w-full flex-1 items-center justify-center" data-cert="p953" data-onboarding-screen="loading">
        <p className="text-[15px] text-ink/70">Loading your details…</p>
      </div>
    );
  }

  const meta = supplierOnboardingScreen(screen);
  const route = journey.length ? journey : visible;
  const overall = onboardingOverallStep(route, screen);
  const progressPct = (overall.index / Math.max(overall.total, 1)) * 100;
  const verification = supplierVerificationState(profile);
  const companyPresentation = companyOnboardingPresentation({
    verified: (profile?.verification_status ?? '').toLowerCase() === 'verified',
    pendingReview:
      (profile?.verification_status ?? '').toLowerCase() === 'pending' &&
      Boolean((profile?.verification_submitted_at ?? '').trim()),
    hasCompany: Boolean(profile?.company_legal_name?.trim() && profile?.company_registration_number?.trim()),
  });
  const submittedForReview = Boolean((profile?.verification_submitted_at ?? '').trim());
  const companyStatus = (profile?.verification_status ?? '').toLowerCase();
  const correctionOpen = companyStatus === 'rejected' || Boolean((profile?.business_verification_feedback ?? '').trim());
  const draftReview = screen === 'status' && companyStatus !== 'verified' && (!submittedForReview || correctionOpen);
  const title =
    draftReview
      ? 'Review and submit'
      : screen === 'status'
      ? verification.status === 'verified'
        ? 'Verified'
        : verification.status === 'action_required'
          ? 'Action required'
          : verification.status === 'verification_pending'
            ? 'Verification pending'
            : 'Setup submitted'
      : screen === 'company'
        ? companyPresentation.title
        : meta.title;
  const body = draftReview
    ? 'Check the company, documents, representative, and payout details.'
    : screen === 'status'
      ? verification.summary
      : screen === 'company'
        ? companyPresentation.body
        : meta.body;
  const addressLine = [profile?.address_street, profile?.address_postal_code, profile?.address_city, profile?.address_country]
    .filter(Boolean)
    .join(', ');
  const supplierTermsAccepted =
    draft.supplier_terms_version === PARTNER_TERMS_VERSION && Boolean(draft.supplier_terms_accepted_at);
  const reviewBlocker = draftReview
    ? onboardingReviewBlocker({
        legalName: companyLegal,
        registrationNumber: companyReg,
        street: companyStreet,
        postal: companyPostal,
        city: companyCity,
        country: companyCountry || profile?.address_country || '',
        phone: profile?.contact_phone || '',
        displayName: profile?.display_name || '',
        directors: profile?.managing_directors || '',
        vatId: profile?.vat_id || '',
        documentPath: profile?.company_registration_document_path || '',
        representativeName: [draft.rep_first_name, draft.rep_last_name].filter(Boolean).join(' ').trim(),
        consent: supplierTermsAccepted,
        termsAccepted: supplierTermsAccepted,
        ibanPresent: iban.trim().length > 0 || Boolean(draft.bankSavedAt),
        dateOfBirthPresent: Boolean(parsePayoutWizardDob(repDob)),
      })
    : null;
  const primary = draftReview
    ? 'Submit for verification'
    : screen === 'status'
      ? verification.actionLabel ?? 'Done'
      : 'Continue';
  const mandatoryReady = screenReady({
    screen,
    companyLocked,
    companyLegal,
    businessIdError: businessIdError(),
    addressErrors: addressFieldErrors({
      street: companyStreet.trim(),
      postal: companyPostal.trim(),
      city: companyCity.trim(),
      country: companyCountry.trim(),
    }),
    hasFile,
    firstName: draft.rep_first_name,
    lastName: draft.rep_last_name,
    repDob,
    isCompany,
    owns: draft.rep_is_owner,
    shareInput: draft.rep_percent_ownership,
    others,
    owner,
    iban,
    bankSaved: Boolean(draft.bankSavedAt),
    country: normalizeCountryCode(profile?.address_country) || 'FI',
    draftReview,
    reviewBlocked: Boolean(reviewBlocker),
  });

  return (
    <div
      className="partner-unified-setup-shell payout-wizard partner-onboarding-frame flex h-full min-h-0 w-full flex-1 overflow-hidden"
      data-cert="p953"
      data-onboarding-screen={screen}
    >
      <ListingCreationWorkspace
        focused
        title="Get ready to host"
        titleId="supplier-onboarding-title"
        persistLabel={null}
        progressCopy=""
        items={[]}
        navLabel="Setup"
        currentLabel={meta.group}
        onSelectIndex={() => undefined}
        onExit={() => void exitAndSave()}
        headerExit={false}
        exitLabel="Exit & save"
        exitDisabled={busy || documentBusy}
        exitBusy={busy}
        footer={
          <div className="listing-creation-footer-actions flex flex-col gap-2">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[#E6EAF0]"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={Math.max(overall.total, 1)}
              aria-valuenow={overall.index}
              aria-label={`Step ${overall.index} of ${overall.total}`}
            >
              <div
                className="supplier-onboarding-progress h-full bg-[#073b83]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="supplier-onboarding-footer">
              <span className="supplier-onboarding-footer__rail" aria-hidden />
              <div className="supplier-onboarding-footer__actions">
              {previousOnboardingScreen(route, screen) ? (
                <button
                  type="button"
                  className="stay-nav-btn stay-nav-btn--start touch-manipulation tv-btn-ghost !min-h-11 disabled:opacity-40"
                  onClick={() => void back()}
                  disabled={busy || documentBusy}
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  className="stay-nav-btn stay-nav-btn--start touch-manipulation tv-btn-ghost !min-h-11 disabled:opacity-40"
                  onClick={() => void exitAndSave()}
                  disabled={busy || documentBusy}
                >
                  Exit & save
                </button>
              )}
              <button
                type="button"
                className={`stay-nav-btn stay-nav-btn--end touch-manipulation tv-btn-primary !min-h-11 disabled:opacity-50${primary === 'Continue' ? ' supplier-onboarding-continue' : ''}`}
                onClick={() => void onContinue()}
                disabled={busy || documentBusy || !mandatoryReady}
              >
                {busy ? 'Saving…' : primary}
              </button>
              </div>
            </div>
          </div>
        }
      >
        <div className="supplier-onboarding-shell">
          <OnboardingStepper
            phase={meta.phase}
            canSelect={(phase) => canRevisitOnboardingPhase(phase, meta.phase, route)}
            onSelect={(phase) => void openPhase(phase)}
          />
          <div className="supplier-onboarding">
          <header className="supplier-onboarding__head">
            <p className="supplier-onboarding__kicker">Step {overall.index} of {overall.total}</p>
            <h1 className="supplier-onboarding__title">{title}</h1>
          </header>
          <div key={screen} className={`supplier-onboarding-pane supplier-onboarding-pane--${motion}`}>
            {body ? <p className="supplier-onboarding__body">{body}</p> : null}
          {screen === 'company' && (companyPresentation.mode === 'form' || companyPresentation.mode === 'draft') ? (
            <div className="supplier-onboarding-grid">
              <OnboardingField id="company-legal" label="Registered legal business name" error={fieldErrors['company-legal']} className="supplier-onboarding-grid__wide">
                <input className="tv-input" value={companyLegal} aria-invalid={Boolean(fieldErrors['company-legal']) || undefined} onChange={(event) => { companyEdited.current = true; clearFieldError('company-legal'); setCompanyLegal(event.target.value); }} autoComplete="organization" />
              </OnboardingField>
              <OnboardingField
                id="company-reg"
                label="Business ID"
                help="Your official business registration number. In Finland, this is your Y-tunnus."
                error={fieldErrors['company-reg']}
              >
                <input className="tv-input" value={companyReg} aria-invalid={Boolean(fieldErrors['company-reg']) || undefined} onChange={(event) => { companyEdited.current = true; clearFieldError('company-reg'); setCompanyReg(event.target.value); }} inputMode="text" />
              </OnboardingField>
            </div>
          ) : null}
          {screen === 'address' && !companyLocked ? (
            <RegisteredBusinessAddress
              value={{
                street: companyStreet,
                postal: companyPostal,
                city: companyCity,
                country: companyCountry,
              }}
              errors={fieldErrors}
              onChange={(next) => {
                companyEdited.current = true;
                if (next.street !== companyStreet) clearFieldError('address-street');
                if (next.postal !== companyPostal) clearFieldError('address-postal');
                if (next.city !== companyCity) clearFieldError('address-city');
                if (next.country !== companyCountry) clearFieldError('address-country');
                setCompanyStreet(next.street);
                setCompanyPostal(next.postal);
                setCompanyCity(next.city);
                setCompanyCountry(next.country);
              }}
            />
          ) : null}
          {screen === 'address' && companyLocked ? (
            <dl className="supplier-onboarding-facts">
              <div>
                <dt>Registered business address</dt>
                <dd>{addressLine}</dd>
              </div>
            </dl>
          ) : null}
          {screen === 'company' && (companyPresentation.mode === 'verified' || companyPresentation.mode === 'pending') ? (
            <dl className="supplier-onboarding-facts">
              <div>
                <dt>Registered legal business name</dt>
                <dd>{profile?.company_legal_name}</dd>
              </div>
              <div>
                <dt>Business ID</dt>
                <dd>{profile?.company_registration_number}</dd>
              </div>
              <div>
                <dt>Registered business address</dt>
                <dd>{addressLine}</dd>
              </div>
            </dl>
          ) : null}
          {screen === 'documents' ? (
            <div data-field="documents" className={fieldErrors.documents ? 'supplier-onboarding-field--invalid' : undefined}>
            <OnboardingDocumentCard
              country={companyCountry || profile?.address_country || null}
              path={profile?.company_registration_document_path ?? null}
              verificationStatus={profile?.verification_status ?? null}
              submittedAt={profile?.verification_submitted_at ?? null}
              busy={documentBusy}
              error={fieldErrors.documents || error}
              onUpload={onUpload}
              onRemove={onRemoveDocument}
            />
            </div>
          ) : null}
          {screen === 'person' ? (
            <div className="supplier-onboarding-grid">
              <OnboardingField id="rep-first" label="First name" error={fieldErrors['rep-first']}>
                <input
                  className="tv-input"
                  value={draft.rep_first_name}
                  autoComplete="given-name"
                  aria-invalid={Boolean(fieldErrors['rep-first']) || undefined}
                  onChange={(event) => { draftEdited.current = true; clearFieldError('rep-first'); setDraft((current) => ({ ...current, rep_first_name: event.target.value })); }}
                />
              </OnboardingField>
              <OnboardingField id="rep-last" label="Last name" error={fieldErrors['rep-last']}>
                <input
                  className="tv-input"
                  value={draft.rep_last_name}
                  autoComplete="family-name"
                  aria-invalid={Boolean(fieldErrors['rep-last']) || undefined}
                  onChange={(event) => { draftEdited.current = true; clearFieldError('rep-last'); setDraft((current) => ({ ...current, rep_last_name: event.target.value })); }}
                />
              </OnboardingField>
              <OnboardingField id="rep-dob" label="Date of birth" error={fieldErrors['rep-dob']} className="supplier-onboarding-grid__wide">
                <DateOfBirthPicker id="rep-dob" value={repDob} onChange={(value) => { clearFieldError('rep-dob'); writeRepresentativeDob(userId, value); setRepDob(value); }} required aria-invalid={Boolean(fieldErrors['rep-dob'])} />
              </OnboardingField>
            </div>
          ) : null}
          {screen === 'director' ? (
            <div className="supplier-onboarding-grid">
              <div className="supplier-onboarding-grid__wide" data-field="rep-director">
                <p className="supplier-onboarding-field__label">Is this person a director?</p>
                <Choice
                  label="Is this person a director?"
                  value={draft.rep_is_director ? 'yes' : 'no'}
                  yes="Yes, a director"
                  no="No"
                  onChange={(yes) => { draftEdited.current = true; setDraft((current) => ({ ...current, rep_is_director: yes })); }}
                />
              </div>
              <div className="supplier-onboarding-grid__wide" data-field="rep-owner">
                <p className="supplier-onboarding-field__label">Do they own part of the company?</p>
                <Choice
                  label="Do they own part of the company?"
                  value={draft.rep_is_owner ? 'yes' : 'no'}
                  yes="Yes, they own a share"
                  no="No"
                  onChange={(yes) => {
                    draftEdited.current = true;
                    if (!yes) clearFieldError('rep-share');
                    setDraft((current) => ({
                      ...current,
                      rep_is_owner: yes,
                      rep_percent_ownership: yes ? current.rep_percent_ownership : '',
                    }));
                  }}
                />
              </div>
              {draft.rep_is_owner ? (
                <OnboardingField id="rep-share" label="Ownership percent" help="The share of the company this person owns. Use 100 if they own it outright." error={fieldErrors['rep-share']} className="supplier-onboarding-field--short">
                  <OwnershipPercentField
                    value={draft.rep_percent_ownership}
                    invalid={Boolean(fieldErrors['rep-share'])}
                    onChange={(next, error) => {
                      draftEdited.current = true;
                      setFieldErrors((current) => {
                        const updated = { ...current };
                        if (error) updated['rep-share'] = error;
                        else delete updated['rep-share'];
                        return updated;
                      });
                      setDraft((current) => ({ ...current, rep_percent_ownership: next }));
                    }}
                  />
                </OnboardingField>
              ) : null}
            </div>
          ) : null}
          {screen === 'others' ? (
            <div className="supplier-onboarding-grid">
              <div className="supplier-onboarding-grid__wide" data-field="other-owners">
                <p className="supplier-onboarding-field__label">Does anyone else own 25% or more?</p>
                <Choice
                  label="Does anyone else own 25% or more?"
                  value={others == null ? '' : others ? 'yes' : 'no'}
                  yes="Yes, add them"
                  no="No one else"
                  onChange={(yes) => { clearFieldError('other-owners'); setOthers(yes); }}
                />
                {fieldErrors['other-owners'] ? <p className="supplier-onboarding-field__error">{fieldErrors['other-owners']}</p> : null}
              </div>
              {others ? (
                <>
                  <OnboardingField id="owner-first" label="First name" error={fieldErrors['owner-first']}>
                    <input className="tv-input" value={owner.first_name} autoComplete="given-name" aria-invalid={Boolean(fieldErrors['owner-first']) || undefined} onChange={(event) => { clearFieldError('owner-first'); setOwner((current) => ({ ...current, first_name: event.target.value })); }} />
                  </OnboardingField>
                  <OnboardingField id="owner-last" label="Last name" error={fieldErrors['owner-last']}>
                    <input className="tv-input" value={owner.last_name} autoComplete="family-name" aria-invalid={Boolean(fieldErrors['owner-last']) || undefined} onChange={(event) => { clearFieldError('owner-last'); setOwner((current) => ({ ...current, last_name: event.target.value })); }} />
                  </OnboardingField>
                  <OnboardingField id="owner-dob" label="Date of birth" error={fieldErrors['owner-dob']} className="supplier-onboarding-grid__wide">
                    <DateOfBirthPicker value={owner.dob} onChange={(value) => { clearFieldError('owner-dob'); setOwner((current) => ({ ...current, dob: value })); }} required />
                  </OnboardingField>
                  <OnboardingField id="owner-share" label="Ownership percent" help="The share of the company this person owns." error={fieldErrors['owner-share']} className="supplier-onboarding-field--short">
                    <OwnershipPercentField
                      value={owner.percent_ownership}
                      invalid={Boolean(fieldErrors['owner-share'])}
                      onChange={(next, error) => {
                        setFieldErrors((current) => {
                          const updated = { ...current };
                          if (error) updated['owner-share'] = error;
                          else delete updated['owner-share'];
                          return updated;
                        });
                        setOwner((current) => ({ ...current, percent_ownership: next }));
                      }}
                    />
                  </OnboardingField>
                </>
              ) : null}
            </div>
          ) : null}
          {screen === 'bank' ? (
            <div className="supplier-onboarding-grid">
              {profile?.company_legal_name ? (
                <p className="supplier-onboarding-grid__wide text-[15px] font-semibold text-ink">{profile.company_legal_name}</p>
              ) : null}
              <OnboardingField
                id="iban"
                label="IBAN"
                error={fieldErrors.iban}
                className="supplier-onboarding-grid__wide"
              >
                <input
                  className="tv-input"
                  value={iban}
                  autoComplete="off"
                  placeholder="FI00 0000 0000 0000 00"
                  aria-invalid={Boolean(fieldErrors.iban) || undefined}
                  onChange={(event) => { clearFieldError('iban'); setIban(event.target.value); }}
                />
              </OnboardingField>
            </div>
          ) : null}
          {screen === 'status' && draftReview ? (
            <div className="supplier-review">
              <ReviewSection title="Company" detail={[profile?.company_legal_name, profile?.company_registration_number, addressLine].filter(Boolean).join(' · ') || 'Not added yet'} onEdit={() => editStep('company')} />
              <ReviewSection title="Documents" detail={profile?.company_registration_document_path ? 'Registration extract uploaded' : 'Not uploaded'} onEdit={() => editStep('documents')} />
              <ReviewSection title="Identity" detail={[draft.rep_first_name, draft.rep_last_name].filter(Boolean).join(' ') || 'Not added yet'} onEdit={() => editStep('person')} />
              <ReviewSection title="Payouts" detail={iban.trim() ? `IBAN ending ${iban.replace(/\s/g, '').slice(-4)}` : draft.bankLast4 ? `Account ending ${draft.bankLast4}` : draft.bankSavedAt ? 'Payout account saved' : 'Not added yet'} onEdit={() => editStep('bank')} />
              <label className={`supplier-onboarding-choice${fieldErrors['supplier-terms'] ? ' supplier-onboarding-field--invalid' : ''}`} data-field="supplier-terms">
                <input
                  type="checkbox"
                  checked={supplierTermsAccepted}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    draftEdited.current = true;
                    clearFieldError('supplier-terms');
                    setDraft((current) => {
                      const updated = {
                        ...current,
                        verification_consent: checked,
                        supplier_terms_version: checked ? PARTNER_TERMS_VERSION : null,
                        supplier_terms_accepted_at: checked ? new Date().toISOString() : null,
                      };
                      draftRef.current = updated;
                      return updated;
                    });
                  }}
                />
                <span>
                  I have read and agree to the{' '}
                  <a href={PARTNER_TERMS_OF_SERVICE_PATH} target="_blank" rel="noreferrer">
                    Traverion Supplier Terms
                  </a>
                  .
                </span>
              </label>
              {fieldErrors['supplier-terms'] ? <p className="supplier-onboarding-field__error">{fieldErrors['supplier-terms']}</p> : null}
              {reviewBlocker && !fieldErrors['supplier-terms'] ? <p className="text-sm text-ink/70">{reviewBlocker}</p> : null}
            </div>
          ) : null}
          {screen === 'status' && !draftReview ? (
            <div className="supplier-onboarding-card supplier-onboarding-card--review">
              {verification.requirements.map((item) => (
                <p key={item}>{item}</p>
              ))}
              <p className="supplier-onboarding__body">{verification.next}</p>
            </div>
          ) : null}
          {error && screen !== 'documents' ? (
            <p className="supplier-onboarding-error" role="alert">
              {error}
            </p>
          ) : null}
          </div>
          </div>
        </div>
      </ListingCreationWorkspace>
    </div>
  );
}

function screenReady(input: {
  screen: SupplierOnboardingScreenId;
  companyLocked: boolean;
  companyLegal: string;
  businessIdError: string | null;
  addressErrors: Record<string, string>;
  hasFile: boolean;
  firstName: string;
  lastName: string;
  repDob: string;
  isCompany: boolean;
  owns: boolean;
  shareInput: string;
  others: boolean | null;
  owner: { first_name: string; last_name: string; dob: string; percent_ownership: string };
  iban: string;
  bankSaved: boolean;
  country: string;
  draftReview: boolean;
  reviewBlocked: boolean;
}): boolean {
  if (input.screen === 'company') {
    if (input.companyLocked) return true;
    return input.companyLegal.trim().length > 0 && input.businessIdError == null;
  }
  if (input.screen === 'address') {
    if (input.companyLocked) return true;
    return Object.keys(input.addressErrors).length === 0;
  }
  if (input.screen === 'documents') return input.hasFile;
  if (input.screen === 'person') {
    return (
      input.firstName.trim().length > 0 &&
      input.lastName.trim().length > 0 &&
      validateIsoDob(input.repDob, { required: true }) == null
    );
  }
  if (input.screen === 'director') {
    if (!(input.isCompany && input.owns)) return true;
    return validateOwnershipPercent(input.shareInput, { required: true }) == null;
  }
  if (input.screen === 'others') {
    if (input.others == null) return false;
    if (!input.others) return true;
    const percent = parseOwnershipPercent(input.owner.percent_ownership);
    return (
      input.owner.first_name.trim().length > 0 &&
      input.owner.last_name.trim().length > 0 &&
      validateIsoDob(input.owner.dob, { required: true }) == null &&
      percent != null &&
      percent > 0 &&
      validateOwnershipPercent(input.owner.percent_ownership, { required: true }) == null
    );
  }
  if (input.screen === 'bank') {
    if (!input.iban.trim() && input.bankSaved) return true;
    return validateIban(input.iban, input.country) == null;
  }
  if (input.draftReview) return !input.reviewBlocked;
  return true;
}

function progressRecord(
  profile: SupplierProfileRow | null,
  next: SupplierOnboardingScreenId,
  exited = false
) {
  const existing =
    profile?.setup_progress && typeof profile.setup_progress === 'object' && !Array.isArray(profile.setup_progress)
      ? profile.setup_progress
      : {};
  return {
    ...existing,
    version: 1,
    phase: supplierOnboardingScreen(next).phase,
    screen: next,
    exited,
    payout_step: wizardStepForScreen(next),
    updated_at: new Date().toISOString(),
  };
}

function wizardStepForScreen(id: SupplierOnboardingScreenId): PayoutWizardStepId {
  const phase = supplierOnboardingScreen(id).phase;
  if (phase === 'representative') return 'representative';
  if (phase === 'payout') return 'bank';
  if (phase === 'status') return 'review';
  return 'business';
}

function FieldHelp({ label, text }: { label: string; text: string }) {
  return (
    <button type="button" className="supplier-onboarding-help" aria-label={label}>
      ?
      <span className="supplier-onboarding-help__tip" role="tooltip">
        {text}
      </span>
    </button>
  );
}

function OwnershipPercentField({
  value,
  invalid,
  onChange,
}: {
  value: string;
  invalid?: boolean;
  onChange: (next: string, error: string | null) => void;
}) {
  const apply = (raw: string, input?: HTMLInputElement) => {
    const next = nextOwnershipPercentInput(value, raw);
    if (input && next.value === value) input.value = value;
    onChange(next.value, next.error);
  };
  return (
    <div className="supplier-onboarding-percent">
      <input
        className="tv-input"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(event) => apply(event.target.value, event.target)}
        onPaste={(event) => {
          event.preventDefault();
          apply(event.clipboardData.getData('text'), event.currentTarget);
        }}
      />
      <span className="supplier-onboarding-percent__suffix" aria-hidden>
        %
      </span>
    </div>
  );
}

function OnboardingField({
  id,
  label,
  help,
  error,
  className,
  children,
}: {
  id?: string;
  label: string;
  help?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`supplier-onboarding-field${error ? ' supplier-onboarding-field--invalid' : ''}${className ? ` ${className}` : ''}`}
      data-field={id}
    >
      <div className="supplier-onboarding-field__label">
        <span>{label}</span>
        {help ? <FieldHelp label={`About ${label}`} text={help} /> : null}
      </div>
      {children}
      {error ? <p className="supplier-onboarding-field__error">{error}</p> : null}
    </div>
  );
}

function Choice({
  label,
  value,
  yes,
  no,
  onChange,
}: {
  label: string;
  value: 'yes' | 'no' | '';
  yes: string;
  no: string;
  onChange: (yes: boolean) => void;
}) {
  return (
    <div className="supplier-onboarding-choices" role="radiogroup" aria-label={label}>
      {([true, false] as const).map((isYes) => {
        const selected = value === (isYes ? 'yes' : 'no');
        return (
          <button
            key={isYes ? 'yes' : 'no'}
            type="button"
            role="radio"
            className={`lc-choice supplier-onboarding-choice min-h-11 rounded-xl px-3.5 text-left text-sm font-semibold text-ink ${selected ? 'lc-choice--selected' : ''}`}
            aria-checked={selected}
            data-selected={selected ? 'true' : 'false'}
            onClick={() => onChange(isYes)}
          >
            <span className="supplier-onboarding-choice__mark" aria-hidden />
            {isYes ? yes : no}
          </button>
        );
      })}
    </div>
  );
}

function onboardingDraftSignature(current: PayoutWizardDraft): string {
  const payload = toServerPayoutWizardDraft({
    ...current,
    rep_dob: '',
    beneficial_owners: current.beneficial_owners.map((row) => ({ ...row, dob: '' })),
  });
  const { step: _step, ...rest } = payload;
  return JSON.stringify(rest);
}

function initialDraft(userId: string, profile: SupplierProfileRow | null): PayoutWizardDraft {
  const saved = userId ? loadPayoutWizardDraft(userId) : null;
  const suggested = suggestRepresentativeNameFromDirectors(profile?.managing_directors);
  let merged = emptyPayoutWizardDraft({
    ...(saved ?? {}),
    tos_accepted: false,
    verification_consent: false,
    rep_dob: '',
  });
  merged = mergeServerPayoutWizardDraft(merged, profile?.payout_wizard_draft ?? null, {
    serverUpdatedAt: profile?.payout_wizard_draft_updated_at,
    localUpdatedAt: saved?.updatedAt ?? null,
  });
  if (!merged.rep_first_name.trim() && suggested?.first_name) merged.rep_first_name = suggested.first_name;
  if (!merged.rep_last_name.trim() && suggested?.last_name) merged.rep_last_name = suggested.last_name;
  merged.rep_dob = '';
  merged.beneficial_owners = merged.beneficial_owners.map((row) => ({ ...row, dob: '' }));
  return merged;
}
