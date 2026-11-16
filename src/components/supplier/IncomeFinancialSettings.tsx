import { lazy, Suspense, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Lock } from 'lucide-react';
import {
  fetchSupplierProfile,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { invokeConnectSupplierOnboarding } from '../../data/supabase-connect-onboarding';
import type { SupplierCommercialTermsRow } from '../../data/supabase-earnings';
import { formatBpsAsPercent } from '../../lib/commercial-money';
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
import { bankAlreadyManaged } from '../../lib/verification-workspace-lifecycle';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { firstOutstandingWizardStep, type PayoutWizardStepId } from '../../lib/payout-setup-wizard';

const PayoutSetupWizard = lazy(() => import('./PayoutSetupWizard'));

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

function preferenceLabel(cycle: string | null | undefined): string {
  if (cycle === 'biweekly') return 'Twice monthly';
  if (cycle === 'monthly') return 'Monthly';
  return 'Not saved';
}

function stepIcon(state: string) {
  if (state === 'complete') return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
  if (state === 'current') return <Circle className="h-4 w-4 fill-[#073b83] text-[#073b83]" aria-hidden />;
  if (state === 'blocked') return <Lock className="h-4 w-4 text-red-600" aria-hidden />;
  return <Circle className="h-4 w-4 text-[#a1a1aa]" aria-hidden />;
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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<PayoutWizardStepId>('business');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const experience = deriveConnectExperienceState(profile);
  const experienceLabel = connectExperienceLabel(experience);
  const statusLabel = connectOnboardingLabel(profile?.connect_onboarding_status, {
    connect_account_livemode: profile?.connect_account_livemode,
  });
  const canReceiveTransfers = connectCanReceiveTransfers(profile ?? {});
  const progress = buildConnectProgressSteps(profile).filter((s) => s.id !== 'ready_for_payouts');
  const bankOk = bankAlreadyManaged(profile);
  const accountBlocks = listSupplierPayoutBlocks({
    profile,
    financialHold,
    debtMinor,
    eligibleEarningsMinor,
  }).filter((b) => b.category === 'account');
  const nextAction = accountBlocks[0]?.message ?? null;

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
      onProfile(await fetchSupplierProfile(userId));
      setWizardStep(resolveResumeStep(await fetchSupplierProfile(userId)));
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
    setWizardStep(step ?? resolveResumeStep(profile));
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

  const primaryCta =
    experience === 'not_started'
      ? 'Set up payouts'
      : canReceiveTransfers && bankOk && profile?.payment_cycle
        ? 'Review payout setup'
        : 'Continue payout setup';

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
          commercialTerms={commercialTerms}
          payoutCurrency={payoutCurrency}
          canEdit={canEdit}
          onProfile={onProfile}
          initialStep={wizardStep}
          onClose={() => {
            setWizardOpen(false);
            void refreshStatus();
          }}
        />
      </Suspense>
    );
  }

  return (
    <div id="income-payout-settings" className="mx-auto w-full max-w-[32rem] space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg font-bold tracking-tight text-[#18181b] sm:text-xl">
          Income &amp; Payouts · Settings
        </h1>
        <p className="text-[13px] leading-relaxed text-[#52525b]">
          Set up business details, verification, bank destination, and preferences in one guided flow.
        </p>
      </header>

      <ol className="flex flex-wrap gap-2" aria-label="Payout setup progression">
        {progress.map((step) => (
          <li
            key={step.id}
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
              step.state === 'complete'
                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
                : step.state === 'current'
                  ? 'border-[#073b83]/30 bg-[#f0f4fa] text-[#073b83]'
                  : 'border-[#e5e7eb] bg-[#fafafa] text-[#71717a]',
            ].join(' ')}
          >
            {stepIcon(step.state)}
            <span className="font-semibold">{step.label}</span>
          </li>
        ))}
      </ol>

      <section className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5">
        <p className="text-[13px] font-semibold text-[#18181b]">{experienceLabel}</p>
        <p className="mt-1 text-[12px] text-[#52525b]">
          {nextAction ||
            (canReceiveTransfers
              ? 'Verification is complete with the payment provider. Traverion payouts remain separately controlled.'
              : 'Continue the guided setup to finish verification and bank details.')}
        </p>
        <dl className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
          <div>
            <dt className="text-[#71717a]">Business</dt>
            <dd className="font-medium text-[#18181b]">
              {profile?.company_legal_name || profile?.display_name || 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-[#71717a]">Bank</dt>
            <dd className="font-medium text-[#18181b]">{bankOk ? 'On file' : 'Needed'}</dd>
          </div>
          <div>
            <dt className="text-[#71717a]">Preference</dt>
            <dd className="font-medium text-[#18181b]">
              {preferenceLabel(profile?.payment_cycle)}
              {profile?.payout_threshold_min != null
                ? ` · min ${profile.payout_threshold_min}`
                : ''}
            </dd>
          </div>
          <div>
            <dt className="text-[#71717a]">Provider status</dt>
            <dd className="font-medium text-[#18181b]">{statusLabel}</dd>
          </div>
        </dl>
        {commercialTerms ? (
          <p className="mt-3 text-[11px] text-[#71717a]">
            Agreement commission {formatBpsAsPercent(commercialTerms.commission_bps)}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="tv-btn-primary h-11 px-4 text-[13px]"
            disabled={!canEdit || busy}
            onClick={() => openWizard()}
          >
            {busy ? 'Working…' : primaryCta}
          </button>
          <button
            type="button"
            className="tv-btn-secondary h-11 px-3 text-[13px]"
            disabled={busy}
            onClick={() => void refreshStatus()}
          >
            Refresh status
          </button>
        </div>

        {note ? (
          <p className="mt-3 text-[12px] text-[#18181b]" role="status">
            {note}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-[12px] text-red-800" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
