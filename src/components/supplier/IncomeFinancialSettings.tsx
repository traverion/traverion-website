import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  fetchSupplierProfile,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { invokeConnectSupplierOnboarding } from '../../data/supabase-connect-onboarding';
import type { SupplierCommercialTermsRow } from '../../data/supabase-earnings';
import {
  connectCanReceiveTransfers,
  connectOnboardingLabel,
} from '../../lib/connect-payout-status';
import { deriveConnectExperienceState } from '../../lib/connect-payout-progress';
import { bankAlreadyManaged } from '../../lib/verification-workspace-lifecycle';
import { maskIban } from '../../lib/supplier-income';
import { PARTNER_HELP } from '../../lib/partnerHelpCopy';
import type { PartnerStatusTone } from '../../lib/partnerVerificationStatus';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import {
  firstOutstandingWizardStep,
  loadPayoutWizardDraft,
  payoutBankPresentation,
  payoutVerificationPresentation,
  summarizePayoutWizardLocalProgress,
  type PayoutWizardStepId,
} from '../../lib/payout-setup-wizard';
import StatusChip from '../StatusChip';
import PartnerHelpTip from './PartnerHelpTip';

const PayoutSetupWizard = lazy(() => import('./PayoutSetupWizard'));

/** Align with Income overview content width. */
const CONTENT_MAX = 'max-w-[1180px]';

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

function preferenceFrequency(cycle: string | null | undefined): string {
  if (cycle === 'biweekly') return 'Twice monthly';
  if (cycle === 'monthly') return 'Monthly';
  return 'Not set';
}

function preferenceMinimum(
  min: number | string | null | undefined,
  currency: string | null
): string {
  if (min == null || min === '') return 'Not set';
  const n = typeof min === 'number' ? min : Number(min);
  if (!Number.isFinite(n)) return String(min);
  const code = (currency || 'EUR').toUpperCase();
  return `${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${code}`;
}

