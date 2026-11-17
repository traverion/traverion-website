import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  fetchSupplierProfile,
  patchSupplierProfile,
  uploadSupplierVerificationDocument,
  verificationDocumentBasename,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import {
  BUSINESS_ONBOARDING_SCREENS,
  businessOnboardingStepIndex,
  clearBusinessOnboardingDraft,
  emptyBusinessOnboardingDraft,
  loadBusinessOnboardingDraft,
  saveBusinessOnboardingDraft,
  validateBusinessOnboardingStep,
  type BusinessOnboardingDraft,
  type BusinessOnboardingStepId,
} from '../../lib/business-onboarding-wizard';
import { PARTNER_HELP } from '../../lib/partnerHelpCopy';
import { submitSupplierBusinessForReview } from '../../lib/submitSupplierBusinessForReview';
import { isSupplierBusinessIdentityLocked } from '../../lib/supplierVerificationLocks';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { partnerBusinessReviewState } from '../../lib/partnerVerificationStatus';
import PartnerHelpTip from './PartnerHelpTip';

function FieldLabel({ children, help }: { children: ReactNode; help?: string }) {
  return (
    <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
      {children}
      {help ? <PartnerHelpTip label={`About ${String(children)}`}>{help}</PartnerHelpTip> : null}
    </span>
  );
}

type Props = {
  userId: string;
  profile: SupplierProfileRow | null;
  canEdit: boolean;
  onProfile: (profile: SupplierProfileRow | null) => void;
  onClose: () => void;
  onSubmitted?: () => void;
};

function prefillFromProfile(profile: SupplierProfileRow | null): Partial<BusinessOnboardingDraft> {
  return {
    display_name: profile?.display_name ?? '',
    company_legal_name: profile?.company_legal_name ?? '',
    business_type:
      profile?.business_type === 'company' || profile?.business_type === 'individual'
        ? profile.business_type
        : '',
    company_registration_number: profile?.company_registration_number ?? '',
    tax_id: profile?.tax_id ?? '',
    vat_id: profile?.vat_id ?? '',
    managing_directors: profile?.managing_directors ?? '',
    contact_phone: profile?.contact_phone ?? '',
    address_street: profile?.address_street ?? '',
    address_city: profile?.address_city ?? '',
    address_postal_code: profile?.address_postal_code ?? '',
    address_country: profile?.address_country ?? '',
    company_registration_document_path: profile?.company_registration_document_path ?? '',
  };
}

