import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import DateOfBirthPicker from './DateOfBirthPicker';
import RegisteredBusinessAddress from './RegisteredBusinessAddress';
import { ListingCreationWorkspace } from './listing-creation/ListingCreationWorkspace';
import {
  fetchSupplierProfile,
  invalidateSupplierProfileCache,
  patchSupplierProfile,
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
  BUSINESS_ADDRESS_FIELD_ERROR,
  missingBusinessAddressField,
  type StructuredBusinessAddress,
} from '../../lib/business-address';
import { validateIsoDob } from '../../lib/date-of-birth';
import {
  emptyBeneficialOwner,
  emptyPayoutWizardDraft,
  loadPayoutWizardDraft,
  mergeServerPayoutWizardDraft,
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
  onboardingGroupProgress,
  requirementFlags,
  screenFromOnboardingUrl,
  supplierOnboardingScreen,
  visibleSupplierOnboardingScreens,
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
  const [repDob, setRepDob] = useState('');
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const booted = useRef(false);
  const submitting = useRef(false);
  const navigating = useRef(false);

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
    const next = visible.includes(requested) || requested === 'company' || requested === 'documents' ? requested : resume;
    setScreen(next);
    writeScreen(next, 'replace');
    if (userId) void updateSupplierSetupProgress(userId, progressRecord(profile, next));
    // The first saved step is chosen once. Later edits must not jump the supplier back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPop = () => {
      const requested = screenFromOnboardingUrl(window.location.search, visible);
      setScreen(visible.includes(requested) ? requested : snapshot.nextScreen);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [visible, snapshot.nextScreen]);


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
    if (!userId) return;
    const stored = { ...draft, rep_dob: '', beneficial_owners: draft.beneficial_owners.map((row) => ({ ...row, dob: '' })) };
    savePayoutWizardDraft(userId, stored);
    const timer = window.setTimeout(() => {
      void invokeConnectSupplierOnboarding('save_wizard_draft', {
        wizard_draft: toServerPayoutWizardDraft(stored),
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [userId, draft]);

  const go = (next: SupplierOnboardingScreenId) => {
    setError(null);
    const step = wizardStepForScreen(next);
    setDraft((current) => {
      const updated = { ...current, step };
      savePayoutWizardDraft(userId, updated);
      return updated;
    });
    setScreen(next);
    writeScreen(next, 'push');
    void updateSupplierSetupProgress(userId, progressRecord(profile, next));
  };

  const sequence = (patch?: Partial<SupplierOnboardingVisibility>) =>
    visibleSupplierOnboardingScreens({ ...visibility, ...patch });

  const advance = (id: SupplierOnboardingScreenId, patch?: Partial<SupplierOnboardingVisibility>) => {
    const list = sequence(patch);
    const index = list.indexOf(id);
    if (index === -1) {
      go(list.includes('bank') ? 'bank' : 'status');
      return;
    }
    go(list[index + 1] ?? 'status');
  };

  const saveCompany = async (): Promise<boolean> => {
    const legal = companyLegal.trim();
    const countryCode = normalizeCountryCode(companyCountry);
    const registration = countryCode === 'FI' ? normalizeFinnishBusinessId(companyReg) : companyReg.trim();
    const address: StructuredBusinessAddress = {
      street: companyStreet.trim(),
      postal: companyPostal.trim(),
      city: companyCity.trim(),
      country: companyCountry.trim(),
    };
    const missingAddress = missingBusinessAddressField(address);
    if (!legal) {
      setError('Enter the registered legal name.');
      return false;
    }
    if (!companyCountry.trim()) {
      setError(BUSINESS_ADDRESS_FIELD_ERROR.country);
      return false;
    }
    if (countryCode === 'FI' && !isValidFinnishBusinessId(registration)) {
      setError('Enter a valid Finnish business ID.');
      return false;
    }
    if (countryCode !== 'FI' && registration.length < 3) {
      setError('Enter the business registration number.');
      return false;
    }
    if (missingAddress) {
      setError(BUSINESS_ADDRESS_FIELD_ERROR[missingAddress]);
      return false;
    }
    setBusy(true);
    setError(null);
    const saved = await updateSupplierCompanyProfile(userId, {
      company_legal_name: legal,
      company_registration_number: registration,
      address_street: address.street,
      address_city: address.city,
      address_postal_code: address.postal,
      address_country: address.country,
      business_type: profile?.business_type === 'individual' ? 'individual' : 'company',
    });
    setBusy(false);
    if (!saved.success) {
      setError(saved.error || 'The company details could not be saved.');
      return false;
    }
    const next = await fetchSupplierProfile(userId);
    if (next) onProfile(next);
    return Boolean(next?.company_legal_name?.trim());
  };

  const exitAndSave = async () => {
    if (!screen || busy) return;
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
    if (screen === 'company' && companyOpen) {
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
    const stored = {
      ...draft,
      rep_dob: '',
      beneficial_owners: draft.beneficial_owners.map((row) => ({ ...row, dob: '' })),
    };
    savePayoutWizardDraft(userId, stored);
    const draftSaved = await invokeConnectSupplierOnboarding('save_wizard_draft', {
      wizard_draft: toServerPayoutWizardDraft(stored),
    });
    if (!draftSaved.success) {
      setBusy(false);
      setError(connectOnboardingUserMessage(draftSaved.error) || 'Progress could not be saved. Your entries are still on this page.');
      return;
    }
    const progressSaved = await updateSupplierSetupProgress(userId, progressRecord(profile, screen));
    if (!progressSaved.success) {
      setBusy(false);
      setError(progressSaved.error || 'Progress could not be saved. Your entries are still on this page.');
      return;
    }
    setBusy(false);
    onExit();
  };

  const back = () => {
    if (window.history.state?.onboardingScreen) {
      window.history.back();
      return;
    }
    if (screen === 'documents') {
      go('company');
      return;
    }
    const index = visible.indexOf(screen!);
    if (index > 0) go(visible[index - 1]!);
  };

  const onContinue = async () => {
    if (busy || submitting.current || navigating.current) return;
    navigating.current = true;
    window.setTimeout(() => {
      navigating.current = false;
    }, 600);
    if (!canEdit && screen !== 'company' && screen !== 'status') {
      setError('Your role can view setup but cannot change it.');
      return;
    }
    if (screen === 'company') {
      const presentation = companyOnboardingPresentation({
        verified: (profile?.verification_status ?? '').toLowerCase() === 'verified',
        pendingReview:
          (profile?.verification_status ?? '').toLowerCase() === 'pending' &&
          Boolean((profile?.verification_submitted_at ?? '').trim()),
        hasCompany: Boolean(profile?.company_legal_name?.trim() && profile?.company_registration_number?.trim()),
      });
      if (presentation.mode === 'verified' || presentation.mode === 'pending') {
        advance('company');
        return;
      }
      const ok = await saveCompany();
      if (ok) advance('company');
      return;
    }
    if (screen === 'documents') {
      if (!hasFile) {
        setError('Add the registration document.');
        return;
      }
      const list = sequence();
      const afterCompany = list[list.indexOf('company') + 1] ?? 'status';
      go(afterCompany === 'documents' ? list[list.indexOf('documents') + 1] ?? 'status' : afterCompany);
      return;
    }
    if (screen === 'person') {
      if (!draft.rep_first_name.trim() || !draft.rep_last_name.trim()) {
        setError('Enter the first and last name.');
        return;
      }
      advance('person');
      return;
    }
    if (screen === 'dob') {
      const dobErr = validateIsoDob(repDob, { required: true });
      if (dobErr) {
        setError(dobErr);
        return;
      }
      advance('dob');
      return;
    }
    if (screen === 'director') {
      advance('director');
      return;
    }
    if (screen === 'ownership') {
      advance('ownership', { owns: draft.rep_is_owner });
      return;
    }
    if (screen === 'share') {
      const percentErr = validateOwnershipPercent(draft.rep_percent_ownership, { required: true });
      if (percentErr || share == null || share <= 0) {
        setError(percentErr ?? 'Enter a share between 1 and 100.');
        return;
      }
      if (share === 100) setOthers(false);
      advance('share', { owns: true, share, others: share === 100 ? false : others });
      return;
    }
    if (screen === 'others') {
      if (others == null) {
        setError('Choose yes or no.');
        return;
      }
      advance('others', { others });
      return;
    }
    if (screen === 'owner') {
      const percentErr = validateOwnershipPercent(owner.percent_ownership, { required: true });
      const dobErr = validateIsoDob(owner.dob, { required: true });
      if (!owner.first_name.trim() || !owner.last_name.trim() || dobErr || percentErr) {
        setError(dobErr || percentErr || 'Enter the owner’s name, date of birth, and share.');
        return;
      }
      setDraft((current) => ({
        ...current,
        beneficial_owners: [
          emptyBeneficialOwner({
            first_name: owner.first_name.trim(),
            last_name: owner.last_name.trim(),
            percent_ownership: owner.percent_ownership,
            dob: '',
          }),
        ],
      }));
      advance('owner', { others: true, hasExtraOwner: true });
      return;
    }
    if (screen === 'consent') {
      if (!draft.verification_consent) {
        setError('Confirm that Traverion may send these details.');
        return;
      }
      const ok = await submitIdentity();
      if (ok) advance('consent', { identityOpen: false });
      return;
    }
    if (screen === 'bank') {
      const ibanError = validateIban(iban, normalizeCountryCode(profile?.address_country) || 'FI');
      if (ibanError) {
        setError(ibanError);
        return;
      }
      if (!flags.termsOpen) {
        const ok = await submitBank();
        if (ok) advance('bank', { bankOpen: false });
        return;
      }
      advance('bank');
      return;
    }
    if (screen === 'terms') {
      if (!draft.tos_accepted) {
        setError('Accept the terms before the bank account is sent.');
        return;
      }
      const ok = await submitBank();
      if (ok) advance('terms', { bankOpen: false, termsOpen: false });
      return;
    }
    if (verification.actionLabel) go(snapshot.nextScreen);
    else onExit();
  };

  const submitIdentity = async (): Promise<boolean> => {
    if (submitting.current) return false;
    const dob = parsePayoutWizardDob(repDob);
    if (!dob) {
      setError('Enter a valid date of birth.');
      return false;
    }
    const country = normalizeCountryCode(profile?.address_country || '') || 'FI';
    if (isCompany && country === 'FI' && !isValidFinnishBusinessId(profile?.company_registration_number)) {
      setError('The Finnish Business ID on the company record needs to be corrected before it can be sent.');
      return false;
    }
    if (!hasAccount) {
      const ensured = await invokeConnectSupplierOnboarding('ensure_account');
      if (!ensured.success) {
        setError(connectOnboardingUserMessage(ensured.error) || 'A payout account could not be opened yet.');
        return false;
      }
      const refreshed = await fetchSupplierProfile(userId);
      if (refreshed) onProfile(refreshed);
      if (!refreshed?.stripe_connected_account_id) {
        setError('A payout account could not be opened yet.');
        return false;
      }
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    const transitionId = beginAuthTransition({
      intent: 'setup',
      title: 'Sending your details...',
      message: 'One moment.',
    });
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
    if (!business.success) {
      setBusy(false);
      submitting.current = false;
      const message = connectOnboardingUserMessage(business.error);
      setError(message);
      failAuthTransition(transitionId, message);
      return false;
    }
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
    if (!person.success) {
      setBusy(false);
      submitting.current = false;
      const message = connectOnboardingUserMessage(person.error);
      setError(message);
      failAuthTransition(transitionId, message);
      return false;
    }
    if (others && owner.first_name.trim()) {
      const ownerDob = parsePayoutWizardDob(owner.dob);
      const ownerShare = parseOwnershipPercent(owner.percent_ownership);
      if (!ownerDob || ownerShare == null) {
        setBusy(false);
        submitting.current = false;
        setError('Check the additional owner’s date of birth and share, then try again.');
        return false;
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
      if (!owners.success) {
        setBusy(false);
        submitting.current = false;
        const message = connectOnboardingUserMessage(owners.error);
        setError(message);
        failAuthTransition(transitionId, message);
        return false;
      }
    }
    const next = await fetchSupplierProfile(userId);
    if (next) onProfile(next);
    setDraft((current) => ({ ...current, representativeSavedAt: new Date().toISOString(), rep_dob: '' }));
    setRepDob('');
    setBusy(false);
    submitting.current = false;
    finishSupplierSetupStep(
      transitionId,
      next,
      'Verification sent',
      'We have your details for review. This is not an approval.',
    );
    return true;
  };

  const submitBank = async (): Promise<boolean> => {
    if (submitting.current) return false;
    const country = normalizeCountryCode(profile?.address_country) || 'FI';
    const holder = (profile?.company_legal_name || '').trim();
    const ibanError = validateIban(iban, country);
    if (!holder || ibanError) {
      setError(ibanError ?? 'The company legal name is missing.');
      return false;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    const transitionId = beginAuthTransition({
      intent: 'setup',
      title: 'Saving your payout account...',
      message: 'One moment.',
    });
    if (flags.termsOpen) {
      const terms = await invokeConnectSupplierOnboarding('accept_tos', {
        tos_accepted: true,
        agreement_version: STRIPE_RECIPIENT_AGREEMENT.version,
      });
      if (!terms.success) {
        setBusy(false);
        submitting.current = false;
        const message = connectOnboardingUserMessage(terms.error);
        setError(message);
        failAuthTransition(transitionId, message);
        return false;
      }
      setDraft((current) => ({ ...current, tos_accepted: true }));
    }
    const tokenized = await createBankAccountToken({
      country,
      currency: profile?.connect_default_currency || 'eur',
      accountNumber: iban,
      accountHolderName: holder,
      accountHolderType: isCompany ? 'company' : 'individual',
    });
    if ('error' in tokenized) {
      setBusy(false);
      submitting.current = false;
      setError(tokenized.error);
      failAuthTransition(transitionId, tokenized.error);
      return false;
    }
    const attached = await invokeConnectSupplierOnboarding('attach_bank_token', {
      bank_token: tokenized.tokenId,
    });
    setIban('');
    if (!attached.success) {
      setBusy(false);
      submitting.current = false;
      const message = connectOnboardingUserMessage(attached.error);
      setError(message);
      failAuthTransition(transitionId, message);
      return false;
    }
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
    finishSupplierSetupStep(
      transitionId,
      next,
      'Payout account saved',
      'The account is saved. This does not enable payouts or approve the company.',
    );
    return true;
  };

  const onUpload = async (file: File | null) => {
    if (!file || !canEdit || !userId) return;
    setBusy(true);
    setError(null);
    const transitionId = beginAuthTransition({
      intent: 'setup',
      title: 'Uploading your document...',
      message: 'One moment.',
    });
    const up = await uploadSupplierVerificationDocument(userId, file);
    if (!up.path) {
      setBusy(false);
      setError('That document could not be uploaded.');
      failAuthTransition(transitionId, 'That document could not be uploaded.');
      return;
    }
    const saved = await patchSupplierProfile(userId, { company_registration_document_path: up.path });
    if (!saved.success) {
      setBusy(false);
      setError('That document could not be saved.');
      failAuthTransition(transitionId, 'That document could not be saved.');
      return;
    }
    const next = await fetchSupplierProfile(userId);
    if (next) onProfile(next);
    setBusy(false);
    finishSupplierSetupStep(
      transitionId,
      next,
      'Verification sent',
      'The document is saved for review. This is not an approval.',
    );
  };

  if (!screen) {
    return (
      <div className="partner-unified-setup-shell payout-wizard flex h-full min-h-0 w-full flex-1 items-center justify-center" data-cert="p953" data-onboarding-screen="loading">
        <p className="text-[15px] text-ink/70">Loading your details…</p>
      </div>
    );
  }

  const meta = supplierOnboardingScreen(screen);
  const progress = onboardingGroupProgress(
    screen === 'documents' ? ['company', 'documents', ...visible.filter((id) => id !== 'company')] : visible,
    screen === 'documents' ? 'documents' : visible.includes(screen) ? screen : visible[0] ?? 'company'
  );
  const verification = supplierVerificationState(profile);
  const companyPresentation = companyOnboardingPresentation({
    verified: (profile?.verification_status ?? '').toLowerCase() === 'verified',
    pendingReview:
      (profile?.verification_status ?? '').toLowerCase() === 'pending' &&
      Boolean((profile?.verification_submitted_at ?? '').trim()),
    hasCompany: Boolean(profile?.company_legal_name?.trim() && profile?.company_registration_number?.trim()),
  });
  const title =
    screen === 'status'
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
  const body = screen === 'status' ? verification.summary : screen === 'company' ? companyPresentation.body : meta.body;
  const addressLine = [profile?.address_street, profile?.address_postal_code, profile?.address_city, profile?.address_country]
    .filter(Boolean)
    .join(', ');
  const primary =
    screen === 'status'
      ? verification.actionLabel ?? 'Done'
      : screen === 'bank' && !flags.termsOpen
        ? 'Save bank account'
      : screen === 'consent'
        ? 'Send for verification'
        : screen === 'terms'
          ? 'Save bank account'
          : 'Continue';

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
        exitLabel="Exit & save"
        exitDisabled={busy}
        exitBusy={busy}
        footer={
          <div className="listing-creation-footer-actions flex flex-col gap-2">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[#E6EAF0]"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={Math.max(progress.total, 1)}
              aria-valuenow={progress.index}
              aria-label={`${progress.group}, step ${progress.index} of ${progress.total}`}
            >
              <div
                className="h-full bg-[#073b83] transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${(progress.index / Math.max(progress.total, 1)) * 100}%` }}
              />
            </div>
            <div className="supplier-onboarding-footer grid grid-cols-[1fr_auto] items-center gap-3">
              <button
                type="button"
                className="stay-nav-btn stay-nav-btn--start touch-manipulation tv-btn-ghost !min-h-11 disabled:opacity-40"
                onClick={back}
                disabled={busy || screen === 'company' || screen === visible[0]}
              >
                Back
              </button>
              <button
                type="button"
                className="stay-nav-btn stay-nav-btn--end touch-manipulation tv-btn-primary !min-h-11 disabled:opacity-50"
                onClick={() => void onContinue()}
                disabled={busy}
              >
                {busy ? 'Saving…' : primary}
              </button>
            </div>
          </div>
        }
      >
        <div key={screen} className="supplier-onboarding onboarding-step">
          <header className="supplier-onboarding__head">
            <ol className="supplier-onboarding-steps" aria-label="Setup progress">
              {(['Company', 'Documents', 'Representative', 'Payouts', 'Review'] as const).map((label, index) => {
                const current =
                  (meta.phase === 'business' && index === 0) ||
                  (meta.phase === 'documents' && index === 1) ||
                  (meta.phase === 'representative' && index === 2) ||
                  (meta.phase === 'payout' && index === 3) ||
                  (meta.phase === 'status' && index === 4);
                const done =
                  (meta.phase === 'documents' && index < 1) ||
                  (meta.phase === 'representative' && index < 2) ||
                  (meta.phase === 'payout' && index < 3) ||
                  (meta.phase === 'status' && index < 4);
                return (
                  <li key={label} className={done ? 'is-done' : undefined} aria-current={current ? 'step' : undefined}>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>
            <p className="supplier-onboarding__kicker">
              {progress.group} · {progress.index} of {progress.total}
            </p>
            <h1 className="supplier-onboarding__title">{title}</h1>
            <p className="supplier-onboarding__body">{body}</p>
          </header>
          {screen === 'company' && (companyPresentation.mode === 'form' || companyPresentation.mode === 'draft') ? (
            <div className="supplier-onboarding-grid">
              <OnboardingField label="Registered legal business name" className="supplier-onboarding-grid__wide">
                <input className="tv-input" value={companyLegal} onChange={(event) => setCompanyLegal(event.target.value)} autoComplete="organization" />
              </OnboardingField>
              <OnboardingField
                label="Business ID"
                help="Your official business registration number. In Finland, this is your Y-tunnus."
              >
                <input className="tv-input" value={companyReg} onChange={(event) => setCompanyReg(event.target.value)} inputMode="text" />
              </OnboardingField>
              <RegisteredBusinessAddress
                value={{
                  street: companyStreet,
                  postal: companyPostal,
                  city: companyCity,
                  country: companyCountry,
                }}
                onChange={(next) => {
                  setCompanyStreet(next.street);
                  setCompanyPostal(next.postal);
                  setCompanyCity(next.city);
                  setCompanyCountry(next.country);
                }}
              />
            </div>
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
            <div className="supplier-onboarding-card">
              {hasFile ? (
                <p className="text-[15px] font-semibold text-ink">Registration document is on file.</p>
              ) : (
                <OnboardingField label="Registration document" help="A trade register extract or the equivalent official document.">
                  <input
                    className="supplier-onboarding-file"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(event) => void onUpload(event.target.files?.[0] ?? null)}
                  />
                </OnboardingField>
              )}
            </div>
          ) : null}
          {screen === 'person' ? (
            <div className="supplier-onboarding-grid">
              <OnboardingField label="First name">
                <input
                  className="tv-input"
                  value={draft.rep_first_name}
                  autoComplete="given-name"
                  onChange={(event) => setDraft((current) => ({ ...current, rep_first_name: event.target.value }))}
                />
              </OnboardingField>
              <OnboardingField label="Last name">
                <input
                  className="tv-input"
                  value={draft.rep_last_name}
                  autoComplete="family-name"
                  onChange={(event) => setDraft((current) => ({ ...current, rep_last_name: event.target.value }))}
                />
              </OnboardingField>
            </div>
          ) : null}
          {screen === 'dob' ? (
            <OnboardingField label="Date of birth" help="Used to confirm this person. Traverion does not keep the date.">
              <DateOfBirthPicker value={repDob} onChange={setRepDob} required />
            </OnboardingField>
          ) : null}
          {screen === 'director' ? (
            <Choice
              value={draft.rep_is_director ? 'yes' : 'no'}
              yes="Yes, this person is a director"
              no="No"
              onChange={(yes) => setDraft((current) => ({ ...current, rep_is_director: yes }))}
            />
          ) : null}
          {screen === 'ownership' ? (
            <Choice
              value={draft.rep_is_owner ? 'yes' : 'no'}
              yes="Yes, they own a share"
              no="No"
              onChange={(yes) => setDraft((current) => ({ ...current, rep_is_owner: yes }))}
            />
          ) : null}
          {screen === 'share' ? (
            <OnboardingField label="Ownership percent" help="The share of the company this person owns. Use 100 if they own it outright." className="supplier-onboarding-field--short">
              <input
                className="tv-input"
                inputMode="decimal"
                value={draft.rep_percent_ownership}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, rep_percent_ownership: event.target.value }))
                }
              />
            </OnboardingField>
          ) : null}
          {screen === 'others' ? (
            <Choice
              value={others == null ? '' : others ? 'yes' : 'no'}
              yes="Yes, add them"
              no="No one else"
              onChange={(yes) => setOthers(yes)}
            />
          ) : null}
          {screen === 'owner' ? (
            <div className="supplier-onboarding-grid">
              <OnboardingField label="First name">
                <input
                  className="tv-input"
                  value={owner.first_name}
                  autoComplete="given-name"
                  onChange={(event) => setOwner((current) => ({ ...current, first_name: event.target.value }))}
                />
              </OnboardingField>
              <OnboardingField label="Last name">
                <input
                  className="tv-input"
                  value={owner.last_name}
                  autoComplete="family-name"
                  onChange={(event) => setOwner((current) => ({ ...current, last_name: event.target.value }))}
                />
              </OnboardingField>
              <OnboardingField label="Date of birth" help="Used to confirm this owner. Traverion does not keep the date." className="supplier-onboarding-grid__wide">
                <DateOfBirthPicker
                  value={owner.dob}
                  onChange={(value) => setOwner((current) => ({ ...current, dob: value }))}
                  required
                />
              </OnboardingField>
              <OnboardingField label="Ownership percent" help="The share of the company this person owns." className="supplier-onboarding-field--short">
                <input
                  className="tv-input"
                  inputMode="decimal"
                  value={owner.percent_ownership}
                  onChange={(event) => setOwner((current) => ({ ...current, percent_ownership: event.target.value }))}
                />
              </OnboardingField>
            </div>
          ) : null}
          {screen === 'consent' ? (
            <label className="supplier-onboarding-choice">
              <input
                type="checkbox"
                checked={draft.verification_consent}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, verification_consent: event.target.checked }))
                }
              />
              Send for verification
            </label>
          ) : null}
          {screen === 'bank' ? (
            <div className="supplier-onboarding-grid">
              {profile?.company_legal_name ? (
                <p className="supplier-onboarding-grid__wide text-[15px] font-semibold text-ink">{profile.company_legal_name}</p>
              ) : null}
              <OnboardingField
                label="IBAN"
                help="The company account that receives payouts. The full number is sent securely and is not shown again."
                className="supplier-onboarding-grid__wide"
              >
                <input
                  className="tv-input"
                  value={iban}
                  autoComplete="off"
                  placeholder="FI00 0000 0000 0000 00"
                  onChange={(event) => setIban(event.target.value)}
                />
              </OnboardingField>
            </div>
          ) : null}
          {screen === 'terms' ? (
            <label className="supplier-onboarding-choice">
              <input
                type="checkbox"
                checked={draft.tos_accepted}
                onChange={(event) => setDraft((current) => ({ ...current, tos_accepted: event.target.checked }))}
              />
              Accept the terms
            </label>
          ) : null}
          {screen === 'status' ? (
            <div className="supplier-onboarding-card supplier-onboarding-card--review">
              {verification.requirements.map((item) => (
                <p key={item}>{item}</p>
              ))}
              <p className="supplier-onboarding__body">{verification.next}</p>
            </div>
          ) : null}
          {error ? (
            <p className="supplier-onboarding-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </ListingCreationWorkspace>
    </div>
  );
}

function progressRecord(profile: SupplierProfileRow | null, next: SupplierOnboardingScreenId) {
  const existing =
    profile?.setup_progress && typeof profile.setup_progress === 'object' && !Array.isArray(profile.setup_progress)
      ? profile.setup_progress
      : {};
  return {
    ...existing,
    version: 1,
    phase: supplierOnboardingScreen(next).phase,
    screen: next,
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

function OnboardingField({
  label,
  help,
  className,
  children,
}: {
  label: string;
  help?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`supplier-onboarding-field${className ? ` ${className}` : ''}`}>
      <div className="supplier-onboarding-field__label">
        <span>{label}</span>
        {help ? <FieldHelp label={`About ${label}`} text={help} /> : null}
      </div>
      {children}
    </div>
  );
}

function Choice({
  value,
  yes,
  no,
  onChange,
}: {
  value: 'yes' | 'no' | '';
  yes: string;
  no: string;
  onChange: (yes: boolean) => void;
}) {
  return (
    <div className="supplier-onboarding-choices">
      {([true, false] as const).map((isYes) => {
        const selected = value === (isYes ? 'yes' : 'no');
        return (
          <button
            key={isYes ? 'yes' : 'no'}
            type="button"
            className={`lc-choice min-h-[3.25rem] rounded-2xl px-4 text-left text-[15px] font-semibold text-ink ${selected ? 'lc-choice--selected' : ''}`}
            aria-pressed={selected}
            onClick={() => onChange(isYes)}
          >
            {isYes ? yes : no}
          </button>
        );
      })}
    </div>
  );
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
