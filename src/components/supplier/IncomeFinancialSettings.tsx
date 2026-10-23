import { useEffect, useId, useState } from 'react';
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
import { invokeConnectSupplierOnboarding } from '../../data/supabase-connect-onboarding';
import type { SupplierCommercialTermsRow } from '../../data/supabase-earnings';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { formatBpsAsPercent } from '../../lib/commercial-money';
import { maskIban } from '../../lib/supplier-income';
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
import ConnectEmbeddedPanel from './ConnectEmbeddedPanel';
import type { ConnectEmbeddedComponent } from '../../data/supabase-connect-onboarding';

type Props = {
  userId: string;
  profile: SupplierProfileRow | null;
  commercialTerms: SupplierCommercialTermsRow | null;
  payoutCurrency: string | null;
  canEdit: boolean;
  onProfile: (profile: SupplierProfileRow | null) => void;
  /** Optional earnings context for payout block reasons */
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
  if (state === 'complete') return <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />;
  if (state === 'current') return <Circle className="h-4 w-4 fill-[#073b83] text-[#073b83]" aria-hidden />;
  if (state === 'blocked') return <Lock className="h-4 w-4 text-red-700" aria-hidden />;
  return <Circle className="h-4 w-4 text-[#d4d4d8]" aria-hidden />;
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
  const [iban, setIban] = useState(profile?.payout_iban ?? '');
  const [bic, setBic] = useState(profile?.payout_bic ?? '');
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [preferenceMessage, setPreferenceMessage] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectNote, setConnectNote] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState<ConnectEmbeddedComponent | null>(null);
  const [showLegacyIban, setShowLegacyIban] = useState(false);

  const experience = deriveConnectExperienceState(profile);
  const experienceLabel = connectExperienceLabel(experience);
  const canReceiveTransfers = connectCanReceiveTransfers(profile ?? {});
  const progress = buildConnectProgressSteps(profile);
  const payoutBlocks = listSupplierPayoutBlocks({
    profile,
    financialHold,
    debtMinor,
    eligibleEarningsMinor,
  });
  const dueRequirements = Array.isArray(profile?.connect_requirements_currently_due)
    ? profile!.connect_requirements_currently_due!
    : [];

  useEffect(() => {
    setCycle(profile?.payment_cycle ?? '');
    setThreshold(profile?.payout_threshold_min != null ? String(profile.payout_threshold_min) : '');
    setIban(profile?.payout_iban ?? '');
    setBic(profile?.payout_bic ?? '');
  }, [
    profile?.id,
    profile?.updated_at,
    profile?.payment_cycle,
    profile?.payout_threshold_min,
    profile?.payout_iban,
    profile?.payout_bic,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash === '#income-connect-payouts' || hash === '#business-payouts') {
      document.getElementById('business-payouts')?.scrollIntoView({ block: 'start' });
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
        'Status refreshed from Stripe. Completing onboarding does not by itself mean you are verified.'
      );
      const next = await fetchSupplierProfile(userId);
      if (!cancelled) onProfile(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, onProfile]);

  const refreshFromStripe = async () => {
    setConnectBusy(true);
    setConnectError(null);
    const result = await invokeConnectSupplierOnboarding('refresh');
    setConnectBusy(false);
    if (!result.success) {
      setConnectError(userFacingError(result.error, USER_ERROR.generic));
      return;
    }
    setConnectNote('Capabilities refreshed from Stripe.');
    onProfile(await fetchSupplierProfile(userId));
  };

  const openEmbedded = (component: ConnectEmbeddedComponent) => {
    setConnectError(null);
    setConnectNote(null);
    if (!canEdit) {
      setConnectError('Your role can view payout verification but cannot change it.');
      return;
    }
    setEmbedded(component);
  };

  const selectedCatalog =
    cycle === 'monthly' || cycle === 'biweekly' ? formatBpsAsPercent(catalogRateForPreference(cycle)) : null;
  const agreementRate = commercialTerms ? formatBpsAsPercent(commercialTerms.commission_bps) : null;
  const extraPoints = rates.extraBps / 100;
  const savedPreference = preferenceLabel(profile?.payment_cycle);
  const activeCadence = cadenceLabel(commercialTerms?.payout_cadence);

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
    setPreferenceMessage('Saved. This preference is not an active payout schedule.');
  };

  const submitBankDetails = async () => {
    setBankError(null);
    setBankMessage(null);
    if (!canEdit || locked) {
      setBankError('Verified bank details cannot be replaced here.');
      return;
    }
    if (!iban.trim() || !bic.trim()) {
      setBankError('Enter both IBAN and BIC before submitting.');
      return;
    }
    setBankSaving(true);
    const submittedNow = new Date().toISOString();
    const res = await updateSupplierPayout(userId, {
      payout_method: 'bank',
      payout_iban: iban.trim(),
      payout_bic: bic.trim(),
      payout_paypal_email: null,
      payout_verification_status: 'pending',
      payout_verification_submitted_at: submittedNow,
      payout_verification_feedback: null,
    });
    if (!res.success) {
      setBankSaving(false);
      setBankError(userFacingError(res.error, USER_ERROR.generic));
      return;
    }
    onProfile(await fetchSupplierProfile(userId));
    setBankSaving(false);
    setBankMessage(
      'Legacy Traverion IBAN submitted for review. This does not unlock Stripe Connect payouts.'
    );
  };

  const changeMailto = `mailto:${SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}?subject=Supplier%20payout%20change%20request`;

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

  const primaryCta =
    experience === 'ready_for_bank_payouts'
      ? 'Manage bank account'
      : experience === 'not_started'
        ? 'Complete verification'
        : 'Continue verification';

  return (
    <div id="business-payouts" className="mx-auto w-full max-w-[1180px] space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg font-bold tracking-tight text-[#18181b] sm:text-xl">Business & Payouts</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-[#52525b]">
          Manage your business verification and payment details securely inside Traverion.
        </p>
      </header>

      {/* Verification summary */}
      <section className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#073b83]" aria-hidden />
              <h2 className="text-sm font-bold text-[#18181b]">Account verification</h2>
            </div>
            <p className="text-[13px] text-[#52525b]">
              Status:{' '}
              <span className="font-semibold text-[#18181b]">{experienceLabel}</span>
              <span className="text-[#a1a1aa]"> · </span>
              <span className="text-[#71717a]">{connectOnboardingLabel(profile?.connect_onboarding_status)}</span>
            </p>
            <p className="max-w-xl text-[12px] leading-relaxed text-[#71717a]">
              Identity and bank details are verified by Stripe. Traverion never treats a finished form as fully
              verified until Stripe confirms capabilities.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="tv-btn-primary h-10 px-3 text-[13px]"
              disabled={!canEdit || connectBusy}
              onClick={() =>
                openEmbedded(
                  experience === 'ready_for_bank_payouts' ? 'account_management' : 'account_onboarding'
                )
              }
            >
              {connectBusy ? 'Working…' : primaryCta}
            </button>
            {profile?.stripe_connected_account_id ? (
              <button
                type="button"
                className="tv-btn-secondary h-10 px-3 text-[13px]"
                disabled={connectBusy}
                onClick={() => void refreshFromStripe()}
              >
                Refresh status
              </button>
            ) : null}
          </div>
        </div>

        <ol className="mt-4 grid gap-2 sm:grid-cols-4">
          {progress.map((step) => (
            <li
              key={step.id}
              className="flex items-center gap-2 rounded-lg border border-[#f4f4f5] bg-[#fafafa] px-2.5 py-2 text-[12px]"
            >
              {stepIcon(step.state)}
              <span
                className={
                  step.state === 'complete' || step.state === 'current'
                    ? 'font-semibold text-[#18181b]'
                    : 'text-[#71717a]'
                }
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>

        {dueRequirements.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[12px] font-semibold text-amber-950">Requirements currently due</p>
            <ul className="mt-1 list-disc pl-4 text-[12px] text-amber-950">
              {dueRequirements.slice(0, 8).map((req) => (
                <li key={req}>{req}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {payoutBlocks.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {payoutBlocks.map((b) => (
              <li key={`${b.category}-${b.message}`} className="text-[12px] leading-relaxed text-[#52525b]">
                <span className="font-semibold text-[#3f3f46]">
                  {b.category === 'account' ? 'Account' : b.category === 'earnings' ? 'Earnings' : 'Schedule'}
                  :
                </span>{' '}
                {b.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12px] text-[#52525b]">
            Connected account can receive TEST transfers when Traverion runs the transfer engine.
          </p>
        )}

        {connectNote ? (
          <p className="mt-2 text-[12px] text-[#18181b]" role="status">
            {connectNote}
          </p>
        ) : null}
        {connectError ? (
          <p className="mt-2 text-[12px] text-red-800" role="alert">
            {connectError}
          </p>
        ) : null}
      </section>

      {embedded ? (
        <section className="space-y-2" aria-label="Stripe verification">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#18181b]">
              {embedded === 'account_management' ? 'Manage payout account' : 'Complete verification'}
            </h2>
            <button
              type="button"
              className="tv-btn-ghost h-9 px-2 text-[13px]"
              onClick={() => {
                setEmbedded(null);
                void refreshFromStripe();
              }}
            >
              Close
            </button>
          </div>
          <ConnectEmbeddedPanel
            component={embedded}
            onExit={() => {
              setEmbedded(null);
              void refreshFromStripe();
            }}
            onHostedFallback={(url) => {
              window.location.assign(url);
            }}
            onError={(msg) => setConnectError(msg)}
          />
        </section>
      ) : null}

      {/* Business information */}
      <section className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#073b83]" aria-hidden />
            <h2 className="text-sm font-bold text-[#18181b]">Business information</h2>
          </div>
          <button
            type="button"
            className="text-[13px] font-semibold text-[#073b83]"
            onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile`)}
          >
            Edit business profile
          </button>
        </div>
        <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Legal name</dt>
            <dd className="mt-0.5 text-[#18181b]">{profile?.company_legal_name || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Business type</dt>
            <dd className="mt-0.5 capitalize text-[#18181b]">{profile?.business_type || 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Registered country</dt>
            <dd className="mt-0.5 text-[#18181b]">
              {profile?.connect_country || profile?.address_country || 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Traverion verification</dt>
            <dd className="mt-0.5 capitalize text-[#18181b]">
              {(profile?.verification_status ?? 'pending').replace(/_/g, ' ')}
            </dd>
          </div>
        </dl>
      </section>

      {/* Bank account */}
      <section
        id="income-payout-account"
        className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#073b83]" aria-hidden />
            <h2 className="text-sm font-bold text-[#18181b]">Bank account</h2>
          </div>
          <button
            type="button"
            className="text-[13px] font-semibold text-[#073b83]"
            disabled={!canEdit}
            onClick={() => openEmbedded('account_management')}
          >
            Manage bank account
          </button>
        </div>
        <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Payout destination</dt>
            <dd className="mt-0.5 text-[#18181b]">
              {profile?.connect_payouts_enabled
                ? 'Managed securely in Stripe'
                : 'Not linked for Connect payouts yet'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Currency</dt>
            <dd className="mt-0.5 text-[#18181b]">{currency}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Stripe payouts</dt>
            <dd className="mt-0.5 text-[#18181b]">
              {profile?.connect_payouts_enabled ? 'Enabled' : 'Not enabled'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Can receive transfers</dt>
            <dd className="mt-0.5 text-[#18181b]">{canReceiveTransfers ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-[#71717a]">
          Full account numbers are never shown in Traverion. Traverion-only IBAN verification cannot unlock Stripe
          Connect payouts.
        </p>

        <div className="mt-3 border-t border-[#f4f4f5] pt-3">
          <button
            type="button"
            className="text-[12px] font-semibold text-[#52525b] underline-offset-2 hover:underline"
            onClick={() => setShowLegacyIban((v) => !v)}
          >
            {showLegacyIban ? 'Hide legacy Traverion IBAN' : 'Legacy Traverion IBAN (optional)'}
          </button>
          {showLegacyIban ? (
            <div className="mt-3 space-y-3">
              <p className="text-[12px] text-[#71717a]">
                Legacy rail for Traverion ops only. Prefer Stripe bank management above for automatic payouts.
              </p>
              <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-semibold text-[#71717a]">Masked IBAN</dt>
                  <dd className="mt-0.5 tabular-nums">{maskIban(profile?.payout_iban) || 'Not on file'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#71717a]">Traverion bank review</dt>
                  <dd className="mt-0.5 capitalize">
                    {(profile?.payout_verification_status ?? 'not submitted').replace(/_/g, ' ')}
                  </dd>
                </div>
              </dl>
              {locked ? (
                <a href={changeMailto} className="inline-flex text-[13px] font-semibold text-[#073b83]">
                  Request bank account change
                </a>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">
                      IBAN
                    </span>
                    <input
                      value={iban}
                      disabled={!canEdit || bankSaving}
                      onChange={(e) => setIban(e.target.value)}
                      className="tv-input h-10"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-[13px]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">
                      BIC / SWIFT
                    </span>
                    <input
                      value={bic}
                      disabled={!canEdit || bankSaving}
                      onChange={(e) => setBic(e.target.value)}
                      className="tv-input h-10"
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="button"
                    className="tv-btn-secondary h-10 px-3 text-[13px] sm:col-span-2 sm:w-fit"
                    disabled={!canEdit || bankSaving}
                    onClick={() => void submitBankDetails()}
                  >
                    {bankSaving ? 'Submitting…' : 'Submit legacy IBAN for Traverion review'}
                  </button>
                </div>
              )}
              {bankMessage ? (
                <p className="text-[12px] text-[#18181b]" role="status">
                  {bankMessage}
                </p>
              ) : null}
              {bankError ? (
                <p className="text-[12px] text-red-800" role="alert">
                  {bankError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* Payout preferences */}
      <section className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Wallet className="h-4 w-4 text-[#073b83]" aria-hidden />
          <h2 className="text-sm font-bold text-[#18181b]">Payout preferences</h2>
          <InfoTip label="About payout preferences">{PARTNER_PAYOUT_FREQUENCY_HINT}</InfoTip>
        </div>
        <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Contractual cadence</dt>
            <dd className="mt-0.5 text-[#18181b]">{activeCadence}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Saved preference</dt>
            <dd className="mt-0.5 text-[#18181b]">{savedPreference}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Connected bank payouts</dt>
            <dd className="mt-0.5 text-[#18181b]">Daily after transfer (Stripe)</dd>
          </div>
        </dl>

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
                <span className="block text-[13px] font-semibold text-[#18181b]">{option.label}</span>
                <span className="mt-0.5 block text-[12px] text-[#71717a]">{option.tip}</span>
                <span className="mt-1 block text-[11px] font-semibold text-[#073b83]">{option.rate}</span>
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
        {selectedCatalog && agreementRate && selectedCatalog !== agreementRate ? (
          <p className="mt-2 text-[12px] text-[#71717a]">
            Catalog rate {selectedCatalog} differs from your agreement {agreementRate}
            {extraPoints > 0 ? ` (+${extraPoints} pts for faster cadence when assigned).` : '.'}
          </p>
        ) : null}
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

      <p className="flex items-start gap-2 px-1 text-[12px] leading-relaxed text-[#71717a]">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Identity verification and bank details are securely managed through Stripe. Live automatic payouts remain off
          until Traverion separately authorizes production money movement.
        </span>
      </p>
    </div>
  );
}
