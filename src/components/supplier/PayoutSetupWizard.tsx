import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  fetchSupplierProfile,
  updateSupplierCompanyProfile,
  updateSupplierPayout,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { invokeConnectSupplierOnboarding } from '../../data/supabase-connect-onboarding';
import type { SupplierCommercialTermsRow } from '../../data/supabase-earnings';
import { formatBpsAsPercent } from '../../lib/commercial-money';
import { connectCanReceiveTransfers } from '../../lib/connect-payout-status';
import { bankAlreadyManaged } from '../../lib/verification-workspace-lifecycle';
import {
  catalogPayoutRates,
  catalogRateForPreference,
  parsePayoutThreshold,
  type PayoutCyclePreference,
} from '../../lib/payout-preference';
import {
  clearPayoutWizardDraft,
  emptyPayoutWizardDraft,
  loadPayoutWizardDraft,
  PAYOUT_WIZARD_SCREENS,
  PAYOUT_WIZARD_STRIPE_AUTH_COPY,
  payoutWizardStepIndex,
  savePayoutWizardDraft,
  validatePayoutWizardBusiness,
  validatePayoutWizardPreferences,
  type PayoutWizardDraft,
  type PayoutWizardStepId,
} from '../../lib/payout-setup-wizard';
import { isSupplierBusinessIdentityLocked } from '../../lib/supplierVerificationLocks';
import {
  PARTNER_PAYOUT_FREQUENCY_MONTHLY_DETAIL,
  PARTNER_PAYOUT_FREQUENCY_MONTHLY_LABEL,
  PARTNER_PAYOUT_FREQUENCY_TWICE_MONTHLY_DETAIL,
  PARTNER_PAYOUT_FREQUENCY_TWICE_MONTHLY_LABEL,
} from '../../lib/booking-confirmation-copy';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';

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
};