function statusTone(label: string): PartnerStatusTone {
  switch (label) {
    case 'Verified':
      return 'good';
    case 'Under review':
      return 'warn';
    case 'Action required':
    case 'Restricted':
    case 'LIVE onboarding required':
      return 'bad';
    case 'Details saved — connection not enabled':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function bankStatusLabel(input: {
  bankOk: boolean;
  verified: boolean;
  actionRequired: boolean;
}): string {
  if (!input.bankOk) return 'Not connected';
  if (input.actionRequired) return 'Needs attention';
  if (input.verified) return 'Connected';
  return 'On file';
}

function resolveResumeStep(profile: SupplierProfileRow | null): PayoutWizardStepId {
  const hasBusiness = Boolean(profile?.company_legal_name || profile?.business_type);
  const bank = bankAlreadyManaged(profile);
  const prefs = Boolean(profile?.payment_cycle);
  const canReceive = connectCanReceiveTransfers(profile ?? {});
  const outstanding = [
    ...(Array.isArray(profile?.connect_requirements_currently_due)
      ? profile.connect_requirements_currently_due
      : []),
    ...(Array.isArray(profile?.connect_requirements_past_due)
      ? profile.connect_requirements_past_due
      : []),
  ].map(String);
  const fromRequirements = firstOutstandingWizardStep(outstanding);
  if (fromRequirements && !canReceive) return fromRequirements;
  if (!hasBusiness) return 'business';
  if (!profile?.connect_details_submitted && !canReceive) return 'representative';
  if (!canReceive && profile?.connect_account_type === 'custom') return 'identity';
  if (!bank) return 'bank';
  if (!prefs) return 'preferences';
  return 'review';
}

function SettingsCard({
  title,
  help,
  action,
  children,
}: {
  title: string;
  help?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] px-5 py-4 sm:px-6">
        <h2 className="inline-flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-[#17191d]">
          {title}
          {help ? <PartnerHelpTip label={`About ${title}`}>{help}</PartnerHelpTip> : null}
        </h2>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function Fact({
  label,
  value,
  help,
}: {
  label: string;
  value: ReactNode;
  help?: string;
}) {
  const empty =
    value == null || (typeof value === 'string' && (!value.trim() || value === '—'));
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

export default function IncomeFinancialSettings({
  userId,
  profile,
  commercialTerms: _commercialTerms,
  payoutCurrency,
  canEdit,
  onProfile,
}: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<PayoutWizardStepId>('business');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [draftTick, setDraftTick] = useState(0);

  const experience = deriveConnectExperienceState(profile);
  /** Provider mirror label — never “Payouts enabled” while execution may be off. */
  const connectStatus = connectOnboardingLabel(profile?.connect_onboarding_status, {
    connect_account_livemode: profile?.connect_account_livemode,
  });
  const localProgress = useMemo(
    () => summarizePayoutWizardLocalProgress(loadPayoutWizardDraft(userId)),
    [userId, draftTick, wizardOpen]
  );
  const hasConnectedAccount = Boolean(profile?.stripe_connected_account_id);
  /** Supplier-facing verification chip — honest when only device draft exists. */
  const displayStatus = payoutVerificationPresentation({
    connectLabel: connectStatus,
    hasConnectedAccount,
    localProgress,
  });
  const verified = displayStatus === 'Verified';
  const bankOk = bankAlreadyManaged(profile);
  const actionRequired =
    displayStatus === 'Action required' ||
    displayStatus === 'Restricted' ||
    displayStatus === 'LIVE onboarding required';
  const maskedIban = maskIban(profile?.payout_iban);
  const bankIdentifier = maskedIban
    ? maskedIban
    : bankOk
      ? '•••• linked'
      : null;
  const bankDisplayValue = bankOk
    ? bankIdentifier
    : payoutBankPresentation({
        bankManaged: false,
        bankMasked: null,
        localProgress,
      });
  const showBankCard =
    bankOk || localProgress.bankSavedLocally || localProgress.bankDeferred;
  const legalName =
    profile?.company_legal_name?.trim() ||
    profile?.display_name?.trim() ||
    null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const connect = params.get('connect');
    if (connect !== 'return' && connect !== 'refresh') return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      const result = await invokeConnectSupplierOnboarding('refresh');
      if (cancelled) return;
      setBusy(false);
      if (!result.success) {
        setError(userFacingError(result.error, USER_ERROR.generic));
        return;
      }
      setNote('Status updated.');
      const next = await fetchSupplierProfile(userId);
      onProfile(next);
      setWizardStep(resolveResumeStep(next));
      setWizardOpen(true);
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

  const openWizard = (step?: PayoutWizardStepId) => {
    setError(null);
    setNote(null);
    if (!canEdit) {
      setError('Your role can view payout setup but cannot change it.');
      return;
    }
    if (step) {
      setWizardStep(step);
    } else {
      const draft = loadPayoutWizardDraft(userId);
      const progress = summarizePayoutWizardLocalProgress(draft);
      if (progress.wizardCompleted) setWizardStep('review');
      else if (draft?.step) setWizardStep(draft.step);
      else setWizardStep(resolveResumeStep(profile));
    }
    setWizardOpen(true);
  };

  const refreshStatus = async () => {
    setBusy(true);
    setError(null);
    const result = await invokeConnectSupplierOnboarding('refresh');
    setBusy(false);
    if (!result.success) {
      setError(userFacingError(result.error, USER_ERROR.generic));
      return;
    }
    setNote('Status refreshed.');
    onProfile(await fetchSupplierProfile(userId));
  };

  const primarySetupLabel = localProgress.wizardCompleted
    ? 'Review setup'
    : localProgress.hasSavedProgress
      ? 'Continue setup'
      : connectStatus === 'Not started' || experience === 'not_started'
        ? 'Set up payouts'
        : 'Continue setup';
  const showPrimarySetup = !verified || actionRequired || localProgress.hasSavedProgress;

  if (wizardOpen) {
    return (
      <Suspense
        fallback={
          <div className="fixed inset-0 z-[80] grid place-items-center bg-white text-[13px] text-[#52525b]">
            Opening payout setup…
          </div>
        }
      >
        <PayoutSetupWizard
          userId={userId}
          profile={profile}
          commercialTerms={_commercialTerms}
          payoutCurrency={payoutCurrency}
          canEdit={canEdit}
          onProfile={onProfile}
          initialStep={wizardStep}
          onClose={() => {
            setWizardOpen(false);
            setDraftTick((n) => n + 1);
            // Refresh only when a Connect account already exists — never create one on open/close.
            if (profile?.stripe_connected_account_id) {
              void refreshStatus();
            }
          }}
        />
      </Suspense>
    );
  }

  return (
    <div id="income-payout-settings" className={`mx-auto w-full ${CONTENT_MAX} space-y-4`}>
      <SettingsCard
        title="Payout account"
        help={PARTNER_HELP.payoutStatus}
        action={
          showPrimarySetup ? (
            <button
              type="button"
              className="tv-btn-primary h-10 px-4 text-[13px]"
              disabled={!canEdit || busy}
              onClick={() => openWizard()}
            >
              {busy ? 'Working…' : primarySetupLabel}
            </button>
          ) : verified ? (
            <button
              type="button"
              className="tv-btn-secondary h-10 px-4 text-[13px]"
              disabled={!canEdit || busy}
              onClick={() => openWizard('review')}
            >
              Review setup
            </button>
          ) : null
        }
      >
        <div className="rounded-[10px] border border-[#eef1f4] bg-[#f8fafc] px-4 py-4 sm:px-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71717a]">
              Verification
            </span>
            <StatusChip tone={statusTone(displayStatus)}>{displayStatus}</StatusChip>
            {localProgress.hasSavedProgress ? (
              <StatusChip tone="neutral">
                {localProgress.wizardCompleted ? 'Setup saved' : 'Details saved'}
              </StatusChip>
            ) : null}
            <PartnerHelpTip label="About verification status">
              {displayStatus === 'Verified'
                ? PARTNER_HELP.verified
                : displayStatus === 'Under review'
                  ? PARTNER_HELP.underReview
                  : displayStatus === 'Action required' || displayStatus === 'Restricted'
                    ? PARTNER_HELP.actionRequired
                    : displayStatus === 'Details saved — connection not enabled'
                      ? 'Your details are saved on this device. Provider verification starts only after Traverion enables payout connection.'
                      : PARTNER_HELP.incomplete}
            </PartnerHelpTip>
          </div>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
            <Fact label="Registered business" value={legalName} />
            <Fact label="Verification" value={displayStatus} />
            <Fact
              label="Onboarding"
              value={
                localProgress.wizardCompleted
                  ? 'Setup completed on this device'
                  : localProgress.hasSavedProgress
                    ? `${localProgress.savedStepCount} step${localProgress.savedStepCount === 1 ? '' : 's'} saved on this device`
                    : 'Not started'
              }
            />
          </dl>
          <p className="mt-3 text-[12px] leading-relaxed text-[#71717a]">
            Saved information is not the same as verified. Bank connection and payouts stay pending
            until the payment provider confirms them — Traverion never marks those complete from a
            local draft alone.
          </p>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Bank account"
        help={PARTNER_HELP.bankAccount}
        action={
          <button
            type="button"
            className="tv-btn-secondary h-10 px-4 text-[13px]"
            disabled={!canEdit || busy}
            onClick={() => openWizard('bank')}
          >
            {bankOk ? 'Replace bank account' : 'Add bank account'}
          </button>
        }
      >
        {showBankCard ? (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <Fact
              label="Account"
              value={
                bankOk
                  ? bankDisplayValue
                  : localProgress.bankLast4
                    ? `•••• ${localProgress.bankLast4}`
                    : localProgress.bankDeferred
                      ? 'Not sent yet'
                      : bankDisplayValue
              }
            />
            <Fact
              label="Status"
              value={
                bankOk
                  ? bankStatusLabel({ bankOk, verified, actionRequired })
                  : payoutBankPresentation({
                      bankManaged: false,
                      bankMasked: null,
                      localProgress,
                    })
              }
            />
          </dl>
        ) : (
          <div className="rounded-[10px] border border-dashed border-[#e5e7eb] bg-[#fafbfc] px-4 py-6 text-center">
            <p className="text-sm font-semibold text-[#18181b]">No bank account linked</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-[#71717a]">
              Add an account during payout setup once connection is available. Traverion never shows
              the full account number.
            </p>
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title="Payout preferences"
        help={PARTNER_HELP.payoutSchedule}
        action={
          <button
            type="button"
            className="tv-btn-secondary h-10 px-4 text-[13px]"
            disabled={!canEdit || busy}
            onClick={() => openWizard('preferences')}
          >
            Edit preferences
          </button>
        }
      >
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Fact label="Payout frequency" value={preferenceFrequency(profile?.payment_cycle)} />
          <Fact
            label="Minimum payout"
            value={preferenceMinimum(profile?.payout_threshold_min, payoutCurrency)}
          />
        </dl>
        <p className="mt-4 text-[12px] leading-relaxed text-[#71717a]">
          Preferences are saved for when Traverion runs payouts. They do not move money by themselves.
        </p>
      </SettingsCard>

      {profile?.stripe_connected_account_id ? (
        <div className="flex flex-wrap items-center gap-3 px-1">
          <button
            type="button"
            className="lux-flat min-h-9 text-[13px] font-semibold text-[#073b83] hover:text-[#052d65] disabled:opacity-50"
            disabled={busy}
            onClick={() => void refreshStatus()}
          >
            {busy ? 'Refreshing…' : 'Refresh status'}
          </button>
          {note ? (
            <p className="text-[12px] text-[#5c6570]" role="status">
              {note}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="px-1 text-[13px] font-medium text-[#9f1239]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
