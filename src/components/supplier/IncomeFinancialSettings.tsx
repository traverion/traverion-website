import { useEffect, useState } from 'react';
import { fetchSupplierProfile, updateSupplierPayout, type SupplierProfileRow } from '../../data/supabase-supplier-profile';
import type { SupplierCommercialTermsRow } from '../../data/supabase-earnings';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { formatBpsAsPercent } from '../../lib/commercial-money';
import { maskIban } from '../../lib/supplier-income';
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

  const selectedCatalog =
    cycle === 'monthly' || cycle === 'biweekly' ? formatBpsAsPercent(catalogRateForPreference(cycle)) : null;
  const agreementRate = commercialTerms ? formatBpsAsPercent(commercialTerms.commission_bps) : null;
  const extraPoints = rates.extraBps / 100;

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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <section id="income-payout-account" className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-sans text-sm font-bold text-[#18181b]">Payout account</h2>
          <span className="text-[12px] font-semibold text-[#52525b]">{verificationLabel(profile?.payout_verification_status)}</span>
        </div>
        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-[11px] text-[#71717a]">Account holder</dt>
            <dd>{profile?.company_legal_name || profile?.display_name || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#71717a]">IBAN</dt>
            <dd className="tabular-nums">{maskIban(profile?.payout_iban) || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#71717a]">BIC / SWIFT</dt>
            <dd className="tabular-nums">{profile?.payout_bic?.trim() || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#71717a]">Payout currency</dt>
            <dd>{payoutCurrency || 'Per booking'}</dd>
          </div>
        </dl>
        {locked ? (
          <div className="mt-3 space-y-2">
            <p className="text-[12px] leading-relaxed text-[#52525b]">
              {(profile?.payout_verification_status ?? '').trim().toLowerCase() === 'verified'
                ? 'This bank account is verified and locked. Requesting a change does not replace it.'
                : 'These bank details are under review and cannot be edited.'}
            </p>
            <a href={changeMailto} className="inline-flex text-[13px] font-semibold text-[#073b83]">
              Request bank account change
            </a>
            <p className="text-[12px] text-[#71717a]">Opens an email to {SUPPLIER_SENSITIVE_CHANGES_SUPPORT_EMAIL}. Traverion reviews the request.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-[12px] leading-relaxed text-[#52525b]">
              Enter the account that should receive payouts. Submitting sends IBAN and BIC for review. It does not verify the account immediately.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[13px]">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">IBAN</span>
                <input value={iban} disabled={!canEdit || bankSaving} onChange={(e) => setIban(e.target.value)} className="tv-input" autoComplete="off" />
              </label>
              <label className="block text-[13px]">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">BIC / SWIFT</span>
                <input value={bic} disabled={!canEdit || bankSaving} onChange={(e) => setBic(e.target.value)} className="tv-input" autoComplete="off" />
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

      <section className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-3">
        <h2 className="font-sans text-sm font-bold text-[#18181b]">Payout preferences</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[#52525b]">{PARTNER_PAYOUT_FREQUENCY_HINT}</p>
        <fieldset className="mt-3" disabled={!canEdit || preferenceSaving}>
          <legend className="sr-only">Payout frequency</legend>
          <div className="space-y-2" role="radiogroup" aria-label="Payout frequency">
            {(
              [
                { value: 'monthly' as const, label: PARTNER_PAYOUT_FREQUENCY_MONTHLY_LABEL, detail: PARTNER_PAYOUT_FREQUENCY_MONTHLY_DETAIL },
                { value: 'biweekly' as const, label: PARTNER_PAYOUT_FREQUENCY_TWICE_MONTHLY_LABEL, detail: PARTNER_PAYOUT_FREQUENCY_TWICE_MONTHLY_DETAIL },
              ] as const
            ).map((option) => (
              <label key={option.value} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${cycle === option.value ? 'border-[#073b83] bg-[#073b83]/[0.04]' : 'border-[#e5e7eb]'}`}>
                <input
                  type="radio"
                  name="income-payout-frequency"
                  value={option.value}
                  checked={cycle === option.value}
                  onChange={() => setCycle(option.value)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-[13px] font-semibold text-[#18181b]">{option.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-[#52525b]">{option.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-3 rounded-lg bg-[#fafafa] px-3 py-2.5 text-[12px] leading-relaxed text-[#3f3f46]">
          <p>
            Catalog commission for the selected preference:{' '}
            <strong className="font-semibold text-[#18181b]">{selectedCatalog ?? 'Choose a frequency'}</strong>.
            Monthly uses the standard catalog rate of {rates.standardLabel}. Twice monthly uses {rates.twiceMonthlyLabel}, which is {extraPoints} percentage points more than standard.
          </p>
          <p className="mt-1">
            {agreementRate
              ? `Your current agreement remains ${agreementRate} on a ${cadenceLabel(commercialTerms?.payout_cadence).toLowerCase()} cadence.`
              : 'No commercial agreement is on file.'}{' '}
            Saving a preference does not change that agreement and does not enable automatic payouts.
          </p>
          <p className="mt-1">
            Saved preference: {profile?.payment_cycle === 'biweekly' ? 'Twice monthly' : profile?.payment_cycle === 'monthly' ? 'Monthly' : 'Not saved'}.
            Active agreement cadence: {cadenceLabel(commercialTerms?.payout_cadence)}.
          </p>
        </div>
        <label className="mt-3 block max-w-xs text-[13px]">
          <span className="mb-1 block font-semibold text-[#18181b]">Minimum payout threshold</span>
          <span className="mb-2 block text-[12px] leading-snug text-[#52525b]">{PARTNER_PAYOUT_THRESHOLD_HINT}</span>
          <input
            type="text"
            inputMode="decimal"
            value={threshold}
            disabled={!canEdit || preferenceSaving}
            onChange={(e) => setThreshold(e.target.value)}
            className="tv-input"
            aria-label="Minimum payout threshold"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="tv-btn-primary h-10 px-3 text-[13px]" disabled={!canEdit || preferenceSaving} onClick={() => void savePreferences()}>
            {preferenceSaving ? 'Saving…' : 'Save changes'}
          </button>
          {preferenceMessage ? <p className="text-[12px] text-[#18181b]" role="status">{preferenceMessage}</p> : null}
        </div>
        {preferenceError ? <p className="mt-2 text-[12px] text-red-800" role="alert">{preferenceError}</p> : null}
        {!canEdit ? <p className="mt-2 text-[12px] text-[#71717a]">Your role can view these settings but cannot change them.</p> : null}
      </section>

      <section className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-3">
        <h2 className="font-sans text-sm font-bold text-[#18181b]">Commercial agreement</h2>
        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-[11px] text-[#71717a]">Current commission</dt>
            <dd>{agreementRate ?? 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#71717a]">Extra commission for the selected preference</dt>
            <dd>
              {cycle === 'biweekly'
                ? `${extraPoints} percentage points above the ${rates.standardLabel} standard catalog rate`
                : cycle === 'monthly'
                  ? `None. Monthly uses the ${rates.standardLabel} standard catalog rate.`
                  : 'Choose a frequency to see the catalog impact.'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#71717a]">Payout currency</dt>
            <dd>{payoutCurrency || 'Per booking'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#71717a]">Agreement cadence</dt>
            <dd>{cadenceLabel(commercialTerms?.payout_cadence)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[12px] text-[#71717a]">Contact Traverion to change payout plan.</p>
      </section>

      <section className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-3">
        <h2 className="font-sans text-sm font-bold text-[#18181b]">Business & tax</h2>
        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-[11px] text-[#71717a]">Registered business name</dt>
            <dd>{profile?.company_legal_name || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#71717a]">Registration number</dt>
            <dd>{profile?.company_registration_number || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#71717a]">VAT number</dt>
            <dd>{profile?.vat_id || 'Not on file'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#71717a]">Country</dt>
            <dd>{profile?.address_country || 'Not on file'}</dd>
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
