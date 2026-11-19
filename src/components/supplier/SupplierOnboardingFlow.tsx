import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DateOfBirthPicker from './DateOfBirthPicker';
import { ListingCreationWorkspace } from './listing-creation/ListingCreationWorkspace';
import {
  fetchSupplierProfile,
  invalidateSupplierProfileCache,
  patchSupplierProfile,
  uploadSupplierVerificationDocument,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import {
  connectOnboardingUserMessage,
  invokeConnectSupplierOnboarding,
} from '../../data/supabase-connect-onboarding';
import { isValidFinnishBusinessId, normalizeCountryCode } from '../../lib/business-identity-validation';
import { validateIsoDob } from '../../lib/date-of-birth';
import { connectCanReceiveTransfers } from '../../lib/connect-payout-status';
import { humanizeConnectRequirements } from '../../lib/connect-requirement-labels';
import {
  emptyBeneficialOwner,
  emptyPayoutWizardDraft,
  loadPayoutWizardDraft,
  mergeServerPayoutWizardDraft,
  onboardingCompletionCopy,
  parseOwnershipPercent,
  parsePayoutWizardDob,
  resolveOnboardingCompletionState,
  savePayoutWizardDraft,
  suggestRepresentativeNameFromDirectors,
  toServerPayoutWizardDraft,
  validateIban,
  validateOwnershipPercent,
  type PayoutWizardDraft,
} from '../../lib/payout-setup-wizard';
import { createBankAccountToken } from '../../lib/stripe-js-client';
import { STRIPE_RECIPIENT_AGREEMENT } from '../../lib/stripe-recipient-agreement';
import {
  onboardingGroupProgress,
  requirementFlags,
  screenFromOnboardingUrl,
  supplierOnboardingScreen,
  visibleSupplierOnboardingScreens,
  type SupplierOnboardingScreenId,
  type SupplierOnboardingVisibility,
} from '../../lib/supplier-onboarding-steps';

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
  const [screen, setScreen] = useState<SupplierOnboardingScreenId>('company');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [payoutGatesOpen, setPayoutGatesOpen] = useState(false);
  const booted = useRef(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (!profile) return;
    setDraft((current) => {
      if (current.rep_first_name.trim() && current.rep_last_name.trim()) return current;
      return initialDraft(userId, profile);
    });
  }, [profile, userId]);

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

  const writeScreen = useCallback((next: SupplierOnboardingScreenId) => {
    const phase = supplierOnboardingScreen(next).phase;
    const url = new URL(window.location.href);
    url.searchParams.set('phase', phase);
    url.searchParams.set('screen', next);
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, []);

  useEffect(() => {
    if (!profile || booted.current) return;
    booted.current = true;
    const next = screenFromOnboardingUrl(window.location.search, visibleSupplierOnboardingScreens(visibility));
    setScreen(next);
    writeScreen(next);
  }, [profile, visibility, writeScreen]);

  useEffect(() => {
    if (!userId || !hasAccount) return;
    let cancelled = false;
    void invokeConnectSupplierOnboarding('status').then((result) => {
      if (!cancelled) setPayoutGatesOpen(result.payout_gates_open === true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, hasAccount]);

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
    setScreen(next);
    writeScreen(next);
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

  const back = () => {
    if (screen === 'documents') {
      go('company');
      return;
    }
    const index = visible.indexOf(screen);
    if (index > 0) go(visible[index - 1]!);
  };

  const onContinue = async () => {
    if (busy || submitting.current) return;
    if (!canEdit && screen !== 'company' && screen !== 'status') {
      setError('Your role can view setup but cannot change it.');
      return;
    }
    if (screen === 'company') {
      advance('company');
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
    if (flags.identityOpen) go('person');
    else if (flags.bankOpen || flags.termsOpen) go('bank');
    else onOpenListings();
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
      setError('This supplier already has a payout account path. Refresh and try again.');
      return false;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
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
      setError(connectOnboardingUserMessage(business.error));
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
      setError(connectOnboardingUserMessage(person.error));
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
        setError(connectOnboardingUserMessage(owners.error));
        return false;
      }
    }
    const next = await fetchSupplierProfile(userId);
    if (next) onProfile(next);
    setDraft((current) => ({ ...current, representativeSavedAt: new Date().toISOString(), rep_dob: '' }));
    setRepDob('');
    setBusy(false);
    submitting.current = false;
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
    const terms = await invokeConnectSupplierOnboarding('accept_tos', {
      tos_accepted: true,
      agreement_version: STRIPE_RECIPIENT_AGREEMENT.version,
    });
    if (!terms.success) {
      setBusy(false);
      submitting.current = false;
      setError(connectOnboardingUserMessage(terms.error));
      return false;
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
      return false;
    }
    const attached = await invokeConnectSupplierOnboarding('attach_bank_token', {
      bank_token: tokenized.tokenId,
    });
    setIban('');
    if (!attached.success) {
      setBusy(false);
      submitting.current = false;
      setError(connectOnboardingUserMessage(attached.error));
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
    return true;
  };

  const onUpload = async (file: File | null) => {
    if (!file || !canEdit || !userId) return;
    setBusy(true);
    setError(null);
    const up = await uploadSupplierVerificationDocument(userId, file);
    if (!up.path) {
      setBusy(false);
      setError('That document could not be uploaded.');
      return;
    }
    const saved = await patchSupplierProfile(userId, { company_registration_document_path: up.path });
    if (!saved.success) {
      setBusy(false);
      setError('That document could not be saved.');
      return;
    }
    const next = await fetchSupplierProfile(userId);
    if (next) onProfile(next);
    setBusy(false);
  };

  const meta = supplierOnboardingScreen(screen);
  const progress = onboardingGroupProgress(
    screen === 'documents' ? ['company', 'documents', ...visible.filter((id) => id !== 'company')] : visible,
    screen === 'documents' ? 'documents' : visible.includes(screen) ? screen : visible[0] ?? 'company'
  );
  const canReceive = connectCanReceiveTransfers(profile ?? {});
  const completion = onboardingCompletionCopy(
    resolveOnboardingCompletionState({
      hasConnectedAccount: hasAccount,
      canReceiveTransfers: canReceive,
      connectLivemode: profile?.connect_account_livemode,
      wizardCompleted: false,
      payoutConfigured: false,
      payoutGatesOpen,
    })
  );
  const title = screen === 'status' ? completion.title : meta.title;
  const body = screen === 'status' ? completion.lede : meta.body;
  const cityLine = [profile?.address_postal_code, profile?.address_city].filter(Boolean).join(' ');
  const primary =
    screen === 'status'
      ? flags.identityOpen || flags.bankOpen || flags.termsOpen
        ? 'Continue verification'
        : hasListing
          ? 'Done'
          : 'Create a listing'
      : screen === 'consent'
        ? 'Send for verification'
        : screen === 'terms'
          ? 'Save bank account'
          : 'Continue';

  return (
    <div
      className="partner-unified-setup-shell payout-wizard flex h-full min-h-0 w-full flex-1 overflow-hidden"
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
        onExit={onExit}
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
            <div className="grid grid-cols-3 items-center gap-2">
              <button
                type="button"
                className="stay-nav-btn stay-nav-btn--start touch-manipulation tv-btn-ghost !min-h-11 disabled:opacity-40"
                onClick={back}
                disabled={busy || screen === 'company' || screen === visible[0]}
              >
                Back
              </button>
              <span />
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
        <div key={screen} className="onboarding-step mx-auto w-full max-w-[40rem]">
          <header className="mb-5 space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              {progress.group} · {progress.index} of {progress.total}
            </p>
            <h1 className="font-display text-[1.45rem] font-bold leading-[1.15] tracking-tight text-ink sm:text-[1.7rem]">
              {title}
            </h1>
            <p className="text-[14px] leading-relaxed text-ink-muted sm:text-[15px]">{body}</p>
          </header>
          {screen === 'company' ? (
            <dl className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4 text-[15px]">
              <div>
                <dt className="text-[12px] font-medium text-ink-muted">Legal name</dt>
                <dd className="font-semibold text-ink">{profile?.company_legal_name}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-medium text-ink-muted">Business ID</dt>
                <dd className="font-semibold text-ink">{profile?.company_registration_number}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-medium text-ink-muted">City</dt>
                <dd className="font-semibold text-ink">{cityLine}</dd>
              </div>
            </dl>
          ) : null}
          {screen === 'documents' ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4">
              {hasFile ? (
                <p className="text-[15px] font-semibold text-ink">Registration document is on file.</p>
              ) : (
                <label className="block text-[14px] font-semibold text-ink">
                  Upload the registration document
                  <input
                    className="mt-3 block w-full text-[14px] font-medium"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(event) => void onUpload(event.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
          ) : null}
          {screen === 'person' ? (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4">
              {editingName ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[13px] font-medium text-ink">
                    First name
                    <input
                      className="tv-input mt-1.5 w-full"
                      value={draft.rep_first_name}
                      onChange={(event) => setDraft((current) => ({ ...current, rep_first_name: event.target.value }))}
                    />
                  </label>
                  <label className="block text-[13px] font-medium text-ink">
                    Last name
                    <input
                      className="tv-input mt-1.5 w-full"
                      value={draft.rep_last_name}
                      onChange={(event) => setDraft((current) => ({ ...current, rep_last_name: event.target.value }))}
                    />
                  </label>
                </div>
              ) : (
                <p
                  className="text-[15px] font-semibold text-ink"
                  data-saved-given={draft.rep_first_name.trim().length}
                  data-saved-family={draft.rep_last_name.trim().length}
                >
                  {draft.rep_first_name} {draft.rep_last_name}
                </p>
              )}
              <button
                type="button"
                className="mt-3 min-h-11 text-[13px] font-semibold text-[#073b83]"
                onClick={() => setEditingName((value) => !value)}
              >
                {editingName ? 'Done' : 'Change name'}
              </button>
            </div>
          ) : null}
          {screen === 'dob' ? (
            <DateOfBirthPicker value={repDob} onChange={setRepDob} required />
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
            <label className="block max-w-[12rem] text-[13px] font-medium text-ink">
              Percent
              <input
                className="tv-input mt-1.5 w-full"
                inputMode="decimal"
                value={draft.rep_percent_ownership}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, rep_percent_ownership: event.target.value }))
                }
              />
            </label>
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
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[13px] font-medium text-ink">
                  First name
                  <input
                    className="tv-input mt-1.5 w-full"
                    value={owner.first_name}
                    onChange={(event) => setOwner((current) => ({ ...current, first_name: event.target.value }))}
                  />
                </label>
                <label className="block text-[13px] font-medium text-ink">
                  Last name
                  <input
                    className="tv-input mt-1.5 w-full"
                    value={owner.last_name}
                    onChange={(event) => setOwner((current) => ({ ...current, last_name: event.target.value }))}
                  />
                </label>
              </div>
              <DateOfBirthPicker
                value={owner.dob}
                onChange={(value) => setOwner((current) => ({ ...current, dob: value }))}
                required
              />
              <label className="block max-w-[12rem] text-[13px] font-medium text-ink">
                Percent
                <input
                  className="tv-input mt-1.5 w-full"
                  inputMode="decimal"
                  value={owner.percent_ownership}
                  onChange={(event) => setOwner((current) => ({ ...current, percent_ownership: event.target.value }))}
                />
              </label>
            </div>
          ) : null}
          {screen === 'consent' ? (
            <label className="lc-choice flex min-h-[3.25rem] items-center gap-3 rounded-2xl px-4 text-[15px] font-semibold text-ink">
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
            <div className="space-y-4">
              <p className="text-[15px] font-semibold text-ink">{profile?.company_legal_name}</p>
              <label className="block text-[13px] font-medium text-ink">
                IBAN
                <input
                  className="tv-input mt-1.5 w-full"
                  value={iban}
                  autoComplete="off"
                  placeholder="FI00 0000 0000 0000 00"
                  onChange={(event) => setIban(event.target.value)}
                />
              </label>
            </div>
          ) : null}
          {screen === 'terms' ? (
            <label className="lc-choice flex min-h-[3.25rem] items-center gap-3 rounded-2xl px-4 text-[15px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={draft.tos_accepted}
                onChange={(event) => setDraft((current) => ({ ...current, tos_accepted: event.target.checked }))}
              />
              Accept the terms
            </label>
          ) : null}
          {screen === 'status' && due.length > 0 ? (
            <ul className="mt-2 space-y-2 text-[14px] text-ink">
              {humanizeConnectRequirements(due).slice(0, 6).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p className="mt-4 text-[14px] font-medium text-[#9f1239]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </ListingCreationWorkspace>
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
    <div className="grid gap-3">
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
  });
  if (!merged.rep_first_name.trim() && suggested?.first_name) merged.rep_first_name = suggested.first_name;
  if (!merged.rep_last_name.trim() && suggested?.last_name) merged.rep_last_name = suggested.last_name;
  merged.rep_dob = '';
  merged.beneficial_owners = merged.beneficial_owners.map((row) => ({ ...row, dob: '' }));
  return merged;
}
