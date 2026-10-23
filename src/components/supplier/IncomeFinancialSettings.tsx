import { useEffect, useId, useState } from 'react';
import { Info } from 'lucide-react';
import { fetchSupplierProfile, updateSupplierPayout, type SupplierProfileRow } from '../../data/supabase-supplier-profile';
import { invokeConnectSupplierOnboarding } from '../../data/supabase-connect-onboarding';
import type { SupplierCommercialTermsRow } from '../../data/supabase-earnings';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { formatBpsAsPercent } from '../../lib/commercial-money';
import { maskIban } from '../../lib/supplier-income';
import {
  connectCanReceiveTransfers,
  connectOnboardingLabel,
  payoutBlockReason,
} from '../../lib/connect-payout-status';
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

type Props = {
  userId: string;
  profile: SupplierProfileRow | null;
  commercialTerms: SupplierCommercialTermsRow | null;
  payoutCurrency: string | null;
  canEdit: boolean;
  onProfile: (profile: SupplierProfileRow | null) => void;
};

function verificationLabel(status: string | null | undefined): string {
  const value = (status ?? '').trim().toLowerCase();
  if (value === 'verified') return 'Verified';
  if (value === 'pending') return 'Under review';
  if (value === 'rejected') return 'Needs an update';
  return 'Not submitted';
}

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

