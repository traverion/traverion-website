import { ArrowRight, Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import {
  PARTNER_FIRST_LISTING_STEP_NOTE,
  PARTNER_ONBOARDING_PUBLISH_READY_NOTE,
} from '../../lib/booking-confirmation-copy';
import {
  businessStepForPhase,
  derivePartnerSetupProgress,
  payoutStepForPhase,
  readOnboardingPhaseFromUrl,
  readinessCopyFromProfile,
  UNIFIED_SETUP_SCREENS,
  writeOnboardingPhaseToUrl,
  type UnifiedSetupPhaseId,
} from '../../lib/partner-unified-setup';
import { PARTNER_HELP } from '../../lib/partnerHelpCopy';
import {
  fetchSupplierProfile,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { invokeConnectSupplierOnboarding } from '../../data/supabase-connect-onboarding';
import {
  fetchSupplierActiveCommercialTerms,
  type SupplierCommercialTermsRow,
} from '../../data/supabase-earnings';
import { canManageBookings, canManageFinance } from '../../lib/supplierTeamRoles';
import {
  onboardingCompletionCopy,
  resolveOnboardingCompletionState,
} from '../../lib/payout-setup-wizard';
import { connectCanReceiveTransfers } from '../../lib/connect-payout-status';
import { connectRequirementPressure } from '../../lib/connect-requirement-labels';
import StatusChip from '../../components/StatusChip';
import NoticeCallout from '../../components/NoticeCallout';
import PartnerHelpTip from '../../components/supplier/PartnerHelpTip';
import BusinessOnboardingWizard from '../../components/supplier/BusinessOnboardingWizard';
import PayoutSetupWizard from '../../components/supplier/PayoutSetupWizard';
import { humanizeConnectRequirements } from '../../lib/connect-requirement-labels';

type PartnerOnboardingProps = {
  profile: SupplierProfileRow | null;
  onSkip: () => void;
  onContinuePhase?: (phase: UnifiedSetupPhaseId) => void;
  onTours: () => void;
  hasListing: boolean;
  profileReady?: boolean;
  onDepartures?: () => void;
  onProfileRefresh?: (profile: SupplierProfileRow | null) => void;
};

export default function PartnerOnboarding({
  profile: profileProp,
  onSkip,
  onTours,
  hasListing,
  profileReady = true,
  onDepartures,
  onProfileRefresh,
}: PartnerOnboardingProps) {
  const { user } = useSupplierAuth();
  const { role } = useSupplierRole();
  const userId = user?.id ?? '';
  const canEditBusiness = canManageBookings(role);
  const canEditFinance = canManageFinance(role);

  const [profile, setProfile] = useState<SupplierProfileRow | null>(profileProp);
  const [commercialTerms, setCommercialTerms] = useState<SupplierCommercialTermsRow | null>(null);
  const [phase, setPhase] = useState<UnifiedSetupPhaseId>(() => {
    return readOnboardingPhaseFromUrl() ?? 'business';
  });
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    setProfile(profileProp);
  }, [profileProp]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchSupplierActiveCommercialTerms(userId)
      .then((terms) => {
        if (!cancelled) setCommercialTerms(terms);
      })
      .catch(() => {
        if (!cancelled) setCommercialTerms(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setPhaseAndUrl = useCallback((next: UnifiedSetupPhaseId) => {
    setPhase((prev) => (prev === next ? prev : next));
    if (readOnboardingPhaseFromUrl() !== next) {
      writeOnboardingPhaseToUrl(next);
    }
  }, []);

  const handlePayoutPhaseChange = useCallback(
    (next: 'representative' | 'payout' | 'status') => {
      setPhaseAndUrl(next);
    },
    [setPhaseAndUrl]
  );

  const handleBusinessPhaseChange = useCallback(
    (next: 'business' | 'documents') => {
      setPhaseAndUrl(next);
    },
    [setPhaseAndUrl]
  );

  // Stripe Account Link return/refresh → sync status into the same onboarding shell.
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const connect = params.get('connect');
    if (connect !== 'return' && connect !== 'refresh') return;
    let cancelled = false;
    void (async () => {
      await invokeConnectSupplierOnboarding('status');
      const next = await fetchSupplierProfile(userId);
      if (cancelled) return;
      setProfile(next);
      onProfileRefresh?.(next);
      setPhaseAndUrl('status');
      params.delete('connect');
      const qs = params.toString();
      const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, onProfileRefresh, setPhaseAndUrl]);

  useEffect(() => {
    if (!userId || !profile?.stripe_connected_account_id) return;
    let cancelled = false;
    void invokeConnectSupplierOnboarding('status').then((result) => {
      if (!cancelled) setPayoutGatesOpen(result.payout_gates_open === true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, profile?.stripe_connected_account_id]);

  const progress = useMemo(
    () =>
      derivePartnerSetupProgress(profile, {
        userId,
        hasListing,
      }),
    [profile, userId, hasListing]
  );
  const lanes = useMemo(
    () => (userId ? readinessCopyFromProfile(profile, userId) : null),
    [profile, userId]
  );

  useEffect(() => {
    if (bootstrapped) return;
    const fromUrl = readOnboardingPhaseFromUrl();
    const next = fromUrl ?? progress.nextPhase;
    setPhase(next);
    writeOnboardingPhaseToUrl(next);
    setBootstrapped(true);
  }, [bootstrapped, progress.nextPhase]);

  const handleProfile = useCallback(
    (next: SupplierProfileRow | null) => {
      setProfile(next);
      onProfileRefresh?.(next);
    },
    [onProfileRefresh]
  );

  const [payoutGatesOpen, setPayoutGatesOpen] = useState(false);
  const hasConnectedAccount = Boolean(profile?.stripe_connected_account_id);
  const canReceive = connectCanReceiveTransfers(profile ?? {});
  const completionState = resolveOnboardingCompletionState({
    hasConnectedAccount,
    canReceiveTransfers: canReceive,
    connectLivemode: profile?.connect_account_livemode,
    wizardCompleted: progress.payoutConfigured,
    payoutConfigured: progress.payoutConfigured,
    payoutGatesOpen,
  });
  const completionCopy = onboardingCompletionCopy(completionState);
  const stripeDue = [
    ...(Array.isArray(profile?.connect_requirements_currently_due)
      ? profile.connect_requirements_currently_due
      : []),
    ...(Array.isArray(profile?.connect_requirements_past_due)
      ? profile.connect_requirements_past_due
      : []),
  ];
  const stripePressure = connectRequirementPressure(stripeDue);
  const identityStatusLabel = !hasConnectedAccount
    ? (lanes?.formProgress ?? 'Not started')
    : stripePressure.identity
      ? 'Action required'
      : 'On file';
  const bankStatusLabel = !hasConnectedAccount
    ? (lanes?.stripeVerification ?? 'Not started')
    : stripePressure.bank
      ? 'Action required'
      : canReceive
        ? 'On file'
        : (lanes?.stripeVerification ?? 'Not started');
  const needsStripeContinue =
    hasConnectedAccount &&
    (!canReceive ||
      (Array.isArray(profile?.connect_requirements_currently_due) &&
        profile!.connect_requirements_currently_due!.length > 0) ||
      (Array.isArray(profile?.connect_requirements_past_due) &&
        profile!.connect_requirements_past_due!.length > 0));

  const phaseIndex = Math.max(
    0,
    UNIFIED_SETUP_SCREENS.findIndex((s) => s.id === phase)
  );
  const screen = UNIFIED_SETUP_SCREENS[phaseIndex] ?? UNIFIED_SETUP_SCREENS[0]!;
  const progressPct = Math.round(
    (progress.requirementsDone / Math.max(1, progress.requirementsTotal)) * 100
  );

  const showBusiness = phase === 'business' || phase === 'documents';
  const showPayout = phase === 'representative' || phase === 'payout';
  const showStatus = phase === 'status';

  const phaseMet = (id: UnifiedSetupPhaseId): boolean => {
    if (id === 'status') return progress.publishReady || completionState === 'ready_to_receive';
    return progress.phaseComplete[id];
  };

  const statusPrimaryLabel = needsStripeContinue
    ? 'Continue verification'
    : progress.nextCta;
  const statusHeadline =
    progress.businessReview === 'rejected'
      ? 'Action required'
      : showStatus
        ? completionCopy.title
        : progress.nextHint;

  if (!profileReady) {
    return (
      <div
        className="partner-unified-setup-shell flex h-full min-h-0 w-full flex-1 items-center justify-center bg-white"
        data-cert="p953"
      >
        <p className="text-[13px] text-[#71717a]" role="status">
          Loading your details…
        </p>
      </div>
    );
  }

  return (
    <div
      className="partner-unified-setup-shell payout-wizard flex h-full min-h-0 w-full flex-1 overflow-hidden bg-white"
      data-cert="p953"
    >
      <aside className="partner-unified-setup-shell__rail hidden h-full min-h-0 shrink-0 flex-col overflow-hidden lg:flex">
        <div className="shrink-0 px-3.5 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#073b83]">
            Partner setup
          </p>
          <p className="partner-onboarding-title mt-1 text-[1.05rem] !font-bold tracking-tight text-[#17191d]">
            Get ready to host
          </p>
          <div
            className="partner-unified-setup-shell__progress mt-3 h-1 overflow-hidden rounded-full bg-[#e8ebf0]"
            role="progressbar"
            aria-valuenow={progress.requirementsDone}
            aria-valuemin={0}
            aria-valuemax={progress.requirementsTotal}
            aria-label="Requirements completed"
          >
            <div
              className="h-full rounded-full bg-[#073b83]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] tabular-nums text-[#71717a]">
            {progress.requirementsDone} of {progress.requirementsTotal} complete
          </p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Setup steps">
          <ol className="space-y-0.5">
            {UNIFIED_SETUP_SCREENS.map((item, index) => {
              const current = item.id === phase;
              const done = phaseMet(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setPhaseAndUrl(item.id)}
                    aria-current={current ? 'step' : undefined}
                    className={[
                      'partner-unified-setup-shell__rail-step lux-flat flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[12.5px]',
                      current
                        ? 'font-semibold text-[#073b83]'
                        : done
                          ? 'font-medium text-[#17191d]'
                          : 'font-medium text-[#71717a]',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                        current || done
                          ? 'bg-[#073b83] text-white'
                          : 'border border-[#d0d5dd] bg-white text-[#71717a]',
                      ].join(' ')}
                    >
                      {done && !current ? (
                        <Check className="h-3 w-3" strokeWidth={3} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.id === 'documents' && progress.businessReview === 'pending' ? (
                      <StatusChip tone="warn">In review</StatusChip>
                    ) : item.id === 'documents' && progress.businessReview === 'rejected' ? (
                      <StatusChip tone="bad">Fix</StatusChip>
                    ) : item.id === 'payout' && progress.payoutReview === 'rejected' ? (
                      <StatusChip tone="bad">Fix</StatusChip>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="shrink-0 border-t border-[#e8ebf0] p-2.5">
          <button
            type="button"
            className="lux-flat min-h-9 w-full rounded-lg px-2.5 text-left text-[12.5px] font-semibold text-[#5c6570] hover:bg-[#eef1f5] hover:text-[#17191d]"
            onClick={onSkip}
          >
            Save &amp; exit
          </button>
        </div>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#fcfcfd]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e8ebf0] bg-white px-4 py-2.5 pt-[max(0.6rem,env(safe-area-inset-top))] sm:px-5 lg:hidden">
          <button
            type="button"
            className="min-h-10 text-[13px] font-semibold text-[#17191d]"
            onClick={onSkip}
          >
            Exit
          </button>
          <p className="truncate text-[13px] font-semibold text-[#17191d]">{screen.title}</p>
          <p className="min-w-[3.5rem] text-right text-[11px] tabular-nums text-[#71717a]">
            {progress.requirementsDone}/{progress.requirementsTotal}
          </p>
        </header>

        <div className="shrink-0 border-b border-[#e8ebf0] bg-white px-4 py-2 sm:px-5 lg:hidden">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {UNIFIED_SETUP_SCREENS.map((item) => {
              const current = item.id === phase;
              const done = phaseMet(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPhaseAndUrl(item.id)}
                  className={[
                    'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
                    current
                      ? 'bg-[#073b83] text-white'
                      : done
                        ? 'bg-[#e8eef8] text-[#073b83]'
                        : 'bg-[#f1f3f6] text-[#71717a]',
                  ].join(' ')}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {showBusiness && userId ? (
            <BusinessOnboardingWizard
              key="biz-embed"
              userId={userId}
              profile={profile}
              canEdit={canEditBusiness}
              onProfile={handleProfile}
              variant="embedded"
              initialStep={businessStepForPhase(phase)}
              onClose={onSkip}
              onSubmitted={() => setPhaseAndUrl('representative')}
              onUnifiedPhaseChange={handleBusinessPhaseChange}
            />
          ) : null}

          {showPayout && userId ? (
            <PayoutSetupWizard
              key="pay-embed"
              userId={userId}
              profile={profile}
              commercialTerms={commercialTerms}
              payoutCurrency={profile?.connect_default_currency ?? 'EUR'}
              canEdit={canEditFinance}
              onProfile={handleProfile}
              variant="embedded"
              unifiedPhase={phase === 'representative' || phase === 'payout' ? phase : 'payout'}
              initialStep={payoutStepForPhase(phase)}
              onClose={onSkip}
              onBackToPreviousPhase={() => setPhaseAndUrl('documents')}
              onUnifiedPhaseChange={handlePayoutPhaseChange}
            />
          ) : null}

          {showStatus ? (
            <div className="partner-unified-setup-status min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 lg:px-10 [-webkit-overflow-scrolling:touch]">
              <div className="partner-unified-setup-canvas partner-unified-setup-stage mx-auto w-full">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#073b83]">
                  {progress.businessReview === 'rejected'
                    ? 'Action required'
                    : completionCopy.kicker}
                </p>
                <h1 className="partner-onboarding-title mt-1 inline-flex flex-wrap items-center gap-1.5">
                  {progress.businessReview === 'rejected'
                    ? 'Update your documents'
                    : statusHeadline}
                  <PartnerHelpTip label="About setup status">{PARTNER_HELP.publishGate}</PartnerHelpTip>
                </h1>
                <p className="partner-onboarding-lede">
                  {progress.businessReview === 'rejected'
                    ? progress.nextHint
                    : needsStripeContinue
                      ? 'Finish identity and bank details in Traverion. Stripe reviews them after you submit.'
                      : completionCopy.lede}
                </p>

                {needsStripeContinue ? (
                  <ul className="mt-5 list-disc space-y-1 pl-5 text-[13px] leading-snug text-[#3f3f46]">
                    {humanizeConnectRequirements(stripeDue).slice(0, 8).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}

                <button
                    type="button"
                    className="tv-btn-primary mt-6 h-11 min-w-[12rem] px-5 text-[13px]"
                    onClick={() => {
                      if (needsStripeContinue) {
                        setPhaseAndUrl('representative');
                        return;
                      }
                      if (progress.nextCta.toLowerCase().includes('listing')) {
                        onTours();
                        return;
                      }
                      if (progress.nextPhase === 'status') {
                        onTours();
                        return;
                      }
                      setPhaseAndUrl(progress.nextPhase);
                    }}
                  >
                    {needsStripeContinue ? 'Continue verification' : statusPrimaryLabel}
                    <ArrowRight className="ml-1.5 inline-block h-4 w-4" aria-hidden />
                  </button>

                {lanes ? (
                  <ul className="partner-status-lanes" aria-label="Setup status">
                    {[
                      ['Business verification', lanes.businessVerification],
                      ['Identity', identityStatusLabel],
                      ['Bank account', bankStatusLabel],
                      ['Ready to receive', lanes.payoutReadiness],
                    ].map(([label, value]) => (
                      <li key={label}>
                        <span className="font-medium text-[#5c6570]">{label}</span>
                        <span className="text-right font-semibold text-[#17191d]">{value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {completionState === 'ready_to_receive' || progress.publishReady ? (
                  <NoticeCallout className="mt-6" title="Ready to host" tone="success">
                    {progress.publishReady
                      ? PARTNER_ONBOARDING_PUBLISH_READY_NOTE
                      : 'Verification is complete and payouts are ready.'}
                  </NoticeCallout>
                ) : null}

                {!hasListing ? (
                  <p className="mt-5 text-[12px] leading-relaxed text-[#5c6570]">
                    {PARTNER_FIRST_LISTING_STEP_NOTE}
                  </p>
                ) : (
                  <button
                    type="button"
                    className="lux-flat mt-5 min-h-10 text-[13px] font-semibold text-[#5c6570] hover:text-[#17191d]"
                    onClick={() => onDepartures?.() ?? onTours()}
                  >
                    Open calendar
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
