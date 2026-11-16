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
  clearPayoutWizardDraft,
  emptyPayoutWizardDraft,
  loadPayoutWizardDraft,
  parsePayoutWizardDob,
  PAYOUT_WIZARD_SCREENS,
  PAYOUT_WIZARD_STRIPE_AUTH_COPY,
  PAYOUT_WIZARD_TOS_COPY,
  firstOutstandingWizardStep,
  payoutWizardStepIndex,
  savePayoutWizardDraft,
  validatePayoutWizardBusiness,
  validatePayoutWizardIdentity,
  validatePayoutWizardPreferences,
  validatePayoutWizardRepresentative,
  type PayoutWizardDraft,
  type PayoutWizardStepId,
} from '../../lib/payout-setup-wizard';
import { STRIPE_RECIPIENT_AGREEMENT } from '../../lib/stripe-recipient-agreement';
import { createBankAccountToken } from '../../lib/stripe-js-client';
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
  const directors = profile?.managing_directors?.trim() ?? '';
  const nameParts = directors.split(/\s+/).filter(Boolean);
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
    rep_first_name: nameParts[0] ?? '',
    rep_last_name: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '',
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
    /verification\.document|additional_document|documents|proof_of_liveness|liveness|ssn_last_4/i.test(key)
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
    return emptyPayoutWizardDraft({
      ...prefillFromProfile(profile),
      ...(saved ?? {}),
      tos_accepted: false,
      step: initialStep ?? saved?.step ?? 'business',
    });
  });
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showStripeEmbed, setShowStripeEmbed] = useState(false);
  const [showIdentityRemediation, setShowIdentityRemediation] = useState(false);
  const [hostedFallbackUrl, setHostedFallbackUrl] = useState<string | null>(null);
  const [persistLabel, setPersistLabel] = useState<string | null>(null);
  const [bankIban, setBankIban] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [bankMasked, setBankMasked] = useState<string | null>(null);

  const stepIndex = payoutWizardStepIndex(draft.step);
  const screen = PAYOUT_WIZARD_SCREENS[stepIndex]!;
  const progressPct = Math.round(((stepIndex + 1) / PAYOUT_WIZARD_SCREENS.length) * 100);
  const useStripeEmbed =
    isExpress &&
    (draft.step === 'representative' || draft.step === 'identity' || draft.step === 'bank');

  useEffect(() => {
    savePayoutWizardDraft(userId, draft);
    setPersistLabel('Progress saved');
    const t = window.setTimeout(() => setPersistLabel(null), 1600);
    return () => window.clearTimeout(t);
  }, [userId, draft]);

  useEffect(() => {
    if (useStripeEmbed && (draft.stripeAuthAcknowledged || !isExpress)) {
      setShowStripeEmbed(true);
    } else if (!useStripeEmbed) {
      setShowStripeEmbed(false);
      setHostedFallbackUrl(null);
    }
  }, [draft.step, draft.stripeAuthAcknowledged, useStripeEmbed, isExpress]);

  useEffect(() => {
    if (!bankHolder && draft.company_legal_name) {
      setBankHolder(draft.company_legal_name);
    }
  }, [draft.company_legal_name, bankHolder]);

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
      await invokeConnectSupplierOnboarding('ensure_account');
      if (isCustom && !isExpress) {
        const submit = await invokeConnectSupplierOnboarding('submit_business', {
          business: {
            legal_name: draft.company_legal_name.trim() || profile?.company_legal_name || undefined,
            business_type: draft.business_type || undefined,
            registration_number: draft.company_registration_number.trim() || undefined,
            phone: draft.contact_phone.trim() || undefined,
            address: {
              line1: draft.address_street.trim(),
              city: draft.address_city.trim(),
              postal_code: draft.address_postal_code.trim(),
              country: normalizedCountry,
            },
          },
        });
        if (!submit.success && !/409|express|turned off|not approved/i.test(submit.error ?? '')) {
          setBusy(false);
          setError(userFacingError(submit.error, USER_ERROR.generic));
          return false;
        }
      }
      onProfile(await fetchSupplierProfile(userId));
      patch({ businessSavedAt: new Date().toISOString() });
      setNote('Business details are locked for review — payout details were sent from the saved profile.');
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
      managing_directors:
        draft.managing_directors.trim() ||
        `${draft.rep_first_name} ${draft.rep_last_name}`.trim() ||
        null,
    });
    if (!res.success) {
      if (
        /cannot be changed while your business profile/i.test(res.error ?? '') &&
        Boolean(profile?.company_legal_name)
      ) {
        setNote('Business details are locked for review — continuing with the saved profile.');
        await invokeConnectSupplierOnboarding('ensure_account');
        patch({ businessSavedAt: new Date().toISOString() });
        setBusy(false);
        return true;
      }
      setBusy(false);
      setError(userFacingError(res.error, USER_ERROR.generic));
      return false;
    }

    await invokeConnectSupplierOnboarding('ensure_account');
    if (isCustom && !isExpress) {
      const submit = await invokeConnectSupplierOnboarding('submit_business', {
        business: {
          legal_name: draft.company_legal_name.trim(),
          business_type: draft.business_type || undefined,
          registration_number: draft.company_registration_number.trim() || undefined,
          phone: draft.contact_phone.trim() || undefined,
          address: {
            line1: draft.address_street.trim(),
            city: draft.address_city.trim(),
            postal_code: draft.address_postal_code.trim(),
            country: normalizedCountry,
          },
        },
      });
      if (!submit.success && !/409|express|turned off|not approved/i.test(submit.error ?? '')) {
        setBusy(false);
        setError(userFacingError(submit.error, USER_ERROR.generic));
        return false;
      }
    }

    onProfile(await fetchSupplierProfile(userId));
    patch({ businessSavedAt: new Date().toISOString() });
    setBusy(false);
    return true;
  };

  const saveRepresentativeNative = async (): Promise<boolean> => {
    const invalid = validatePayoutWizardRepresentative(draft);
    if (invalid) {
      setError(invalid);
      return false;
    }
    if (!canEdit) {
      setError('Your role can view setup but cannot change it.');
      return false;
    }
    const dob = parsePayoutWizardDob(draft.rep_dob);
    if (!dob) {
      setError('Enter a valid date of birth.');
      return false;
    }
    setBusy(true);
    setError(null);
    const country = normalizeCountryCode(draft.address_country) || 'FI';
    const result = await invokeConnectSupplierOnboarding('submit_representative', {
      representative: {
        first_name: draft.rep_first_name.trim(),
        last_name: draft.rep_last_name.trim(),
        email: draft.rep_email.trim() || undefined,
        phone: draft.rep_phone.trim() || draft.contact_phone.trim() || undefined,
        title: draft.rep_title.trim() || undefined,
        dob,
        address: {
          line1: draft.address_street.trim(),
          city: draft.address_city.trim(),
          postal_code: draft.address_postal_code.trim(),
          country,
        },
        relationship: {
          owner: draft.rep_is_owner,
          executive: true,
          director: draft.business_type === 'company',
          percent_ownership: draft.rep_is_owner
            ? Number(draft.rep_percent_ownership) || null
            : null,
        },
      },
    });
    if (!result.success) {
      setBusy(false);
      setError(userFacingError(result.error, USER_ERROR.generic));
      return false;
    }
    const fullName = `${draft.rep_first_name.trim()} ${draft.rep_last_name.trim()}`.trim();
    await updateSupplierCompanyProfile(userId, { managing_directors: fullName || null });
    onProfile(await fetchSupplierProfile(userId));
    patch({
      representativeSavedAt: new Date().toISOString(),
      managing_directors: fullName,
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
    setBusy(true);
    setError(null);
    const result = await invokeConnectSupplierOnboarding('accept_tos', {
      tos_accepted: true,
      agreement_version: STRIPE_RECIPIENT_AGREEMENT.version,
    });
    if (!result.success) {
      setBusy(false);
      setError(userFacingError(result.error, USER_ERROR.generic));
      return false;
    }
    onProfile(await fetchSupplierProfile(userId));
    patch({ identitySavedAt: new Date().toISOString() });
    setNote('Agreement recorded. Additional identity checks may still be required.');
    setBusy(false);
    return true;
  };

  const saveBankNative = async (): Promise<boolean> => {
    if (!canEdit) {
      setError('Your role can view setup but cannot change it.');
      return false;
    }
    if (bankManaged && !bankRequirementDue && !bankIban.trim()) {
      patch({ bankSavedAt: new Date().toISOString() });
      return true;
    }
    if (!bankIban.trim() || !bankHolder.trim()) {
      setError('Enter the account holder name and IBAN.');
      return false;
    }
    setBusy(true);
    setError(null);
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
      setError(userFacingError(result.error, USER_ERROR.generic));
      return false;
    }
    setBankMasked(`•••• ${bankIban.replace(/\s+/g, '').slice(-4)}`);
    setBankIban('');
    onProfile(await fetchSupplierProfile(userId));
    patch({ bankSavedAt: new Date().toISOString() });
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
      if (isExpress) {
        await refreshConnect();
        goTo('identity', 'forward');
        return;
      }
      const ok = await saveRepresentativeNative();
      if (!ok) return;
      goTo('identity', 'forward');
      return;
    }
    if (draft.step === 'identity') {
      if (isExpress) {
        await refreshConnect();
        goTo('bank', 'forward');
        return;
      }
      const ok = await saveIdentityNative();
      if (!ok) return;
      goTo('bank', 'forward');
      return;
    }
    if (draft.step === 'bank') {
      if (isExpress) {
        await refreshConnect();
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
      goTo('review', 'forward');
      return;
    }
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
      ? 'Done'
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
    if (canReceive) return 'Complete';
    if (identityDocumentDue || accountRestricted) return 'Action required';
    if (draft.identitySavedAt || profile?.connect_details_submitted) {
      return 'Submitted — pending review';
    }
    return 'Needed';
  };

  const reviewRepLabel = () => {
    if (draft.representativeSavedAt || profile?.connect_details_submitted || canReceive) {
      return draft.representativeSavedAt || profile?.connect_details_submitted
        ? 'Saved'
        : 'Complete';
    }
    return isExpress ? 'In progress' : 'Needed';
  };

  return (
    <div className="payout-wizard listing-creation-workspace stay-creator fixed inset-0 z-[80] flex bg-white">
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
          <p className="truncate text-sm font-semibold text-[#18181b]">Set up payouts</p>
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
                <p
                  className="mt-3 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900"
                  role="alert"
                >
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
                      These company details are locked while your business profile is under review. You can
                      continue — identity and bank steps are completed securely.
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
                      disabled={businessLocked}
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
                      readOnly={businessLocked}
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
                      readOnly={businessLocked}
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
                        readOnly={businessLocked}
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
                        readOnly={businessLocked}
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
                        readOnly={businessLocked}
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
                </form>
              ) : null}

              {draft.step === 'representative' && !isExpress ? (
                <form
                  className="mt-4 grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onContinue();
                  }}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-[13px]">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                        First name
                      </span>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.rep_first_name}
                        onChange={(e) => patch({ rep_first_name: e.target.value })}
                        autoComplete="given-name"
                        required
                      />
                    </label>
                    <label className="block text-[13px]">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                        Last name
                      </span>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.rep_last_name}
                        onChange={(e) => patch({ rep_last_name: e.target.value })}
                        autoComplete="family-name"
                        required
                      />
                    </label>
                  </div>
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                      Date of birth
                    </span>
                    <input
                      className="tv-input h-11 w-full"
                      type="date"
                      value={draft.rep_dob}
                      onChange={(e) => patch({ rep_dob: e.target.value })}
                      required
                    />
                  </label>
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                      Title / role
                    </span>
                    <input
                      className="tv-input h-11 w-full"
                      value={draft.rep_title}
                      onChange={(e) => patch({ rep_title: e.target.value })}
                      placeholder="Managing director"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-[13px]">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                        Email
                      </span>
                      <input
                        className="tv-input h-11 w-full"
                        type="email"
                        value={draft.rep_email}
                        onChange={(e) => patch({ rep_email: e.target.value })}
                        autoComplete="email"
                      />
                    </label>
                    <label className="block text-[13px]">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                        Phone
                      </span>
                      <input
                        className="tv-input h-11 w-full"
                        value={draft.rep_phone}
                        onChange={(e) => patch({ rep_phone: e.target.value })}
                        autoComplete="tel"
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-[13px] text-[#18181b]">
                    <input
                      type="checkbox"
                      checked={draft.rep_is_owner}
                      onChange={(e) => patch({ rep_is_owner: e.target.checked })}
                    />
                    This person is an owner of the business
                  </label>
                  {draft.rep_is_owner ? (
                    <label className="block text-[13px]">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                        Ownership %
                      </span>
                      <input
                        className="tv-input h-11 w-28"
                        value={draft.rep_percent_ownership}
                        onChange={(e) => patch({ rep_percent_ownership: e.target.value })}
                        inputMode="decimal"
                      />
                    </label>
                  ) : null}
                </form>
              ) : null}

              {draft.step === 'identity' && !isExpress ? (
                <div className="mt-4 space-y-4">
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
                      Stripe is asking for this agreement again. Check the box to accept the current version.
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
                  <p className="text-[12px] leading-relaxed text-[#71717a]">
                    If extra identity checks are needed, complete them here. Traverion does not store
                    identity documents. Your information is being reviewed only after the provider confirms
                    it.
                  </p>
                  {identityDocumentDue || accountRestricted ? (
                    <div className="rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-3">
                      <p className="text-[13px] font-semibold text-[#18181b]">Additional verification</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#52525b]">
                        The provider still needs an identity document or a correction. Complete that secure
                        step inside Traverion, then refresh status.
                      </p>
                      {!showIdentityRemediation ? (
                        <button
                          type="button"
                          className="tv-btn-primary mt-3 h-10 px-3 text-[13px]"
                          onClick={() => setShowIdentityRemediation(true)}
                        >
                          Continue verification
                        </button>
                      ) : (
                        <div className="mt-3">
                          <Suspense fallback={<p className="text-[12px] text-[#71717a]">Loading verification…</p>}>
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
                              onError={(msg) => setError(msg)}
                            />
                          </Suspense>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {draft.step === 'bank' && !isExpress ? (
                <form
                  className="mt-4 grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onContinue();
                  }}
                >
                  <p className="text-[12px] leading-relaxed text-[#52525b]">
                    Add your bank account. Traverion never stores your full account number — it is
                    tokenized securely before submission.
                  </p>
                  {(bankManaged || bankMasked) && (
                    <p className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-950">
                      Bank on file{bankMasked ? `: ${bankMasked}` : ''}. Enter a new IBAN only to replace
                      it.
                    </p>
                  )}
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                      Account holder name
                    </span>
                    <input
                      className="tv-input h-11 w-full"
                      value={bankHolder}
                      onChange={(e) => setBankHolder(e.target.value)}
                      autoComplete="name"
                    />
                  </label>
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                      IBAN
                    </span>
                    <input
                      className="tv-input h-11 w-full font-mono text-[13px]"
                      value={bankIban}
                      onChange={(e) => setBankIban(e.target.value)}
                      autoComplete="off"
                      placeholder="FI00 0000 0000 0000 00"
                      spellCheck={false}
                    />
                  </label>
                </form>
              ) : null}

              {useStripeEmbed ? (
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
                        Continue
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
                <div className="mt-4 space-y-3 text-[13px]">
                  <p className="text-[12px] font-semibold text-[#18181b]">
                    Verification status:{' '}
                    {connectOnboardingLabel(profile?.connect_onboarding_status, {
                      connect_account_livemode: profile?.connect_account_livemode,
                    })}
                  </p>
                  <ul className="space-y-2">
                    <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2">
                      <span className="text-[#52525b]">Business information</span>
                      <span className="font-semibold text-[#18181b]">
                        {draft.businessSavedAt || profile?.company_legal_name ? 'Saved' : 'Needed'}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2">
                      <span className="text-[#52525b]">Representative details</span>
                      <span className="font-semibold text-[#18181b]">{reviewRepLabel()}</span>
                    </li>
                    <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2">
                      <span className="text-[#52525b]">Identity verification</span>
                      <span className="font-semibold text-[#18181b]">{reviewIdentityLabel()}</span>
                    </li>
                    <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2">
                      <span className="text-[#52525b]">Bank account</span>
                      <span className="font-semibold text-[#18181b]">
                        {bankManaged || draft.bankSavedAt ? 'On file' : 'Needed'}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3 border-b border-[#f1f5f9] py-2">
                      <span className="text-[#52525b]">Payout preferences</span>
                      <span className="font-semibold text-[#18181b]">
                        {draft.preferencesSavedAt || profile?.payment_cycle ? 'Saved' : 'Needed'}
                      </span>
                    </li>
                  </ul>
                  {accountRestricted ? (
                    <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-950">
                      This payout account needs attention before it can be used.
                      {profile?.connect_disabled_reason
                        ? ' Update the items below and refresh status.'
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
                  <p className="text-[12px] leading-relaxed text-[#52525b]">
                    {canReceive
                      ? "You're ready to receive payouts once Traverion enables payout execution. Execution stays separately controlled and is currently off."
                      : 'Finish any remaining steps above. Traverion never marks verification complete until the provider confirms it. Your information is being reviewed when status shows pending.'}
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
                (useStripeEmbed && isExpress && !draft.stripeAuthAcknowledged)
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
