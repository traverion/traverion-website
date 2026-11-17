import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  fetchSupplierProfile,
  patchSupplierProfile,
  removeSupplierVerificationDocumentFile,
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

const CONTENT_MAX = 'max-w-[42rem]'; // ~672px — tour-creation comfortable width

function BizField({
  label,
  help,
  optional,
  children,
}: {
  label: string;
  help?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="stay-field block">
      <span className="!inline-flex items-center gap-1.5">
        {label}
        {optional ? <span className="font-medium text-[#5c6570]">(optional)</span> : null}
        {help ? <PartnerHelpTip label={`About ${label}`}>{help}</PartnerHelpTip> : null}
      </span>
      <div className="mt-2 font-normal">{children}</div>
    </label>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[#E8EAED] py-5 first:pt-0 last:border-0 last:pb-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-[#17191d]">{title}</h2>
        {onEdit ? (
          <button
            type="button"
            className="lux-flat min-h-9 shrink-0 px-1 text-[13px] font-semibold text-[#073b83] hover:text-[#052d65]"
            onClick={onEdit}
          >
            Edit
          </button>
        ) : null}
      </div>
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
      <dt className="text-[13px] text-[#5c6570]">{label}</dt>
      <dd className="text-[14px] font-medium leading-snug tracking-tight text-[#17191d]">
        {value.trim() || '—'}
      </dd>
    </div>
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

  // Keep ?step= in sync so refresh resumes the current step.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('step') === draft.step) return;
    url.searchParams.set('step', draft.step);
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [draft.step]);

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

  const fieldsLocked = locked || underReview || verified || !canEdit;
  const canEditReview = !fieldsLocked;

  const onRemoveDocument = async () => {
    if (fieldsLocked) return;
    const path = draft.company_registration_document_path.trim();
    if (!path) return;
    setUploading(true);
    setError(null);
    try {
      await removeSupplierVerificationDocumentFile(path);
      const patchRes = await patchSupplierProfile(userId, {
        company_registration_document_path: null,
      });
      if (!patchRes.success) {
        setError(userFacingError(patchRes.error ?? 'Could not remove document', USER_ERROR.generic));
        return;
      }
      patch({ company_registration_document_path: '' });
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

  const businessTypeLabel =
    draft.business_type === 'company'
      ? 'Registered company'
      : draft.business_type === 'individual'
        ? 'Individual trader'
        : '—';

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

      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#FCFCFD]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white px-4 py-2.5 pt-[max(0.6rem,env(safe-area-inset-top))] sm:px-6 lg:hidden">
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

        <div
          className={`mx-auto flex min-h-0 w-full ${CONTENT_MAX} flex-1 flex-col overflow-hidden px-4 sm:px-6 lg:px-8`}
        >
          <div className="shrink-0 bg-[#FCFCFD] pb-1 pt-3 lg:hidden">
            <div
              className="h-[3px] overflow-hidden rounded-full bg-[#e5e7eb]"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={BUSINESS_ONBOARDING_SCREENS.length}
              aria-valuenow={stepIndex + 1}
              aria-label={`Step ${stepIndex + 1} of ${BUSINESS_ONBOARDING_SCREENS.length}`}
            >
              <span
                className="block h-full rounded-full bg-[#073b83] transition-[width] duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-2.5 text-[12px] font-semibold text-[#073b83]">
              Step {stepIndex + 1} of {BUSINESS_ONBOARDING_SCREENS.length}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 pt-4 lg:pb-8 lg:pt-10 [-webkit-overflow-scrolling:touch]">
            <div key={draft.step} className={stageClass}>
              <p className="mb-2 hidden text-[12px] font-semibold text-[#073b83] lg:block">
                Step {stepIndex + 1} of {BUSINESS_ONBOARDING_SCREENS.length}
              </p>
              <h1 className="stay-title inline-flex flex-wrap items-center gap-1.5">
                {underReview ? 'Under review' : verified ? 'Verified' : screen.title}
                {underReview || verified ? (
                  <PartnerHelpTip label="About this status">
                    {underReview ? PARTNER_HELP.underReview : PARTNER_HELP.verified}
                  </PartnerHelpTip>
                ) : null}
              </h1>
              <p className="stay-lede mt-2 max-w-[34rem]">
                {underReview
                  ? 'You’ll be notified when a decision is ready.'
                  : verified
                    ? 'Manage details from Business settings.'
                    : screen.lede}
              </p>

              {profile?.business_verification_feedback?.trim() && reviewState === 'rejected' ? (
                <p className="stay-alert mt-5 !border-amber-200 !bg-amber-50 !text-amber-950">
                  {profile.business_verification_feedback.trim()}
                </p>
              ) : null}

              {error ? (
                <p className="stay-alert" role="alert">
                  {error}
                </p>
              ) : null}

              {!underReview && !verified && draft.step === 'identity' ? (
                <form
                  className="mt-8 space-y-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onContinue();
                  }}
                >
                  <BizField label="Brand name" help={PARTNER_HELP.brandName}>
                    <input
                      className="tv-input h-12 w-full rounded-xl"
                      value={draft.display_name}
                      onChange={(e) => patch({ display_name: e.target.value })}
                      readOnly={fieldsLocked}
                      required
                    />
                  </BizField>
                  <BizField label="Registered legal name" help={PARTNER_HELP.legalName}>
                    <input
                      className="tv-input h-12 w-full rounded-xl"
                      value={draft.company_legal_name}
                      onChange={(e) => patch({ company_legal_name: e.target.value })}
                      autoComplete="organization"
                      readOnly={fieldsLocked}
                      required
                    />
                  </BizField>
                  <BizField label="Business type" help={PARTNER_HELP.businessType}>
                    <select
                      className="tv-input h-12 w-full rounded-xl"
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
                  </BizField>
                  {draft.business_type === 'company' ? (
                    <div className="space-y-6 border-t border-[#E8EAED] pt-6">
                      <BizField label="Registration number" help={PARTNER_HELP.registrationNumber}>
                        <input
                          className="tv-input h-12 w-full rounded-xl"
                          value={draft.company_registration_number}
                          onChange={(e) => patch({ company_registration_number: e.target.value })}
                          readOnly={fieldsLocked}
                        />
                      </BizField>
                      <BizField label="Directors" help={PARTNER_HELP.managingDirectors} optional>
                        <input
                          className="tv-input h-12 w-full rounded-xl"
                          value={draft.managing_directors}
                          onChange={(e) => patch({ managing_directors: e.target.value })}
                          readOnly={fieldsLocked}
                        />
                      </BizField>
                      <BizField label="VAT ID" help={PARTNER_HELP.vatId} optional>
                        <input
                          className="tv-input h-12 w-full rounded-xl"
                          value={draft.vat_id}
                          onChange={(e) => patch({ vat_id: e.target.value })}
                          readOnly={fieldsLocked}
                        />
                      </BizField>
                    </div>
                  ) : null}
                  {draft.business_type === 'individual' ? (
                    <div className="space-y-6 border-t border-[#E8EAED] pt-6">
                      <BizField label="Tax ID" help={PARTNER_HELP.taxId}>
                        <input
                          className="tv-input h-12 w-full rounded-xl"
                          value={draft.tax_id}
                          onChange={(e) => patch({ tax_id: e.target.value })}
                          readOnly={fieldsLocked}
                        />
                      </BizField>
                    </div>
                  ) : null}
                </form>
              ) : null}

              {!underReview && !verified && draft.step === 'contact' ? (
                <form
                  className="mt-8 space-y-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onContinue();
                  }}
                >
                  <BizField label="Phone">
                    <input
                      className="tv-input h-12 w-full rounded-xl"
                      value={draft.contact_phone}
                      onChange={(e) => patch({ contact_phone: e.target.value })}
                      autoComplete="tel"
                      readOnly={fieldsLocked}
                      required
                    />
                  </BizField>
                  <div className="space-y-6 border-t border-[#E8EAED] pt-6">
                    <BizField label="Street address">
                      <input
                        className="tv-input h-12 w-full rounded-xl"
                        value={draft.address_street}
                        onChange={(e) => patch({ address_street: e.target.value })}
                        autoComplete="street-address"
                        readOnly={fieldsLocked}
                        required
                      />
                    </BizField>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                      <BizField label="Postal code">
                        <input
                          className="tv-input h-12 w-full rounded-xl"
                          value={draft.address_postal_code}
                          onChange={(e) => patch({ address_postal_code: e.target.value })}
                          autoComplete="postal-code"
                          readOnly={fieldsLocked}
                          required
                        />
                      </BizField>
                      <BizField label="City">
                        <input
                          className="tv-input h-12 w-full rounded-xl"
                          value={draft.address_city}
                          onChange={(e) => patch({ address_city: e.target.value })}
                          autoComplete="address-level2"
                          readOnly={fieldsLocked}
                          required
                        />
                      </BizField>
                    </div>
                    <BizField label="Country">
                      <select
                        className="tv-input h-12 w-full rounded-xl"
                        value={draft.address_country}
                        onChange={(e) => patch({ address_country: e.target.value })}
                        disabled={fieldsLocked}
                        required
                      >
                        <option value="">Select…</option>
                        <option value="FI">Finland</option>
                        <option value="SE">Sweden</option>
                        <option value="NO">Norway</option>
                        <option value="DK">Denmark</option>
                        <option value="EE">Estonia</option>
                        <option value="DE">Germany</option>
                      </select>
                    </BizField>
                  </div>
                </form>
              ) : null}

              {!underReview && !verified && draft.step === 'documents' ? (
                <div className="mt-8 space-y-6">
                  <BizField label="Registration document" help={PARTNER_HELP.registrationDocument}>
                    {draft.company_registration_document_path ? (
                      <div className="flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[#17191d]">Uploaded</p>
                          <p className="mt-0.5 truncate text-[13px] text-[#5c6570]">
                            {verificationDocumentBasename(draft.company_registration_document_path)}
                          </p>
                        </div>
                        {!fieldsLocked ? (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <label className="tv-btn-secondary inline-flex h-10 cursor-pointer items-center px-3 text-[13px]">
                              Replace
                              <input
                                type="file"
                                accept=".pdf,image/jpeg,image/png,image/webp,application/pdf"
                                disabled={uploading}
                                className="sr-only"
                                onChange={(e) => {
                                  void onUpload(e.target.files?.[0] ?? null);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="tv-btn-secondary h-10 px-3 text-[13px] text-[#b91c1c]"
                              disabled={uploading}
                              onClick={() => void onRemoveDocument()}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <label
                        className={[
                          'flex min-h-[8.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#D0D5DD] bg-white px-4 py-6 text-center transition-colors',
                          fieldsLocked || uploading
                            ? 'cursor-not-allowed opacity-60'
                            : 'hover:border-[#073b83]/40 hover:bg-[#f8fafc]',
                        ].join(' ')}
                      >
                        <span className="text-[14px] font-semibold text-[#17191d]">
                          {uploading ? 'Uploading…' : 'Upload PDF or image'}
                        </span>
                        <span className="text-[12px] text-[#5c6570]">Max 5 MB</span>
                        <input
                          type="file"
                          accept=".pdf,image/jpeg,image/png,image/webp,application/pdf"
                          disabled={fieldsLocked || uploading}
                          className="sr-only"
                          onChange={(e) => {
                            void onUpload(e.target.files?.[0] ?? null);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </BizField>
                </div>
              ) : null}

              {(draft.step === 'review' || underReview || verified) && (
                <div className="mt-8 space-y-0">
                  <ReviewSection
                    title="Business details"
                    onEdit={canEditReview ? () => goTo('identity', 'back') : undefined}
                  >
                    <ReviewFact label="Brand name" value={draft.display_name} />
                    <ReviewFact label="Legal name" value={draft.company_legal_name} />
                    <ReviewFact label="Business type" value={businessTypeLabel} />
                    {draft.business_type === 'company' ? (
                      <>
                        <ReviewFact
                          label="Registration number"
                          value={draft.company_registration_number}
                        />
                        <ReviewFact label="Directors" value={draft.managing_directors} />
                        <ReviewFact label="VAT ID" value={draft.vat_id} />
                      </>
                    ) : null}
                    {draft.business_type === 'individual' ? (
                      <ReviewFact label="Tax ID" value={draft.tax_id} />
                    ) : null}
                  </ReviewSection>
                  <ReviewSection
                    title="Contact & address"
                    onEdit={canEditReview ? () => goTo('contact', 'back') : undefined}
                  >
                    <ReviewFact label="Phone" value={draft.contact_phone} />
                    <ReviewFact label="Street" value={draft.address_street} />
                    <ReviewFact
                      label="City"
                      value={[draft.address_postal_code, draft.address_city].filter(Boolean).join(' ')}
                    />
                    <ReviewFact label="Country" value={draft.address_country} />
                  </ReviewSection>
                  <ReviewSection
                    title="Documents"
                    onEdit={canEditReview ? () => goTo('documents', 'back') : undefined}
                  >
                    <ReviewFact
                      label="Registration"
                      value={
                        draft.company_registration_document_path
                          ? verificationDocumentBasename(draft.company_registration_document_path)
                          : 'Not uploaded'
                      }
                    />
                  </ReviewSection>
                </div>
              )}

              {!underReview && !verified && draft.step === 'review' ? (
                <label className="mt-8 flex items-start gap-3 text-[14px] leading-snug text-[#17191d]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-[#D0D5DD] text-[#073b83] focus:ring-[#073b83]"
                    checked={draft.owner_authority_confirmed}
                    onChange={(e) => patch({ owner_authority_confirmed: e.target.checked })}
                    disabled={fieldsLocked}
                  />
                  <span className="min-w-0">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      I confirm I am the owner or an authorized representative, and that this information is
                      accurate.
                      <PartnerHelpTip label="About this confirmation">{PARTNER_HELP.ownerConfirm}</PartnerHelpTip>
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          </div>

          <footer className="listing-creation-footer shrink-0 -mx-4 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="tv-btn-secondary h-11 min-w-[5.5rem] rounded-xl px-4 text-sm"
                onClick={onBack}
                disabled={busy}
              >
                {stepIndex === 0 || underReview || verified ? 'Close' : 'Back'}
              </button>
              <button
                type="button"
                className="tv-btn-primary h-11 min-w-[8rem] rounded-xl px-5 text-sm disabled:opacity-50"
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
          </footer>
        </div>
      </div>
    </div>
  );
}