export default function BusinessOnboardingWizard({
  userId,
  profile,
  canEdit,
  onProfile,
  onClose,
  onSubmitted,
}: Props) {
  // P9.16.1: lock helper takes status strings — never pass the profile object (runtime .trim crash).
  const locked = isSupplierBusinessIdentityLocked(
    profile?.verification_status,
    profile?.verification_submitted_at,
    profile?.business_type
  );
  const reviewState = partnerBusinessReviewState({
    verificationStatus: profile?.verification_status,
    submittedAt: profile?.verification_submitted_at,
  });
  const underReview = reviewState === 'pending';
  const verified = reviewState === 'verified';

  const [draft, setDraft] = useState<BusinessOnboardingDraft>(() => {
    const saved = loadBusinessOnboardingDraft(userId);
    const initialFromQuery =
      typeof window !== 'undefined'
        ? (new URLSearchParams(window.location.search).get('step') as BusinessOnboardingStepId | null)
        : null;
    const validInitial =
      initialFromQuery && BUSINESS_ONBOARDING_SCREENS.some((s) => s.id === initialFromQuery)
        ? initialFromQuery
        : null;
    return emptyBusinessOnboardingDraft({
      ...prefillFromProfile(profile),
      ...(saved ?? {}),
      step:
        underReview || verified
          ? 'review'
          : validInitial ?? saved?.step ?? 'identity',
      owner_authority_confirmed: saved?.owner_authority_confirmed ?? false,
    });
  });
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persistLabel, setPersistLabel] = useState<string | null>(null);

  const stepIndex = businessOnboardingStepIndex(draft.step);
  const screen = BUSINESS_ONBOARDING_SCREENS[stepIndex]!;
  const progressPct = Math.round(((stepIndex + 1) / BUSINESS_ONBOARDING_SCREENS.length) * 100);

  useEffect(() => {
    saveBusinessOnboardingDraft(userId, draft);
    setPersistLabel('Progress saved');
    const t = window.setTimeout(() => setPersistLabel(null), 1600);
    return () => window.clearTimeout(t);
  }, [userId, draft]);

  const railItems = useMemo(
    () =>
      BUSINESS_ONBOARDING_SCREENS.map((s, index) => {
        const current = index === stepIndex;
        const complete = index < stepIndex;
        const lockedStep = underReview || verified ? index < BUSINESS_ONBOARDING_SCREENS.length - 1 : false;
        return {
          id: s.id,
          label: s.title,
          state: current ? 'current' : complete ? 'complete' : lockedStep ? 'locked' : 'todo',
        } as const;
      }),
    [stepIndex, underReview, verified]
  );

  const patch = (partial: Partial<BusinessOnboardingDraft>) => {
    setDraft((d) => ({ ...d, ...partial }));
    setError(null);
  };

  const goTo = (step: BusinessOnboardingStepId, dir: 'forward' | 'back') => {
    setDirection(dir);
    patch({ step });
  };

  const onBack = () => {
    if (stepIndex <= 0 || underReview || verified) {
      onClose();
      return;
    }
    const prev = BUSINESS_ONBOARDING_SCREENS[stepIndex - 1]!;
    goTo(prev.id, 'back');
  };

  const onContinue = async () => {
    if (!canEdit && !underReview && !verified) {
      setError('Your role can view business details but cannot change them.');
      return;
    }
    if (underReview || verified) {
      onClose();
      return;
    }
    const err = validateBusinessOnboardingStep(draft.step, draft);
    if (err) {
      setError(err);
      return;
    }
    if (draft.step === 'review') {
      setBusy(true);
      setError(null);
      try {
        const result = await submitSupplierBusinessForReview(userId, draft);
        if (!result.ok) {
          setError(userFacingError(result.error, USER_ERROR.generic));
          return;
        }
        clearBusinessOnboardingDraft(userId);
        const next = result.profile ?? (await fetchSupplierProfile(userId));
        onProfile(next);
        onSubmitted?.();
        onClose();
      } finally {
        setBusy(false);
      }
      return;
    }
    const next = BUSINESS_ONBOARDING_SCREENS[stepIndex + 1]!;
    goTo(next.id, 'forward');
  };

  const onUpload = async (file: File | null) => {
    if (!file || !canEdit || locked) return;
    setUploading(true);
    setError(null);
    try {
      const up = await uploadSupplierVerificationDocument(userId, file);
      if (!up.path) {
        setError(userFacingError(up.error ?? 'Upload failed', USER_ERROR.generic));
        return;
      }
      const patchRes = await patchSupplierProfile(userId, {
        company_registration_document_path: up.path,
      });
      if (!patchRes.success) {
        setError(userFacingError(patchRes.error ?? 'Could not save document path', USER_ERROR.generic));
        return;
      }
      patch({ company_registration_document_path: up.path });
      const next = await fetchSupplierProfile(userId);
      onProfile(next);
    } finally {
      setUploading(false);
    }
  };

  const stageClass = [
    'payout-wizard__stage',
    direction === 'forward' ? 'payout-wizard__stage--forward' : 'payout-wizard__stage--back',
  ].join(' ');

  const fieldsLocked = locked || underReview || verified || !canEdit;

  return (
    <div className="payout-wizard listing-creation-workspace stay-creator fixed inset-0 z-[80] flex bg-white">
      <aside className="listing-creation-rail hidden h-full min-h-0 w-[15.75rem] shrink-0 flex-col overflow-hidden border-r border-[#E5E7EB] lg:flex xl:w-[16.5rem]">
        <div className="shrink-0 border-b border-[#E5E7EB] px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#073b83]">Traverion</p>
          <p className="mt-1 text-sm font-semibold text-[#18181b]">Business setup</p>
          <div
            className="listing-creation-rail-progress mt-3"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={BUSINESS_ONBOARDING_SCREENS.length}
            aria-valuenow={stepIndex + 1}
            aria-label={`Step ${stepIndex + 1} of ${BUSINESS_ONBOARDING_SCREENS.length}`}
          >
            <span
              className="listing-creation-rail-progress__fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-[#71717a]" aria-live="polite">
            {persistLabel ?? `Step ${stepIndex + 1} of ${BUSINESS_ONBOARDING_SCREENS.length}`}
          </p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Business setup steps">
          <ol className="space-y-1">
            {railItems.map((item, index) => {
              const current = item.state === 'current';
              const complete = item.state === 'complete';
              const stepLocked = item.state === 'locked';
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (stepLocked || underReview || verified) return;
                      if (index > stepIndex) {
                        const err = validateBusinessOnboardingStep(draft.step, draft);
                        if (err) {
                          setError(err);
                          return;
                        }
                      }
                      goTo(item.id, index > stepIndex ? 'forward' : 'back');
                    }}
                    aria-current={current ? 'step' : undefined}
                    aria-disabled={stepLocked || undefined}
                    className={[
                      'lux-flat flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors',
                      current
                        ? 'bg-[rgba(7,59,131,0.08)] font-semibold text-[#073b83]'
                        : complete
                          ? 'font-medium text-[#18181b] hover:bg-[#f5f6f8]'
                          : stepLocked
                            ? 'cursor-default font-medium text-[#a1a1aa]'
                            : 'font-medium text-[#71717a] hover:bg-[#f5f6f8]',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                        current
                          ? 'bg-[#073b83] text-white'
                          : complete
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#e5e7eb] text-[#71717a]',
                      ].join(' ')}
                    >
                      {complete ? '✓' : index + 1}
                    </span>
                    <span className="min-w-0 truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="shrink-0 border-t border-[#E5E7EB] p-3">
          <button
            type="button"
            className="lux-flat min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold text-[#18181b] hover:bg-[#f5f6f8]"
            onClick={onClose}
            disabled={busy}
          >
            Save &amp; exit
          </button>
        </div>
      </aside>

      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-2.5 pt-[max(0.6rem,env(safe-area-inset-top))] sm:px-6 lg:hidden">
          <button
            type="button"
            className="min-h-11 text-sm font-semibold text-[#18181b]"
            onClick={onClose}
            disabled={busy}
          >
            Save &amp; exit
          </button>
          <p className="truncate text-sm font-semibold text-[#18181b]">Business setup</p>
          <p className="min-w-16 text-right text-xs text-[#71717a]" aria-live="polite">
            {persistLabel ?? ''}
          </p>
        </header>

        <div className="mx-auto flex min-h-0 w-full max-w-[28rem] flex-1 flex-col overflow-hidden px-4 sm:px-6 lg:max-w-[32rem] lg:px-8">
          <div className="shrink-0 py-3 lg:hidden">
            <div
              className="h-[3px] overflow-hidden rounded-full bg-[#e5e7eb]"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={BUSINESS_ONBOARDING_SCREENS.length}
              aria-valuenow={stepIndex + 1}
            >
              <span
                className="block h-full rounded-full bg-[#073b83] transition-[width] duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83]">
              Step {stepIndex + 1} of {BUSINESS_ONBOARDING_SCREENS.length}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 [-webkit-overflow-scrolling:touch]">
            <div key={draft.step} className={stageClass}>
              <p className="mb-1 hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83] lg:block">
                Step {stepIndex + 1} of {BUSINESS_ONBOARDING_SCREENS.length}
              </p>
              <h1 className="stay-title inline-flex flex-wrap items-center gap-1.5 text-[1.45rem] font-bold tracking-tight text-[#18181b] sm:text-[1.6rem]">
                {underReview ? 'Under review' : verified ? 'Verified' : screen.title}
                {underReview || verified ? (
                  <PartnerHelpTip label="About this status">
                    {underReview ? PARTNER_HELP.underReview : PARTNER_HELP.verified}
                  </PartnerHelpTip>
                ) : null}
              </h1>
              <p className="stay-lede mt-1.5 text-[13px] leading-relaxed text-[#52525b]">
                {underReview
                  ? 'You’ll be notified when a decision is ready.'
                  : verified
                    ? 'Manage details from Business settings.'
                    : screen.lede}
              </p>

              {profile?.business_verification_feedback?.trim() && reviewState === 'rejected' ? (
                <p className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
                  {profile.business_verification_feedback.trim()}
                </p>
              ) : null}

              {error ? (
                <p
                  className="mt-3 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              {!underReview && !verified && draft.step === 'identity' ? (
                <form
                  className="mt-4 grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onContinue();
                  }}
                >
                  <label className="block text-[13px]">
                    <FieldLabel help={PARTNER_HELP.brandName}>Brand name</FieldLabel>
                    <input
                      className="tv-input h-11 w-full"
                      value={draft.display_name}
                      onChange={(e) => patch({ display_name: e.target.value })}
                      readOnly={fieldsLocked}
                      required
                    />
                  </label>
                  <label className="block text-[13px]">
                    <FieldLabel help={PARTNER_HELP.legalName}>Legal name</FieldLabel>
                    <input
                      className="tv-input h-11 w-full"
                      value={draft.company_legal_name}
                      onChange={(e) => patch({ company_legal_name: e.target.value })}
                      autoComplete="organization"
                      readOnly={fieldsLocked}
                      required
                    />
                  </label>
                  <label className="block text-[13px]">
                    <FieldLabel help={PARTNER_HELP.businessType}>Business type</FieldLabel>
                    <select
                      className="tv-input h-11 w-full"
                      value={draft.business_type}
                      onChange={(e) =>
                        patch({ business_type: e.target.value as '' | 'company' | 'individual' })
                      }
                      disabled={fieldsLocked}
                    >
                      <option value="">Select…</option>
                      <option value="company">Registered company</option>
                      <option value="individual">Individual trader</option>
                    </select>
                  </label>
                  {draft.business_type === 'company' ? (
                    <label className="block text-[13px]">
                      <FieldLabel help={PARTNER_HELP.registrationNumber}>Registration number</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.company_registration_number}
                        onChange={(e) => patch({ company_registration_number: e.target.value })}
                        readOnly={fieldsLocked}
                      />
                    </label>
                  ) : null}
                  {draft.business_type === 'individual' ? (
                    <label className="block text-[13px]">
                      <FieldLabel help={PARTNER_HELP.taxId}>Tax ID</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.tax_id}
                        onChange={(e) => patch({ tax_id: e.target.value })}
                        readOnly={fieldsLocked}
                      />
                    </label>
                  ) : null}
                  <label className="block text-[13px]">
                    <FieldLabel help={PARTNER_HELP.managingDirectors}>Directors (optional)</FieldLabel>
                    <input
                      className="tv-input h-11 w-full"
                      value={draft.managing_directors}
                      onChange={(e) => patch({ managing_directors: e.target.value })}
                      readOnly={fieldsLocked}
                    />
                  </label>
                  {draft.business_type === 'company' ? (
                    <label className="block text-[13px]">
                      <FieldLabel help={PARTNER_HELP.vatId}>VAT ID (optional)</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.vat_id}
                        onChange={(e) => patch({ vat_id: e.target.value })}
                        readOnly={fieldsLocked}
                      />
                    </label>
                  ) : null}
                </form>
              ) : null}

              {!underReview && !verified && draft.step === 'contact' ? (
                <form
                  className="mt-4 grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onContinue();
                  }}
                >
                  <label className="block text-[13px]">
                    <FieldLabel help={PARTNER_HELP.contactPhone}>Phone</FieldLabel>
                    <input
                      className="tv-input h-11 w-full"
                      value={draft.contact_phone}
                      onChange={(e) => patch({ contact_phone: e.target.value })}
                      autoComplete="tel"
                      readOnly={fieldsLocked}
                      required
                    />
                  </label>
                  <label className="block text-[13px]">
                    <FieldLabel help={PARTNER_HELP.registeredAddress}>Street address</FieldLabel>
                    <input
                      className="tv-input h-11 w-full"
                      value={draft.address_street}
                      onChange={(e) => patch({ address_street: e.target.value })}
                      autoComplete="street-address"
                      readOnly={fieldsLocked}
                      required
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-[13px]">
                      <FieldLabel>Postal code</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.address_postal_code}
                        onChange={(e) => patch({ address_postal_code: e.target.value })}
                        autoComplete="postal-code"
                        readOnly={fieldsLocked}
                        required
                      />
                    </label>
                    <label className="block text-[13px]">
                      <FieldLabel>City</FieldLabel>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.address_city}
                        onChange={(e) => patch({ address_city: e.target.value })}
                        autoComplete="address-level2"
                        readOnly={fieldsLocked}
                        required
                      />
                    </label>
                  </div>
                  <label className="block text-[13px]">
                    <FieldLabel>Country</FieldLabel>
                    <select
                      className="tv-input h-11 w-full"
                      value={draft.address_country}
                      onChange={(e) => patch({ address_country: e.target.value })}
                      disabled={fieldsLocked}
                      required
                    >
                      <option value="">Select…</option>
                      <option value="FI">Finland (FI)</option>
                      <option value="SE">Sweden (SE)</option>
                      <option value="NO">Norway (NO)</option>
                      <option value="DK">Denmark (DK)</option>
                      <option value="EE">Estonia (EE)</option>
                      <option value="DE">Germany (DE)</option>
                      <option value="Finland">Finland</option>
                    </select>
                  </label>
                </form>
              ) : null}

              {!underReview && !verified && draft.step === 'documents' ? (
                <div className="mt-4 grid gap-3">
                  {draft.company_registration_document_path ? (
                    <p className="rounded-[10px] border border-[#dbe4f0] bg-[#f0f4fa] px-3 py-2 text-[13px] text-[#1e3a5f]">
                      On file: {verificationDocumentBasename(draft.company_registration_document_path)}
                    </p>
                  ) : null}
                  <label className="block text-[13px]">
                    <FieldLabel help={PARTNER_HELP.registrationDocument}>Registration document</FieldLabel>
                    <input
                      type="file"
                      accept=".pdf,image/jpeg,image/png,image/webp,application/pdf"
                      disabled={fieldsLocked || uploading}
                      className="block w-full text-[13px]"
                      onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              ) : null}

              {(draft.step === 'review' || underReview || verified) && (
                <dl className="mt-4 space-y-2 rounded-[12px] border border-[#E5E7EB] bg-[#fafafa] p-3 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#71717a]">Brand</dt>
                    <dd className="text-right font-medium text-[#18181b]">{draft.display_name || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#71717a]">Legal name</dt>
                    <dd className="text-right font-medium text-[#18181b]">{draft.company_legal_name || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#71717a]">Type</dt>
                    <dd className="text-right font-medium text-[#18181b]">
                      {draft.business_type === 'company'
                        ? 'Company'
                        : draft.business_type === 'individual'
                          ? 'Individual'
                          : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#71717a]">Country</dt>
                    <dd className="text-right font-medium text-[#18181b]">{draft.address_country || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#71717a]">Document</dt>
                    <dd className="text-right font-medium text-[#18181b]">
                      {draft.company_registration_document_path
                        ? verificationDocumentBasename(draft.company_registration_document_path)
                        : '—'}
                    </dd>
                  </div>
                </dl>
              )}

              {!underReview && !verified && draft.step === 'review' ? (
                <label className="mt-4 flex items-start gap-2 rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-3 text-[13px] text-[#18181b]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={draft.owner_authority_confirmed}
                    onChange={(e) => patch({ owner_authority_confirmed: e.target.checked })}
                    disabled={fieldsLocked}
                  />
                  <span className="min-w-0">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      I confirm I am the owner or an authorized representative, and that this information is accurate.
                      <PartnerHelpTip label="About this confirmation">{PARTNER_HELP.ownerConfirm}</PartnerHelpTip>
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 border-t border-[#E5E7EB] bg-white py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="tv-btn-secondary h-11 min-w-[5.5rem] px-4 text-sm"
                onClick={onBack}
                disabled={busy}
              >
                {stepIndex === 0 || underReview || verified ? 'Close' : 'Back'}
              </button>
              <button
                type="button"
                className="tv-btn-primary h-11 min-w-[7.5rem] px-5 text-sm disabled:opacity-50"
                onClick={() => void onContinue()}
                disabled={busy || uploading || (!canEdit && !underReview && !verified)}
              >
                {busy
                  ? 'Submitting…'
                  : underReview || verified
                    ? 'Done'
                    : draft.step === 'review'
                      ? 'Submit for review'
                      : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