export default function IncomeFinancialSettings({
  userId,
  profile,
  commercialTerms,
  payoutCurrency,
  canEdit,
  onProfile,
}: Props) {
  const locked = isSupplierPayoutDetailsLocked(
    profile?.payout_verification_status,
    profile?.payout_verification_submitted_at
  );
  const rates = catalogPayoutRates();
  const currency = (payoutCurrency || 'EUR').toUpperCase();
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

  const canReceiveTransfers = connectCanReceiveTransfers({
    connect_payouts_enabled: profile?.connect_payouts_enabled,
    connect_onboarding_status: profile?.connect_onboarding_status,
    connect_requirements_currently_due: profile?.connect_requirements_currently_due,
    connect_requirements_past_due: profile?.connect_requirements_past_due,
  });
  const blockReason = payoutBlockReason({
    connect_onboarding_status: profile?.connect_onboarding_status,
    connect_payouts_enabled: profile?.connect_payouts_enabled,
    connect_disabled_reason: profile?.connect_disabled_reason,
    connect_requirements_currently_due: profile?.connect_requirements_currently_due,
  });
  const dueRequirements = Array.isArray(profile?.connect_requirements_currently_due)
    ? profile!.connect_requirements_currently_due!
    : [];
  const connectStatus = profile?.connect_onboarding_status ?? 'not_started';
  const connectCta =
    connectStatus === 'not_started'
      ? 'Start Stripe verification'
      : connectStatus === 'complete' && canReceiveTransfers
        ? 'Refresh verification status'
        : 'Resume Stripe verification';

  useEffect(() => {
    setCycle(profile?.payment_cycle ?? '');
    setThreshold(profile?.payout_threshold_min != null ? String(profile.payout_threshold_min) : '');
    setIban(profile?.payout_iban ?? '');
    setBic(profile?.payout_bic ?? '');
  }, [profile?.id, profile?.updated_at, profile?.payment_cycle, profile?.payout_threshold_min, profile?.payout_iban, profile?.payout_bic]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#income-payout-account') return;
    document.getElementById('income-payout-account')?.scrollIntoView({ block: 'start' });
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
        'Status refreshed from Stripe. A successful return from onboarding does not by itself mean you are verified.'
      );
      const next = await fetchSupplierProfile(userId);
      if (!cancelled) onProfile(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, onProfile]);

  const runConnectAction = async () => {
    setConnectError(null);
    setConnectNote(null);
    if (!canEdit) {
      setConnectError('Your role can view payout verification but cannot change it.');
      return;
    }
    setConnectBusy(true);
    const action =
      connectStatus === 'complete' && canReceiveTransfers ? 'refresh' : 'start';
    const result = await invokeConnectSupplierOnboarding(action);
    setConnectBusy(false);
    if (!result.success) {
      setConnectError(userFacingError(result.error, USER_ERROR.generic));
      return;
    }
    if (result.url) {
      window.location.assign(result.url);
      return;
    }
    setConnectNote(result.note ?? 'Verification status updated from Stripe.');
    const next = await fetchSupplierProfile(userId);
    onProfile(next);
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
    const next = await fetchSupplierProfile(userId);
    onProfile(next);
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
    const next = await fetchSupplierProfile(userId);
    onProfile(next);
    setBankSaving(false);
    setBankMessage('Submitted for review. The account is not verified until Traverion approves it.');
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

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-3">
      <section className="rounded-[10px] border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3.5 sm:px-5">
        <h2 className="text-sm font-bold text-[#18181b]">Bank payout status</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#52525b]">
          Stripe Connect onboarding is available in <strong className="font-semibold text-[#18181b]">TEST</strong>.
          Live automatic bank payouts remain off until Traverion separately authorizes production money movement.
          A prepared payout period in Income is an internal record — not proof that money left Traverion.
        </p>
      </section>

      <section id="income-connect-payouts" className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-[#18181b]">Stripe Connect payouts</h2>
          <span className="text-[12px] font-semibold text-[#52525b]">{connectOnboardingLabel(connectStatus)}</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#52525b]">
          Verify once with Stripe-hosted onboarding. Traverion confirms transfer and payout capability from Stripe
          account requirements — not from a browser redirect alone.
        </p>
        <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Can receive transfers</dt>
            <dd className="mt-0.5 text-[#18181b]">{canReceiveTransfers ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Payouts enabled</dt>
            <dd className="mt-0.5 text-[#18181b]">{profile?.connect_payouts_enabled ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Payout schedule</dt>
            <dd className="mt-0.5 text-[#18181b]">
              {cycle === 'biweekly' || profile?.payment_cycle === 'biweekly'
                ? 'Twice monthly (Traverion cadence)'
                : 'Monthly (Traverion cadence)'}
              {' · '}
              connected account daily bank payout after transfer
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Rail</dt>
            <dd className="mt-0.5 text-[#18181b]">
              {(profile?.payout_rail ?? 'manual_iban') === 'stripe_connect' ? 'Stripe Connect' : 'Manual IBAN (legacy)'}
            </dd>
          </div>
        </dl>
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
        {blockReason ? (
          <p className="mt-3 text-[12px] leading-relaxed text-[#52525b]">{blockReason}</p>
        ) : (
          <p className="mt-3 text-[12px] leading-relaxed text-[#52525b]">
            Connected account can receive TEST transfers when Traverion runs the transfer engine.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="tv-btn-primary h-10 px-3 text-[13px]"
            disabled={!canEdit || connectBusy}
            onClick={() => void runConnectAction()}
          >
            {connectBusy ? 'Working…' : connectCta}
          </button>
          {profile?.stripe_connected_account_id ? (
            <span className="text-[11px] tabular-nums text-[#71717a]">
              Account linked · synced{' '}
              {profile.connect_last_synced_at
                ? new Date(profile.connect_last_synced_at).toLocaleString()
                : 'pending'}
            </span>
          ) : null}
        </div>
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

      <section id="income-payout-account" className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-[#18181b]">Bank account</h2>
          <span className="text-[12px] font-semibold text-[#52525b]">{verificationLabel(profile?.payout_verification_status)}</span>
        </div>
        <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Account holder</dt>
            <dd className="mt-0.5 text-[#18181b]">{profile?.company_legal_name || profile?.display_name || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">IBAN</dt>
            <dd className="mt-0.5 tabular-nums text-[#18181b]">{maskIban(profile?.payout_iban) || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">BIC / SWIFT</dt>
            <dd className="mt-0.5 tabular-nums text-[#18181b]">{profile?.payout_bic?.trim() || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Payout currency</dt>
            <dd className="mt-0.5 text-[#18181b]">{payoutCurrency || 'Per booking'}</dd>
          </div>
        </dl>
        {locked ? (
          <div className="mt-4 space-y-2">
            <p className="text-[12px] leading-relaxed text-[#52525b]">
              {(profile?.payout_verification_status ?? '').trim().toLowerCase() === 'verified'
                ? 'This bank account is verified and locked. Requesting a change does not replace it.'
                : 'These bank details are under review and cannot be edited.'}
            </p>
            <a href={changeMailto} className="inline-flex text-[13px] font-semibold text-[#073b83]">
              Request bank account change
            </a>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[13px]">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">IBAN</span>
                <input value={iban} disabled={!canEdit || bankSaving} onChange={(e) => setIban(e.target.value)} className="tv-input h-10" autoComplete="off" />
              </label>
              <label className="block text-[13px]">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">BIC / SWIFT</span>
                <input value={bic} disabled={!canEdit || bankSaving} onChange={(e) => setBic(e.target.value)} className="tv-input h-10" autoComplete="off" />
              </label>
            </div>
            {(profile?.payout_verification_status ?? '').trim().toLowerCase() === 'rejected' && profile?.payout_verification_feedback ? (
              <p className="text-[12px] text-red-800">{profile.payout_verification_feedback}</p>
            ) : null}
            <button type="button" className="tv-btn-primary h-10 px-3 text-[13px]" disabled={!canEdit || bankSaving} onClick={() => void submitBankDetails()}>
              {bankSaving ? 'Submitting…' : 'Submit bank details for review'}
            </button>
            {bankMessage ? <p className="text-[12px] text-[#18181b]" role="status">{bankMessage}</p> : null}
            {bankError ? <p className="text-[12px] text-red-800" role="alert">{bankError}</p> : null}
          </div>
        )}
      </section>

      <section className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-[#18181b]">Payout preferences</h2>
          <InfoTip label="About payout preferences">{PARTNER_PAYOUT_FREQUENCY_HINT}</InfoTip>
        </div>

        <fieldset className="mt-3" disabled={!canEdit || preferenceSaving}>
          <legend className="sr-only">Payout frequency</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Payout frequency">
            {preferenceOptions.map((option) => (
              <label
                key={option.value}
                className="tv-income-pref-card"
                data-selected={cycle === option.value ? 'true' : 'false'}
              >
                <input
                  type="radio"
                  name="income-payout-frequency"
                  value={option.value}
                  checked={cycle === option.value}
                  onChange={() => setCycle(option.value)}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-[#18181b]">{option.label}</span>
                    <InfoTip label={`${option.label} details`}>{option.tip}</InfoTip>
                  </span>
                  <span className="mt-1 block text-[12px] text-[#52525b]">
                    Catalog commission <strong className="font-semibold text-[#18181b]">{option.rate}</strong>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-3 grid gap-2 rounded-lg border border-[#e5e7eb] bg-[#fafafa] px-3 py-2.5 text-[12px] text-[#3f3f46] sm:grid-cols-2">
          <p>
            <span className="block text-[11px] font-semibold text-[#71717a]">Saved preference</span>
            {savedPreference}
            {selectedCatalog ? ` · catalog ${selectedCatalog}` : ''}
          </p>
          <p>
            <span className="block text-[11px] font-semibold text-[#71717a]">Active agreement</span>
            {agreementRate ? `${agreementRate} · ${activeCadence}` : 'No commercial agreement on file'}
          </p>
        </div>
        <p className="mt-2 text-[12px] text-[#71717a]">
          Saving a preference does not change your contractual commission or enable automatic payouts.
          {cycle === 'biweekly' ? ` Twice monthly uses a catalog rate ${extraPoints} points above the ${rates.standardLabel} standard.` : null}
        </p>

        <label className="mt-4 block max-w-sm text-[13px]">
          <span className="mb-1 flex items-center gap-1.5 font-semibold text-[#18181b]">
            Minimum payout threshold
            <InfoTip label="About minimum payout threshold">{PARTNER_PAYOUT_THRESHOLD_HINT}</InfoTip>
          </span>
          <span className="relative mt-1 block">
            <input
              type="text"
              inputMode="decimal"
              value={threshold}
              disabled={!canEdit || preferenceSaving}
              onChange={(e) => setThreshold(e.target.value)}
              className="tv-input h-10 pr-14"
              aria-label={`Minimum payout threshold in ${currency}`}
              placeholder="0.00"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-semibold text-[#71717a]">
              {currency}
            </span>
          </span>
          <span className="mt-1.5 block text-[12px] text-[#71717a]">
            Saved preference only — not an active payout rule until Traverion enables payouts.
          </span>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="tv-btn-primary h-10 px-3 text-[13px]" disabled={!canEdit || preferenceSaving} onClick={() => void savePreferences()}>
            {preferenceSaving ? 'Saving…' : 'Save changes'}
          </button>
          {preferenceMessage ? <p className="text-[12px] text-[#18181b]" role="status">{preferenceMessage}</p> : null}
        </div>
        {preferenceError ? <p className="mt-2 text-[12px] text-red-800" role="alert">{preferenceError}</p> : null}
        {!canEdit ? <p className="mt-2 text-[12px] text-[#71717a]">Your role can view these settings but cannot change them.</p> : null}
      </section>

      <section className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3.5 sm:px-5">
        <h2 className="text-sm font-bold text-[#18181b]">Commercial agreement</h2>
        <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Current commission</dt>
            <dd className="mt-0.5">{agreementRate ?? 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Agreement cadence</dt>
            <dd className="mt-0.5">{activeCadence}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Payout currency</dt>
            <dd className="mt-0.5">{payoutCurrency || 'Per booking'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Catalog vs preference</dt>
            <dd className="mt-0.5">
              {cycle === 'biweekly'
                ? `${rates.twiceMonthlyLabel} catalog for twice monthly`
                : cycle === 'monthly'
                  ? `${rates.standardLabel} catalog for monthly`
                  : 'Choose a frequency'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-[12px] text-[#71717a]">Contact Traverion to change your contractual payout plan.</p>
      </section>

      <section className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3.5 sm:px-5">
        <h2 className="text-sm font-bold text-[#18181b]">Business & tax</h2>
        <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Registered business name</dt>
            <dd className="mt-0.5">{profile?.company_legal_name || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Registration number</dt>
            <dd className="mt-0.5">{profile?.company_registration_number || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">VAT number</dt>
            <dd className="mt-0.5">{profile?.vat_id || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-[#71717a]">Country</dt>
            <dd className="mt-0.5">{profile?.address_country || 'Not on file'}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="mt-3 text-[13px] font-semibold text-[#073b83]"
          onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile`)}
        >
          Edit company details in Business settings
        </button>
      </section>
    </div>
  );
}