function prefillFromProfile(profile: SupplierProfileRow | null): Partial<PayoutWizardDraft> {
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
    managing_directors: profile?.managing_directors ?? '',
    payment_cycle: profile?.payment_cycle === 'monthly' || profile?.payment_cycle === 'biweekly'
      ? profile.payment_cycle
      : '',
    payout_threshold_min:
      profile?.payout_threshold_min != null ? String(profile.payout_threshold_min) : '',
  };
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
}: Props) {
  const rates = catalogPayoutRates();
  const currency = (payoutCurrency || profile?.connect_default_currency || 'EUR').toUpperCase();
  const isExpress = profile?.connect_account_type === 'express';
  const canReceive = connectCanReceiveTransfers(profile ?? {});
  const bankManaged = bankAlreadyManaged(profile);

  const [draft, setDraft] = useState<PayoutWizardDraft>(() => {
    const saved = loadPayoutWizardDraft(userId);
    const base = emptyPayoutWizardDraft({
      ...prefillFromProfile(profile),
      ...(saved ?? {}),
      step: initialStep ?? saved?.step ?? 'business',
    });
    return base;
  });
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showStripeEmbed, setShowStripeEmbed] = useState(false);
  const [hostedFallbackUrl, setHostedFallbackUrl] = useState<string | null>(null);
  const [persistLabel, setPersistLabel] = useState<string | null>(null);

  const stepIndex = payoutWizardStepIndex(draft.step);
  const screen = PAYOUT_WIZARD_SCREENS[stepIndex]!;
  const progressPct = Math.round(((stepIndex + 1) / PAYOUT_WIZARD_SCREENS.length) * 100);

  useEffect(() => {
    savePayoutWizardDraft(userId, draft);
    setPersistLabel('Progress saved');
    const t = window.setTimeout(() => setPersistLabel(null), 1600);
    return () => window.clearTimeout(t);
  }, [userId, draft]);

  useEffect(() => {
    if (draft.step === 'representative' || draft.step === 'bank') {
      setShowStripeEmbed(true);
    } else {
      setShowStripeEmbed(false);
      setHostedFallbackUrl(null);
    }
  }, [draft.step]);

  const patch = (partial: Partial<PayoutWizardDraft>) => {
    setDraft((d) => ({ ...d, ...partial }));
  };

  const goTo = (step: PayoutWizardStepId, dir: 'forward' | 'back') => {
    setDirection(dir);
    setError(null);
    setNote(null);
    patch({ step });
  };

  const businessLocked = isSupplierBusinessIdentityLocked(
    profile?.verification_status,
    profile?.verification_submitted_at,
    profile?.business_type
  );

  const saveBusiness = async (): Promise<boolean> => {
    const normalizedCountry = normalizeCountryCode(draft.address_country);
    const draftForValidation = { ...draft, address_country: normalizedCountry };
    const invalid = validatePayoutWizardBusiness(draftForValidation);
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
    if (normalizedCountry !== draft.address_country) {
      patch({ address_country: normalizedCountry });
    }

    // When Traverion business identity is locked (pending/verified), skip locked columns
    // so Continue still works — Stripe handles remaining KYC. Phone remains writable.
    if (businessLocked) {
      if (draft.contact_phone.trim() !== (profile?.contact_phone ?? '')) {
        const phoneRes = await updateSupplierCompanyProfile(userId, {
          contact_phone: draft.contact_phone.trim() || null,
        });
        if (!phoneRes.success) {
          setBusy(false);
          setError(userFacingError(phoneRes.error, USER_ERROR.generic));
          return false;
        }
      }
      if (profile?.stripe_connected_account_id) {
        await invokeConnectSupplierOnboarding('ensure_account');
      }
      onProfile(await fetchSupplierProfile(userId));
      patch({ businessSavedAt: new Date().toISOString() });
      setNote('Business details are locked for review — continuing with the saved profile.');
      setBusy(false);
      return true;
    }

    const composedAddress = [
      draft.address_street.trim(),
      [draft.address_postal_code.trim(), draft.address_city.trim()].filter(Boolean).join(' '),
      normalizedCountry,
    ]
      .filter(Boolean)
      .join(', ');
    const res = await updateSupplierCompanyProfile(userId, {
      company_legal_name: draft.company_legal_name.trim(),
      business_type: draft.business_type || null,
      company_registration_number: draft.company_registration_number.trim() || null,
      address_street: draft.address_street.trim() || null,
      address_city: draft.address_city.trim() || null,
      address_postal_code: draft.address_postal_code.trim() || null,
      address_country: normalizedCountry || null,
      business_address: composedAddress || null,
      contact_phone: draft.contact_phone.trim() || null,
      managing_directors: draft.managing_directors.trim() || null,
    });
    if (!res.success) {
      // Soft-continue when lock race: profile already has usable business details.
      if (
        /cannot be changed while your business profile/i.test(res.error ?? '') &&
        Boolean(profile?.company_legal_name)
      ) {
        setNote('Business details are locked for review — continuing with the saved profile.');
        if (profile?.stripe_connected_account_id) {
          await invokeConnectSupplierOnboarding('ensure_account');
        }
        patch({ businessSavedAt: new Date().toISOString() });
        setBusy(false);
        return true;
      }
      setBusy(false);
      setError(userFacingError(res.error, USER_ERROR.generic));
      return false;
    }
    if (profile?.stripe_connected_account_id) {
      await invokeConnectSupplierOnboarding('ensure_account');
    }
    onProfile(await fetchSupplierProfile(userId));
    patch({ businessSavedAt: new Date().toISOString() });
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
      setError(userFacingError(res.error, USER_ERROR.generic));
      return false;
    }
    onProfile(await fetchSupplierProfile(userId));
    patch({ preferencesSavedAt: new Date().toISOString() });
    setBusy(false);
    return true;
  };

  const refreshConnect = async () => {
    setBusy(true);
    setError(null);
    const result = await invokeConnectSupplierOnboarding('refresh');
    setBusy(false);
    if (!result.success) {
      setError(userFacingError(result.error, USER_ERROR.generic));
      return;
    }
    onProfile(await fetchSupplierProfile(userId));
    setNote('Status updated.');
  };

  const onContinue = async () => {
    if (draft.step === 'business') {
      const ok = await saveBusiness();
      if (!ok) return;
      goTo('representative', 'forward');
      return;
    }
    if (draft.step === 'representative') {
      await refreshConnect();
      goTo('bank', 'forward');
      return;
    }
    if (draft.step === 'bank') {
      await refreshConnect();
      goTo('preferences', 'forward');
      return;
    }
    if (draft.step === 'preferences') {
      const ok = await savePreferences();
      if (!ok) return;
      goTo('review', 'forward');
      return;
    }
    // review — exit to settings hub
    onClose();
  };

  const onBack = () => {
    if (stepIndex <= 0) {
      onClose();
      return;
    }
    const prev = PAYOUT_WIZARD_SCREENS[stepIndex - 1]!.id;
    goTo(prev, 'back');
  };

  const onEmbedExit = async () => {
    setShowStripeEmbed(false);
    await refreshConnect();
    setNote('You can continue when ready. Verification is only complete when the provider confirms it.');
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
      ? 'Done'
      : draft.step === 'representative' || draft.step === 'bank'
        ? 'Continue'
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
    if (index > stepIndex) {
      // Only allow one step ahead via Continue path for validation; rail jumps back freely.
      return;
    }
    goTo(PAYOUT_WIZARD_SCREENS[index]!.id, index < stepIndex ? 'back' : 'forward');
  };

  return (
    <div className="payout-wizard listing-creation-workspace stay-creator fixed inset-0 z-[80] flex bg-white">
      {/* Desktop left rail — tour-creation parity */}
      <aside className="listing-creation-rail hidden h-full min-h-0 w-[15.75rem] shrink-0 flex-col overflow-hidden border-r border-[#E5E7EB] lg:flex xl:w-[16.5rem]">
        <div className="px-4 pb-5 pt-[max(0.85rem,env(safe-area-inset-top))]">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="lux-flat inline-flex min-h-10 items-center text-[13px] font-semibold text-[#71717a] hover:text-[#18181b] disabled:opacity-50"
          >
            ← Exit
          </button>
          <p className="mt-7 font-display text-[1.45rem] font-bold leading-[1.12] tracking-tight text-[#18181b]">
            Payout setup
          </p>
          <div className="mt-2.5 min-h-5">
            {persistLabel ? (
              <p className="text-[11.5px] tabular-nums text-[#71717a]" aria-live="polite">
                {persistLabel}
              </p>
            ) : null}
          </div>
          <p className="mt-1 text-[11.5px] font-semibold tabular-nums tracking-wide text-[#71717a]">
            {stepIndex + 1} of {PAYOUT_WIZARD_SCREENS.length} complete
          </p>
          <div
            className="listing-creation-rail-progress mt-3"
            role="progressbar"
            aria-label="Payout setup progress"
            aria-valuemin={0}
            aria-valuemax={PAYOUT_WIZARD_SCREENS.length}
            aria-valuenow={stepIndex}
          >
            <div
              className="listing-creation-rail-progress__fill"
              style={{ width: `${(stepIndex / PAYOUT_WIZARD_SCREENS.length) * 100}%` }}
            />
          </div>
        </div>
        <nav aria-label="Payout setup steps" className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
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
                      'lux-flat flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors',
                      current
                        ? 'bg-[rgba(7,59,131,0.08)] font-semibold text-[#073b83]'
                        : complete
                          ? 'font-medium text-[#18181b] hover:bg-[#f5f6f8]'
                          : locked
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
        <p className="truncate text-sm font-semibold text-[#18181b]">Payout setup</p>
        <p
          className="min-w-16 text-right text-xs text-[#71717a]"
          aria-live="polite"
        >
          {persistLabel ?? ''}
        </p>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[28rem] flex-1 flex-col overflow-hidden px-4 sm:px-6 lg:max-w-[32rem] lg:px-8">
        <div className="shrink-0 py-3 lg:hidden">
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 [-webkit-overflow-scrolling:touch]">
          <div key={draft.step} className={stageClass}>
            <p className="mb-1 hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83] lg:block">
              Step {stepIndex + 1} of {PAYOUT_WIZARD_SCREENS.length}
            </p>
            <h1 className="stay-title text-[1.45rem] font-bold tracking-tight text-[#18181b] sm:text-[1.6rem]">
              {screen.title}
            </h1>
            <p className="stay-lede mt-1.5 text-[13px] leading-relaxed text-[#52525b]">{screen.lede}</p>

            {error ? (
              <p className="mt-3 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900" role="alert">
                {error}
              </p>
            ) : null}
            {note ? (
              <p className="mt-3 text-[12px] text-[#18181b]" role="status">
                {note}
              </p>
            ) : null}

            {draft.step === 'business' ? (
              <form
                className="mt-4 grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void onContinue();
                }}
              >
                {businessLocked ? (
                  <p className="rounded-[10px] border border-[#dbe4f0] bg-[#f0f4fa] px-3 py-2 text-[12px] leading-relaxed text-[#1e3a5f]">
                    These company details are locked while your business profile is under review. You can continue —
                    identity and bank steps are completed securely with Stripe.
                  </p>
                ) : null}
                <label className="block text-[13px]">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                    Legal business name
                  </span>
                  <input
                    className="tv-input h-11 w-full"
                    value={draft.company_legal_name}
                    onChange={(e) => patch({ company_legal_name: e.target.value })}
                    autoComplete="organization"
                    required
                    readOnly={businessLocked}
                  />
                </label>
                <label className="block text-[13px]">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                    Business type
                  </span>
                  <select
                    className="tv-input h-11 w-full"
                    value={draft.business_type}
                    onChange={(e) =>
                      patch({
                        business_type: e.target.value as '' | 'company' | 'individual',
                      })
                    }
                  >
                    <option value="">Select…</option>
                    <option value="company">Company</option>
                    <option value="individual">Individual</option>
                  </select>
                </label>
                <label className="block text-[13px]">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                    Registration number
                  </span>
                  <input
                    className="tv-input h-11 w-full"
                    value={draft.company_registration_number}
                    onChange={(e) => patch({ company_registration_number: e.target.value })}
                  />
                </label>
                <label className="block text-[13px]">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                    Street address
                  </span>
                  <input
                    className="tv-input h-11 w-full"
                    value={draft.address_street}
                    onChange={(e) => patch({ address_street: e.target.value })}
                    autoComplete="street-address"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                      Postal code
                    </span>
                    <input
                      className="tv-input h-11 w-full"
                      value={draft.address_postal_code}
                      onChange={(e) => patch({ address_postal_code: e.target.value })}
                      autoComplete="postal-code"
                    />
                  </label>
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                      City
                    </span>
                    <input
                      className="tv-input h-11 w-full"
                      value={draft.address_city}
                      onChange={(e) => patch({ address_city: e.target.value })}
                      autoComplete="address-level2"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                      Country
                    </span>
                    <input
                      className="tv-input h-11 w-full"
                      value={draft.address_country}
                      onChange={(e) => patch({ address_country: e.target.value })}
                      placeholder="FI"
                      autoComplete="country"
                    />
                  </label>
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                      Phone
                    </span>
                    <input
                      className="tv-input h-11 w-full"
                      value={draft.contact_phone}
                      onChange={(e) => patch({ contact_phone: e.target.value })}
                      autoComplete="tel"
                    />
                  </label>
                </div>
                <label className="block text-[13px]">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                    Authorized representative
                  </span>
                  <input
                    className="tv-input h-11 w-full"
                    value={draft.managing_directors}
                    onChange={(e) => patch({ managing_directors: e.target.value })}
                    placeholder="Full legal name"
                  />
                </label>
              </form>
            ) : null}

            {draft.step === 'representative' || draft.step === 'bank' ? (
              <div className="mt-4 space-y-3">
                {isExpress && !draft.stripeAuthAcknowledged ? (
                  <div className="rounded-[10px] border border-[#dbe4f0] bg-[#f0f4fa] px-3 py-3 text-[12px] leading-relaxed text-[#1e3a5f]">
                    <p className="font-semibold text-[#073b83]">Secure confirmation</p>
                    <p className="mt-1">{PAYOUT_WIZARD_STRIPE_AUTH_COPY}</p>
                    <button
                      type="button"
                      className="tv-btn-primary mt-3 h-10 w-full text-[13px]"
                      onClick={() => patch({ stripeAuthAcknowledged: true })}
                    >
                      Continue with Stripe
                    </button>
                  </div>
                ) : null}

                {(draft.stripeAuthAcknowledged || !isExpress) && showStripeEmbed ? (
                  <Suspense
                    fallback={
                      <p className="text-[13px] text-[#52525b]" role="status">
                        Loading secure step…
                      </p>
                    }
                  >
                    <ConnectEmbeddedPanel
                      component={
                        draft.step === 'bank' ? 'account_management' : 'account_onboarding'
                      }
                      expectStripeAuth={false}
                      onExit={() => void onEmbedExit()}
                      onHostedFallback={(url) => {
                        setHostedFallbackUrl(url);
                        setShowStripeEmbed(false);
                      }}
                      onError={(msg) => setError(msg)}
                    />
                  </Suspense>
                ) : null}

                {hostedFallbackUrl ? (
                  <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] text-amber-950">
                    <p className="font-semibold">Continue securely</p>
                    <p className="mt-1">A secure Stripe page is required for this step. You’ll return here afterward.</p>
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
                  Preferences are saved for when Traverion runs payouts. They do not move money by themselves
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
              <div className="mt-4 space-y-3 text-[13px]">
                <ul className="space-y-2">
                  <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2">
                    <span className="text-[#52525b]">Business details</span>
                    <span className="font-semibold text-[#18181b]">
                      {draft.businessSavedAt || profile?.company_legal_name ? 'Saved' : 'Needed'}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2">
                    <span className="text-[#52525b]">Representative verification</span>
                    <span className="font-semibold text-[#18181b]">
                      {canReceive
                        ? 'Complete'
                        : profile?.connect_details_submitted
                          ? 'Submitted — pending review'
                          : 'In progress'}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2">
                    <span className="text-[#52525b]">Bank account</span>
                    <span className="font-semibold text-[#18181b]">
                      {bankManaged ? 'On file' : 'Needed'}
                    </span>
                  </li>
                  <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2">
                    <span className="text-[#52525b]">Payout preferences</span>
                    <span className="font-semibold text-[#18181b]">
                      {draft.preferencesSavedAt || profile?.payment_cycle ? 'Saved' : 'Needed'}
                    </span>
                  </li>
                </ul>
                <p className="text-[12px] leading-relaxed text-[#52525b]">
                  {canReceive
                    ? 'Provider verification looks complete. Traverion payout execution stays separately controlled and is currently off.'
                    : 'Finish any remaining Stripe steps above. Traverion never marks verification complete until the provider confirms it.'}
                </p>
                <button
                  type="button"
                  className="text-[13px] font-semibold text-[#073b83]"
                  disabled={busy}
                  onClick={() => void refreshConnect()}
                >
                  Refresh status
                </button>
                <button
                  type="button"
                  className="ml-4 text-[13px] font-semibold text-[#71717a]"
                  onClick={() => {
                    clearPayoutWizardDraft(userId);
                    setNote('Saved progress cleared for this device.');
                  }}
                >
                  Clear saved progress
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="listing-creation-footer shrink-0 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[28rem] grid-cols-3 items-center gap-2 lg:max-w-[32rem]">
          <button
            type="button"
            className="tv-btn-ghost stay-nav-btn stay-nav-btn--start h-11 justify-self-start px-3 text-[13px]"
            onClick={onBack}
            disabled={busy}
          >
            {stepIndex === 0 ? 'Exit' : 'Back'}
          </button>
          <span className="justify-self-center text-[11px] font-medium text-[#a1a1aa]">
            {stepIndex + 1}/{PAYOUT_WIZARD_SCREENS.length}
          </span>
          <button
            type="button"
            className="tv-btn-primary stay-nav-btn stay-nav-btn--end h-11 justify-self-end px-4 text-[13px]"
            onClick={() => void onContinue()}
            disabled={
              busy ||
              !canEdit ||
              ((draft.step === 'representative' || draft.step === 'bank') &&
                isExpress &&
                !draft.stripeAuthAcknowledged)
            }
          >
            {continueLabel}
          </button>
        </div>
      </footer>
      </div>
    </div>
  );
}
