import { useEffect, useState, type ReactNode } from 'react';
import {
  fetchSupplierProfile,
  updateSupplierPayout,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { invokeConnectSupplierOnboarding } from '../../data/supabase-connect-onboarding';
import type { SupplierCommercialTermsRow } from '../../data/supabase-earnings';
import { bankAlreadyManaged } from '../../lib/verification-workspace-lifecycle';
import { maskIban } from '../../lib/supplier-income';
import { PARTNER_HELP } from '../../lib/partnerHelpCopy';
import { supplierOperationalIndicators } from '../../lib/supplier-verification-state';
import { formatBpsAsPercent } from '../../lib/commercial-money';
import {
  payoutFrequencyQuote,
  parsePayoutThreshold,
  type PayoutCyclePreference,
} from '../../lib/payout-preference';
import { partnerToast } from '../../lib/partner-toast';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import PartnerHelpTip from './PartnerHelpTip';

/** Align with Income overview content width. */
const CONTENT_MAX = 'max-w-[1180px]';

type Props = {
  userId: string;
  profile: SupplierProfileRow | null;
  commercialTerms: SupplierCommercialTermsRow | null;
  commercialTermsReady?: boolean;
  payoutCurrency: string | null;
  canEdit: boolean;
  onProfile: (profile: SupplierProfileRow | null) => void;
  financialHold?: boolean;
  debtMinor?: number;
  eligibleEarningsMinor?: number;
};

function bankStatusLabel(input: { bankOk: boolean; payoutsEnabled: boolean }): string {
  if (input.bankOk && input.payoutsEnabled) return 'Connected';
  if (input.bankOk) return 'Not confirmed';
  return 'Not added';
}

function SettingsCard({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] px-5 py-4 sm:px-6">
        <h2 className="inline-flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-[#17191d]">
          {title}
          {help ? <PartnerHelpTip label={`About ${title}`}>{help}</PartnerHelpTip> : null}
        </h2>
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function Fact({ label, value, help }: { label: string; value: ReactNode; help?: string }) {
  const empty = value == null || (typeof value === 'string' && (!value.trim() || value === '—'));
  return (
    <div className="min-w-0">
      <dt className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71717a]">
        {label}
        {help ? <PartnerHelpTip label={`About ${label}`}>{help}</PartnerHelpTip> : null}
      </dt>
      <dd className="mt-1.5 text-[14px] font-medium leading-snug tracking-tight text-[#17191d]">
        {empty ? <span className="font-normal text-[#9aa3ad]">—</span> : value}
      </dd>
    </div>
  );
}

function cycleFromProfile(cycle: string | null | undefined): PayoutCyclePreference | '' {
  return cycle === 'monthly' || cycle === 'biweekly' ? cycle : '';
}

function minimumFromProfile(min: number | string | null | undefined): string {
  if (min == null || min === '') return '';
  return String(min);
}

export default function IncomeFinancialSettings({
  userId,
  profile,
  commercialTerms,
  commercialTermsReady = true,
  payoutCurrency,
  canEdit,
  onProfile,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payoutGatesOpen, setPayoutGatesOpen] = useState(false);
  const [cycle, setCycle] = useState<PayoutCyclePreference | ''>(cycleFromProfile(profile?.payment_cycle));
  const [minimum, setMinimum] = useState(minimumFromProfile(profile?.payout_threshold_min));

  const hasConnectedAccount = Boolean(profile?.stripe_connected_account_id);
  const operations = supplierOperationalIndicators(profile, payoutGatesOpen);
  const bankOk = bankAlreadyManaged(profile);
  const maskedIban = maskIban(profile?.payout_iban);
  const currency = (payoutCurrency || 'EUR').toUpperCase();
  const frequencyQuote = payoutFrequencyQuote(commercialTerms?.commission_bps);

  useEffect(() => {
    setCycle(cycleFromProfile(profile?.payment_cycle));
    setMinimum(minimumFromProfile(profile?.payout_threshold_min));
  }, [profile?.payment_cycle, profile?.payout_threshold_min]);

  useEffect(() => {
    let cancelled = false;
    void invokeConnectSupplierOnboarding('status').then((result) => {
      if (cancelled) return;
      setPayoutGatesOpen(result.payout_gates_open === true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, hasConnectedAccount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const connect = params.get('connect');
    if (connect !== 'return' && connect !== 'refresh') return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      const result = await invokeConnectSupplierOnboarding('refresh');
      if (cancelled) return;
      setBusy(false);
      if (!result.success) {
        partnerToast.error(userFacingError(result.error, USER_ERROR.generic));
        return;
      }
      onProfile(await fetchSupplierProfile(userId));
      partnerToast.info('Status updated');
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, onProfile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (
      hash === '#income-connect-payouts' ||
      hash === '#business-payouts' ||
      hash === '#income-payout-account' ||
      hash === '#income-payout-settings'
    ) {
      document.getElementById('income-payout-settings')?.scrollIntoView({ block: 'start' });
    }
  }, []);

  const savePreferences = async () => {
    if (!canEdit || saving) return;
    if (cycle !== 'monthly' && cycle !== 'biweekly') {
      setError('Choose how often payouts should be prepared.');
      return;
    }
    const parsed = parsePayoutThreshold(minimum);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateSupplierPayout(userId, {
      payment_cycle: cycle,
      payout_threshold_min: parsed.value,
    });
    setSaving(false);
    if (!res.success) {
      setError(userFacingError(res.error, USER_ERROR.generic));
      partnerToast.error("Couldn't save changes. Try again.");
      return;
    }
    onProfile(await fetchSupplierProfile(userId));
    partnerToast.success('Payout settings saved');
  };

  return (
    <div id="income-payout-settings" className={`mx-auto w-full ${CONTENT_MAX} space-y-4`}>
      <p className="text-[13px] text-[#52525b]" data-payouts-operational={operations.payouts.operational ? '1' : '0'}>
        {operations.payouts.headline}. {operations.payouts.detail}
      </p>

      <SettingsCard title="Bank account" help={PARTNER_HELP.bankAccount}>
        {bankOk || maskedIban ? (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <Fact label="Account" value={maskedIban || 'Connected'} />
            <Fact
              label="Status"
              value={bankStatusLabel({
                bankOk,
                payoutsEnabled: profile?.connect_payouts_enabled === true,
              })}
            />
          </dl>
        ) : (
          <div className="rounded-[10px] border border-dashed border-[#e5e7eb] bg-[#fafbfc] px-4 py-6 text-center">
            <p className="text-sm font-semibold text-[#18181b]">No bank account linked</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-[#71717a]">
              {operations.account.actionLabel
                ? 'Add a bank account during verification. The full account number stays hidden.'
                : 'A bank account appears here after verification. The full account number stays hidden.'}
            </p>
            {operations.account.actionLabel ? (
              <button
                type="button"
                className="tv-btn-secondary mt-4 min-h-11 px-4 text-sm"
                onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/onboarding`)}
              >
                {operations.account.actionLabel}
              </button>
            ) : null}
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Payout preferences" help={PARTNER_HELP.payoutSchedule}>
        <fieldset className="min-w-0" disabled={!canEdit || saving}>
          <legend className="text-[13px] font-semibold text-[#18181b]">Payout frequency</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ['monthly', 'Monthly'],
                ['biweekly', 'Twice a month'],
              ] as const
            ).map(([value, label]) => {
              const selected = cycle === value;
              const totalBps = frequencyQuote.available
                ? value === 'biweekly'
                  ? frequencyQuote.twiceMonthlyTotalBps
                  : frequencyQuote.monthlyTotalBps
                : null;
              return (
                <label
                  key={value}
                  data-frequency={value}
                  data-selected={selected ? 'true' : 'false'}
                  className={`flex min-w-0 cursor-pointer flex-col rounded-[12px] border px-3 py-3 transition-colors ${
                    selected ? 'border-[#17191d] bg-[#fafbfc]' : 'border-[#e5e7eb] bg-white hover:border-[#d4d4d8]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="payout-frequency"
                      value={value}
                      checked={selected}
                      onChange={() => setCycle(value)}
                    />
                    <span className="text-[14px] font-semibold tracking-tight text-[#17191d]">{label}</span>
                  </span>
                  {!commercialTermsReady ? (
                    <span className="mt-2 text-[12px] text-[#71717a]">Loading commission rate…</span>
                  ) : frequencyQuote.available ? (
                    <span className="mt-2 space-y-0.5 text-[12px] leading-5 text-[#52525b]">
                      <span className="block">
                        Standard commission {formatBpsAsPercent(frequencyQuote.standardBps)}
                      </span>
                      <span className="block">
                        {value === 'monthly'
                          ? 'No additional fee'
                          : `Additional fee ${formatBpsAsPercent(frequencyQuote.twiceMonthlyExtraBps)}`}
                      </span>
                      <span className="block font-semibold text-[#17191d]" data-total-bps={totalBps}>
                        Total {formatBpsAsPercent(totalBps ?? frequencyQuote.standardBps)}
                      </span>
                    </span>
                  ) : (
                    <span className="mt-2 text-[12px] text-[#71717a]">Commission rate unavailable</span>
                  )}
                </label>
              );
            })}
          </div>
          <p className="mt-3 text-[12px] leading-5 text-[#71717a]">
            Existing bookings keep the commission already agreed. This choice does not send a payout.
          </p>
        </fieldset>
        <label className="mt-5 block">
          <span className="text-[13px] font-semibold text-[#18181b]">Minimum payout</span>
          <span className="mt-1 block text-[12px] text-[#71717a]">
            Leave blank for no minimum. Amounts are in {currency}. Saving this does not send a payout.
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={minimum}
            disabled={!canEdit || saving}
            onChange={(event) => setMinimum(event.target.value)}
            className="mt-2 h-10 w-full max-w-xs rounded-[10px] border border-[#e5e7eb] px-3 text-[14px]"
            aria-label="Minimum payout"
          />
        </label>
        {error ? (
          <p className="mt-3 text-[13px] font-medium text-[#9f1239]" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="tv-btn-primary mt-4 h-10 px-4 text-[13px] disabled:opacity-50"
          disabled={!canEdit || saving || busy || (cycle !== 'monthly' && cycle !== 'biweekly')}
          onClick={() => void savePreferences()}
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </SettingsCard>
    </div>
  );
}
