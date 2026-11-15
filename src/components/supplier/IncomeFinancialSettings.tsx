import { lazy, Suspense, useEffect, useId, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Circle,
  CreditCard,
  Info,
  Lock,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {
  fetchSupplierProfile,
  updateSupplierPayout,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import {
  invokeConnectSupplierOnboarding,
  type ConnectEmbeddedComponent,
} from '../../data/supabase-connect-onboarding';
import type { SupplierCommercialTermsRow } from '../../data/supabase-earnings';
import { formatBpsAsPercent, nextPayoutRunDateUtc } from '../../lib/commercial-money';
import {
  connectCanReceiveTransfers,
  connectOnboardingLabel,
} from '../../lib/connect-payout-status';
import {
  buildConnectProgressSteps,
  connectExperienceLabel,
  deriveConnectExperienceState,
  listSupplierPayoutBlocks,
} from '../../lib/connect-payout-progress';
import { humanizeConnectRequirements } from '../../lib/connect-requirement-labels';
import { bankAlreadyManaged } from '../../lib/verification-workspace-lifecycle';
import {
  catalogPayoutRates,
  catalogRateForPreference,
  parsePayoutThreshold,
  type PayoutCyclePreference,
} from '../../lib/payout-preference';
import {
  isSupplierPayoutDetailsLocked,
  SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL,
} from '../../lib/supplierVerificationLocks';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  PARTNER_PAYOUT_FREQUENCY_HINT,
  PARTNER_PAYOUT_FREQUENCY_MONTHLY_DETAIL,
  PARTNER_PAYOUT_FREQUENCY_MONTHLY_LABEL,
  PARTNER_PAYOUT_FREQUENCY_TWICE_MONTHLY_DETAIL,
  PARTNER_PAYOUT_FREQUENCY_TWICE_MONTHLY_LABEL,
  PARTNER_PAYOUT_THRESHOLD_HINT,
} from '../../lib/booking-confirmation-copy';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';

const ConnectEmbeddedPanel = lazy(() => import('./ConnectEmbeddedPanel'));

type Props = {
  userId: string;
  profile: SupplierProfileRow | null;
  commercialTerms: SupplierCommercialTermsRow | null;
  payoutCurrency: string | null;
  canEdit: boolean;
  onProfile: (profile: SupplierProfileRow | null) => void;
  financialHold?: boolean;
  debtMinor?: number;
  eligibleEarningsMinor?: number;
};

function cadenceLabel(cadence: string | null | undefined): string {
  if (cadence === 'semimonthly') return 'Twice monthly';
  if (cadence === 'monthly') return 'Monthly';
  return 'Not set';
}

function preferenceLabel(cycle: string | null | undefined): string {
  if (cycle === 'biweekly') return 'Twice monthly';
  if (cycle === 'monthly') return 'Monthly';
  return 'Not saved';
}

function formatEstimateDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function InfoTip({ label, children }: { label: string; children: string }) {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#073b83] hover:bg-[#f0f4fa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073b83]"
        aria-label={label}
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-0 top-[calc(100%+6px)] z-20 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-left text-[12px] leading-snug text-[#3f3f46] shadow-sm"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

function stepIcon(state: string) {
  if (state === 'complete') return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
  if (state === 'current') return <Circle className="h-4 w-4 fill-[#073b83] text-[#073b83]" aria-hidden />;
  if (state === 'blocked') return <Lock className="h-4 w-4 text-red-600" aria-hidden />;
  return <Circle className="h-4 w-4 text-[#a1a1aa]" aria-hidden />;
}

function bankStatusCopy(profile: SupplierProfileRow | null | undefined): {
  headline: string;
  detail: string;
  managed: boolean;
} {
  if (bankAlreadyManaged(profile)) {
    if (profile?.connect_payouts_enabled) {
      return {
        headline: 'Bank destination on file',
        detail:
          'Managed in verification. Full account numbers are never stored in Traverion. Provider payout capability is separate from Traverion’s payout schedule.',
        managed: true,
      };
    }
    return {
      headline: 'Bank details submitted',
      detail:
        'Destination was submitted with verification. Open Manage bank account to review or replace it — you will not restart onboarding.',
      managed: true,
    };
  }
  if (profile?.stripe_connected_account_id) {
    return {
      headline: 'Bank account not connected',
      detail: 'Add a bank account from verification when you are ready.',
      managed: false,
    };
  }
  return {
    headline: 'Bank account not connected',
    detail: 'Complete verification first, then add a bank account for payouts.',
    managed: false,
  };
}

export default function IncomeFinancialSettings({
  userId,
  profile,
  commercialTerms,
  payoutCurrency,
  canEdit,
  onProfile,
  financialHold = false,
  debtMinor = 0,
  eligibleEarningsMinor,
}: Props) {
  const locked = isSupplierPayoutDetailsLocked(
    profile?.payout_verification_status,
    profile?.payout_verification_submitted_at
  );
  const rates = catalogPayoutRates();
  const currency = (payoutCurrency || profile?.connect_default_currency || 'EUR').toUpperCase();
  const [cycle, setCycle] = useState<PayoutCyclePreference | ''>(profile?.payment_cycle ?? '');
  const [threshold, setThreshold] = useState(
    profile?.payout_threshold_min != null ? String(profile.payout_threshold_min) : ''
  );
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [preferenceMessage, setPreferenceMessage] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectNote, setConnectNote] = useState<string | null>(null);
  const [embedComponent, setEmbedComponent] = useState<ConnectEmbeddedComponent | null>(null);
  const [hostedFallbackUrl, setHostedFallbackUrl] = useState<string | null>(null);

  const experience = deriveConnectExperienceState(profile);
  const experienceLabel = connectExperienceLabel(experience);
  const statusLabel = connectOnboardingLabel(profile?.connect_onboarding_status, {
    connect_account_livemode: profile?.connect_account_livemode,
  });
  const canReceiveTransfers = connectCanReceiveTransfers(profile ?? {});
  const progress = buildConnectProgressSteps(profile).filter(
    (s) => s.id !== 'ready_for_payouts'
  );
  const requirementLabels = humanizeConnectRequirements([
    ...(Array.isArray(profile?.connect_requirements_currently_due)
      ? profile!.connect_requirements_currently_due!
      : []),
    ...(Array.isArray(profile?.connect_requirements_past_due)
      ? profile!.connect_requirements_past_due!
      : []),
  ]);
  /** Express LIVE (and incomplete accounts) use embedded components inside Traverion. */
  const useEmbeddedStripeSetup =
    Boolean(profile?.stripe_connected_account_id) &&
    (profile?.connect_account_type === 'express' || profile?.connect_account_livemode === true) &&
    !canReceiveTransfers;
  const useNativeCustomForms =
    profile?.connect_account_type === 'custom' ||
    (!profile?.stripe_connected_account_id && profile?.connect_account_livemode !== true);
  const accountBlocks = listSupplierPayoutBlocks({
    profile,
    financialHold,
    debtMinor,
    eligibleEarningsMinor,
  }).filter((b) => b.category === 'account');
  const bank = bankStatusCopy(profile);
  const nextAction =
    accountBlocks[0]?.message ??
    (experience === 'ready_for_bank_payouts'
      ? null
      : experience === 'not_started'
        ? 'Complete verification to enable automatic payouts.'
        : null);

  const estimatedNext =
    commercialTerms?.payout_cadence === 'monthly' || commercialTerms?.payout_cadence === 'semimonthly'
      ? nextPayoutRunDateUtc({
          cadence: commercialTerms.payout_cadence === 'semimonthly' ? 'semimonthly' : 'monthly',
          now: new Date(),
        })
      : null;

  useEffect(() => {
    setCycle(profile?.payment_cycle ?? '');
    setThreshold(profile?.payout_threshold_min != null ? String(profile.payout_threshold_min) : '');
  }, [profile?.id, profile?.updated_at, profile?.payment_cycle, profile?.payout_threshold_min]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash === '#income-connect-payouts' || hash === '#business-payouts' || hash === '#income-payout-account') {
      document.getElementById('income-payout-settings')?.scrollIntoView({ block: 'start' });
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const connect = params.get('connect');
    if (connect !== 'return' && connect !== 'refresh') return;
    let cancelled = false;
    void (async () => {
      setConnectBusy(true);
      setConnectError(null);
      const result = await invokeConnectSupplierOnboarding('refresh');
      if (cancelled) return;
      setConnectBusy(false);
      if (!result.success) {
        setConnectError(userFacingError(result.error, USER_ERROR.generic));
        return;
      }
      setConnectNote(
        'Status updated. Submitting a form does not by itself mean verification is complete.'
      );
      const next = await fetchSupplierProfile(userId);
      if (!cancelled) onProfile(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, onProfile]);

  const refreshStatus = async () => {
    setConnectBusy(true);
    setConnectError(null);
    const result = await invokeConnectSupplierOnboarding('refresh');
    setConnectBusy(false);
    if (!result.success) {
      setConnectError(userFacingError(result.error, USER_ERROR.generic));
      return;
    }
    setConnectNote('Verification status refreshed.');
    onProfile(await fetchSupplierProfile(userId));
  };

  const openHostedFallback = async () => {
    setConnectBusy(true);
    const result = await invokeConnectSupplierOnboarding('account_link');
    setConnectBusy(false);
    if (!result.success || !result.url) {
      setConnectError(
        userFacingError(
          result.error ?? 'Could not open secure Stripe setup. Try again.',
          USER_ERROR.generic
        )
      );
      return;
    }
    window.location.assign(result.url);
  };

  const openEmbedded = (component: ConnectEmbeddedComponent) => {
    setConnectError(null);
    setConnectNote(null);
    setHostedFallbackUrl(null);
    if (!canEdit) {
      setConnectError('Your role can view payout verification but cannot change it.');
      return;
    }
    setEmbedComponent(component);
  };

  const openVerification = (focus: 'full' | 'bank' = 'full', opts?: { replace?: boolean }) => {
    setConnectError(null);
    setConnectNote(null);
    if (!canEdit) {
      setConnectError('Your role can view payout verification but cannot change it.');
      return;
    }
    if (useEmbeddedStripeSetup) {
      openEmbedded(focus === 'bank' ? 'account_management' : 'account_onboarding');
      return;
    }
    if (useNativeCustomForms) {
      const params = new URLSearchParams();
      if (focus === 'bank') params.set('focus', 'bank');
      if (focus === 'bank' && opts?.replace) params.set('replace', '1');
      const q = params.toString() ? `?${params.toString()}` : '';
      navigateSupplierUrl(`${PARTNER_APP_BASE}/verification${q}`);
      return;
    }
    void openHostedFallback();
  };

  const onEmbedExit = async () => {
    setEmbedComponent(null);
    setConnectBusy(true);
    await invokeConnectSupplierOnboarding('refresh');
    onProfile(await fetchSupplierProfile(userId));
    setConnectBusy(false);
    setConnectNote(
      'Status updated. Submitting a form does not by itself mean verification is complete.'
    );
  };

  const selectedCatalog =
    cycle === 'monthly' || cycle === 'biweekly' ? formatBpsAsPercent(catalogRateForPreference(cycle)) : null;
  const agreementRate = commercialTerms ? formatBpsAsPercent(commercialTerms.commission_bps) : null;
  const savedPreference = preferenceLabel(profile?.payment_cycle);
  const activeCadence = cadenceLabel(commercialTerms?.payout_cadence);
  /** Provider capability only — not Traverion SCAT transfer/bank-payout execution (kill-switched separately). */
  const providerPayoutCapability =
    Boolean(profile?.connect_payouts_enabled) && canReceiveTransfers;

  const savePreferences = async () => {
    setPreferenceError(null);
    setPreferenceMessage(null);
    if (!canEdit) {
      setPreferenceError('Your role can view payout preferences but cannot change them.');
      return;
    }
    if (cycle !== 'monthly' && cycle !== 'biweekly') {
      setPreferenceError('Choose monthly or twice monthly.');
      return;
    }
    const parsed = parsePayoutThreshold(threshold);
    if (!parsed.ok) {
      setPreferenceError(parsed.error);
      return;
    }
    setPreferenceSaving(true);
    const res = await updateSupplierPayout(userId, {
      payment_cycle: cycle,
      payout_threshold_min: parsed.value,
    });
    if (!res.success) {
      setPreferenceSaving(false);
      setPreferenceError(userFacingError(res.error, USER_ERROR.generic));
      return;
    }
    onProfile(await fetchSupplierProfile(userId));
    setPreferenceSaving(false);
    setPreferenceMessage(
      'Saved. Your minimum is enforced when Traverion prepares the next payout period; it does not move money by itself.'
    );
  };

  const preferenceOptions = [
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
  ] as const;

  const primaryVerifyCta =
    experience === 'not_started'
      ? 'Start verification'
      : experience === 'information_required'
        ? 'Continue verification'
        : experience === 'additional_information_required' || experience === 'restricted'
          ? 'Update verification'
          : 'Manage verification';

  return (
    <div id="income-payout-settings" className="mx-auto w-full max-w-[880px] space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg font-bold tracking-tight text-[#18181b] sm:text-xl">
          Income &amp; Payouts · Settings
        </h1>
        <p className="max-w-xl text-[13px] leading-relaxed text-[#52525b]">
          Manage business details, verification, bank destination, and payout preferences inside Traverion.
          Stripe remains the regulated payment provider — Traverion never stores full bank numbers or identity
          documents.
        </p>
      </header>

      <ol
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="Payout setup progression"
      >
        {progress.map((step) => (
          <li
            key={step.id}
            className={[
              'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] transition-colors',
              step.state === 'complete'
                ? 'border-emerald-200 bg-emerald-50/80'
                : step.state === 'current'
                  ? 'border-[#073b83]/30 bg-[#f0f4fa]'
                  : step.state === 'blocked'
                    ? 'border-red-200 bg-red-50/60'
                    : 'border-[#e5e7eb] bg-[#fafafa]',
            ].join(' ')}
          >
            {stepIcon(step.state)}
            <span
              className={
                step.state === 'complete' || step.state === 'current'
                  ? 'font-semibold text-[#18181b]'
                  : 'font-medium text-[#52525b]'
              }
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {/* A. Business Details */}
      <section
        id="income-business-details"
        className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-[#073b83]" aria-hidden />
              <h2 className="text-sm font-bold text-[#18181b]">Business Details</h2>
            </div>
            <p className="max-w-md text-[12px] leading-relaxed text-[#52525b]">
              Ordinary company information comes from your Traverion profile. Sensitive verification is completed
              through Stripe’s secure component — not duplicated here.
            </p>
            <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2">
              <div>
                <dt className="text-[#71717a]">Legal name</dt>
                <dd className="font-medium text-[#18181b]">
                  {profile?.company_legal_name || profile?.display_name || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[#71717a]">Business type</dt>
                <dd className="font-medium text-[#18181b]">{profile?.business_type || '—'}</dd>
              </div>
              <div>
                <dt className="text-[#71717a]">Registration number</dt>
                <dd className="font-medium text-[#18181b]">
                  {profile?.company_registration_number || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[#71717a]">Tax / VAT</dt>
                <dd className="font-medium text-[#18181b]">
                  {[profile?.tax_id, profile?.vat_id].filter(Boolean).join(' · ') || '—'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[#71717a]">Registered address</dt>
                <dd className="font-medium text-[#18181b]">
                  {[profile?.address_street, profile?.address_postal_code, profile?.address_city, profile?.address_country]
                    .filter(Boolean)
                    .join(', ') ||
                    profile?.business_address ||
                    '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[#71717a]">Contact</dt>
                <dd className="font-medium text-[#18181b]">{profile?.contact_phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-[#71717a]">Verification status</dt>
                <dd className="font-medium text-[#18181b]">
                  {experienceLabel}
                  <span className="ml-1 text-[11px] font-medium text-[#71717a]">({statusLabel})</span>
                  {profile?.connect_account_livemode === true ? (
                    <span className="ml-1 text-[11px] font-medium text-[#71717a]">LIVE</span>
                  ) : null}
                </dd>
              </div>
            </dl>
            {profile?.stripe_connected_account_id ? (
              <p className="font-mono text-[11px] text-[#71717a]">
                Stripe {profile.stripe_connected_account_id}
                {profile.connect_account_type ? ` · ${profile.connect_account_type}` : ''}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="tv-btn-secondary h-10 px-3 text-[13px]"
            onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile`)}
          >
            Edit in Company Settings
          </button>
        </div>
      </section>

      {/* B. Identity verification (embedded) */}
      <section
        id="business-payouts"
        className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#073b83]" aria-hidden />
              <h2 className="text-sm font-bold text-[#18181b]">Identity verification</h2>
            </div>
            {nextAction ? (
              <p className="max-w-md text-[12px] leading-relaxed text-[#52525b]">{nextAction}</p>
            ) : (
              <p className="max-w-md text-[12px] leading-relaxed text-[#52525b]">
                {canReceiveTransfers
                  ? 'Provider marks this account ready. Traverion transfers still follow internal controls.'
                  : 'Complete Stripe verification inside Traverion. Identity documents stay with Stripe.'}
              </p>
            )}
            {requirementLabels.length > 0 && !canReceiveTransfers ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-[#52525b]">
                {requirementLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="tv-btn-primary h-10 px-3 text-[13px]"
              disabled={!canEdit || connectBusy}
              onClick={() => openVerification('full')}
            >
              {connectBusy ? 'Working…' : primaryVerifyCta}
            </button>
            {profile?.stripe_connected_account_id ? (
              <button
                type="button"
                className="tv-btn-secondary h-10 px-3 text-[13px]"
                disabled={connectBusy}
                onClick={() => void refreshStatus()}
              >
                Refresh status
              </button>
            ) : null}
          </div>
        </div>

        {embedComponent === 'account_onboarding' ? (
          <div className="mt-4 space-y-2">
            <Suspense
              fallback={
                <p className="text-[13px] text-[#52525b]" role="status">
                  Loading secure verification…
                </p>
              }
            >
              <ConnectEmbeddedPanel
                component="account_onboarding"
                onExit={() => void onEmbedExit()}
                onHostedFallback={(url) => {
                  setHostedFallbackUrl(url);
                  setEmbedComponent(null);
                }}
                onError={(msg) => setConnectError(msg)}
              />
            </Suspense>
            <p className="text-[11px] text-[#71717a]">
              If Stripe requires a short authentication step, complete it in the panel. Expired sessions restart
              automatically when you open verification again.
            </p>
          </div>
        ) : null}

        {hostedFallbackUrl ? (
          <div className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] text-amber-950">
            <p className="font-semibold">Secure Stripe-hosted step required</p>
            <p className="mt-1 leading-relaxed">
              Embedded onboarding is unavailable for this requirement. Continue on Stripe’s secure page, then return
              here and refresh status.
            </p>
            <button
              type="button"
              className="tv-btn-primary mt-2 h-9 px-3 text-[13px]"
              onClick={() => window.location.assign(hostedFallbackUrl)}
            >
              Continue on Stripe
            </button>
          </div>
        ) : null}

        {connectNote ? (
          <p className="mt-3 text-[12px] text-[#18181b]" role="status">
            {connectNote}
          </p>
        ) : null}
        {connectError ? (
          <p className="mt-3 text-[12px] text-red-800" role="alert">
            {connectError}
          </p>
        ) : null}
      </section>

      {/* C. Bank account */}
      <section
        id="income-payout-account"
        className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 shrink-0 text-[#073b83]" aria-hidden />
              <h2 className="text-sm font-bold text-[#18181b]">Bank account</h2>
            </div>
            <p className="text-[13px] font-semibold text-[#18181b]">{bank.headline}</p>
            <p className="max-w-md text-[12px] leading-relaxed text-[#52525b]">{bank.detail}</p>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
              <div className="flex gap-1.5">
                <dt className="text-[#71717a]">Currency</dt>
                <dd className="font-medium text-[#18181b]">{currency}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-[#71717a]">Provider payouts</dt>
                <dd className="font-medium text-[#18181b]">
                  {profile?.connect_payouts_enabled ? 'Capability on' : 'Not enabled'}
                </dd>
              </div>
            </dl>
          </div>
          <button
            type="button"
            className={bank.managed ? 'tv-btn-secondary h-10 px-3 text-[13px]' : 'tv-btn-primary h-10 px-3 text-[13px]'}
            disabled={!canEdit || connectBusy}
            onClick={() =>
              openVerification('bank', {
                replace: !bank.managed,
              })
            }
          >
            {bank.managed ? 'Manage bank account' : 'Add bank account'}
          </button>
        </div>

        {embedComponent === 'account_management' ? (
          <div className="mt-4 space-y-2">
            <Suspense
              fallback={
                <p className="text-[13px] text-[#52525b]" role="status">
                  Loading secure bank management…
                </p>
              }
            >
              <ConnectEmbeddedPanel
                component="account_management"
                onExit={() => void onEmbedExit()}
                onHostedFallback={(url) => {
                  setHostedFallbackUrl(url);
                  setEmbedComponent(null);
                }}
                onError={(msg) => setConnectError(msg)}
              />
            </Suspense>
          </div>
        ) : null}

        {locked && profile?.payout_iban ? (
          <p className="mt-3 text-[12px] text-[#71717a]">
            Need to change a previously reviewed Traverion bank record?{' '}
            <a
              href={`mailto:${SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}?subject=Supplier%20payout%20change%20request`}
              className="font-semibold text-[#073b83]"
            >
              Contact support
            </a>
          </p>
        ) : null}
      </section>

      {/* C. Payout preferences */}
      <section className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Wallet className="h-4 w-4 text-[#073b83]" aria-hidden />
          <h2 className="text-sm font-bold text-[#18181b]">Payout preferences</h2>
          <InfoTip label="About payout preferences">{PARTNER_PAYOUT_FREQUENCY_HINT}</InfoTip>
        </div>

        <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Saved preference</dt>
            <dd className="mt-0.5 text-[#18181b]">{savedPreference}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Agreement cadence</dt>
            <dd className="mt-0.5 text-[#18181b]">{activeCadence}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Provider payout capability</dt>
            <dd className="mt-0.5 text-[#18181b]">{providerPayoutCapability ? 'On' : 'Off'}</dd>
          </div>
        </dl>

        <p className="mt-2 text-[12px] leading-relaxed text-[#52525b]">
          Monthly (15%) and twice-monthly (18%) preferences are saved for when Traverion runs payouts. They are not an
          active automatic schedule by themselves
          {estimatedNext && commercialTerms?.payout_cadence
            ? ` (illustrative next agreement date: ${formatEstimateDate(estimatedNext)}).`
            : '.'}{' '}
          Changing a preference never rewrites frozen booking commissions — those stay on the commercial snapshot at
          booking time
          {agreementRate ? ` (current agreement ${agreementRate})` : ''}
          {selectedCatalog && agreementRate && selectedCatalog !== agreementRate
            ? ` — catalog preference ${selectedCatalog} does not add a second commission until assigned.`
            : '.'}
        </p>

        {!providerPayoutCapability && nextAction ? (
          <p className="mt-2 text-[12px] text-[#52525b]">{nextAction}</p>
        ) : null}

        <fieldset className="mt-3" disabled={!canEdit || preferenceSaving}>
          <legend className="sr-only">Payout frequency preference</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Payout frequency">
            {preferenceOptions.map((option) => (
              <label
                key={option.value}
                className="tv-income-pref-card"
                data-selected={cycle === option.value ? 'true' : 'false'}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="income-payout-frequency"
                  value={option.value}
                  checked={cycle === option.value}
                  onChange={() => setCycle(option.value)}
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

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block text-[13px]">
            <span className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">
              Minimum payout threshold
              <InfoTip label="About minimum payout threshold">{PARTNER_PAYOUT_THRESHOLD_HINT}</InfoTip>
            </span>
            <input
              value={threshold}
              disabled={!canEdit || preferenceSaving}
              onChange={(e) => setThreshold(e.target.value)}
              className="tv-input h-10 w-40"
              inputMode="decimal"
              aria-label={`Minimum payout threshold in ${currency}`}
            />
          </label>
          <button
            type="button"
            className="tv-btn-secondary h-10 px-3 text-[13px]"
            disabled={!canEdit || preferenceSaving}
            onClick={() => void savePreferences()}
          >
            {preferenceSaving ? 'Saving…' : 'Save preference'}
          </button>
        </div>
        {preferenceMessage ? (
          <p className="mt-2 text-[12px] text-[#18181b]" role="status">
            {preferenceMessage}
          </p>
        ) : null}
        {preferenceError ? (
          <p className="mt-2 text-[12px] text-red-800" role="alert">
            {preferenceError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
