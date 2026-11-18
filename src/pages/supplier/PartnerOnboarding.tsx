import { ArrowRight, Check } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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
  partnerBusinessStatusChip,
  partnerPayoutStatusChip,
} from '../../lib/partnerVerificationStatus';
import {
  fetchSupplierProfile,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import {
  fetchSupplierActiveCommercialTerms,
  type SupplierCommercialTermsRow,
} from '../../data/supabase-earnings';
import { canManageBookings, canManageFinance } from '../../lib/supplierTeamRoles';
import StatusChip from '../../components/StatusChip';
import NoticeCallout from '../../components/NoticeCallout';
import PartnerHelpTip from '../../components/supplier/PartnerHelpTip';

const BusinessOnboardingWizard = lazy(
  () => import('../../components/supplier/BusinessOnboardingWizard')
);
const PayoutSetupWizard = lazy(() => import('../../components/supplier/PayoutSetupWizard'));

type PartnerOnboardingProps = {
  profile: SupplierProfileRow | null;
  onSkip: () => void;
  onContinuePhase?: (phase: UnifiedSetupPhaseId) => void;
  onTours: () => void;
  hasListing: boolean;
  onDepartures?: () => void;
  onProfileRefresh?: (profile: SupplierProfileRow | null) => void;
};

export default function PartnerOnboarding({
  profile: profileProp,
  onSkip,
  onTours,
  hasListing,
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

  const setPhaseAndUrl = useCallback((next: UnifiedSetupPhaseId) => {
    setPhase(next);
    writeOnboardingPhaseToUrl(next);
  }, []);

  const handleProfile = useCallback(
    (next: SupplierProfileRow | null) => {
      setProfile(next);
      onProfileRefresh?.(next);
    },
    [onProfileRefresh]
  );

  const businessChip = partnerBusinessStatusChip(progress.businessReview);
  const payoutChip = partnerPayoutStatusChip(progress.payoutReview);
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
    if (id === 'status') return progress.publishReady;
    return progress.phaseComplete[id];
  };

  return (
    <div className="partner-unified-setup-shell payout-wizard flex h-full min-h-0 w-full flex-1 overflow-hidden bg-white">
      <aside className="partner-unified-setup-shell__rail hidden h-full min-h-0 w-[14.75rem] shrink-0 flex-col overflow-hidden border-r border-[#e8ebf0] bg-[#f7f8fa] lg:flex">
        <div className="shrink-0 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83]">
            Partner setup
          </p>
          <p className="mt-1 font-display text-[1.2rem] font-bold tracking-tight text-[#17191d]">
            Get ready to host
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8ebf0]"
            role="progressbar"
            aria-valuenow={progress.requirementsDone}
            aria-valuemin={0}
            aria-valuemax={progress.requirementsTotal}
            aria-label="Requirements completed"
          >
            <div
              className="h-full rounded-full bg-[#073b83] transition-[width] duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] tabular-nums text-[#71717a]">
            {progress.requirementsDone} of {progress.requirementsTotal} complete
          </p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Setup steps">
          <ol className="space-y-1">
            {UNIFIED_SETUP_SCREENS.map((item, index) => {
              const current = item.id === phase;
              const done = phaseMet(item.id);
              const chip =
                item.id === 'documents'
                  ? businessChip
                  : item.id === 'payout'
                    ? payoutChip
                    : null;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setPhaseAndUrl(item.id)}
                    aria-current={current ? 'step' : undefined}
                    className={[
                      'lux-flat flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors',
                      current
                        ? 'bg-[rgba(7,59,131,0.08)] font-semibold text-[#073b83]'
                        : done
                          ? 'font-medium text-[#17191d] hover:bg-[#eef1f5]'
                          : 'font-medium text-[#71717a] hover:bg-[#eef1f5]',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                        current || done
                          ? 'bg-[#073b83] text-white'
                          : 'border border-[#d0d5dd] bg-white text-[#71717a]',
                      ].join(' ')}
                    >
                      {done && !current ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.id === 'documents' && progress.businessReview === 'pending' ? (
                      <StatusChip tone="warn">In review</StatusChip>
                    ) : item.id === 'documents' && progress.businessReview === 'rejected' ? (
                      <StatusChip tone="bad">Action required</StatusChip>
                    ) : item.id === 'payout' && progress.payoutReview === 'rejected' ? (
                      <StatusChip tone="bad">Action required</StatusChip>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="shrink-0 border-t border-[#e8ebf0] p-3">
          <button
            type="button"
            className="lux-flat min-h-10 w-full rounded-lg px-3 text-left text-[13px] font-semibold text-[#5c6570] hover:bg-[#eef1f5] hover:text-[#17191d]"
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
            <Suspense
              fallback={
                <div className="grid flex-1 place-items-center text-[13px] text-[#5c6570]">
                  Opening company setup…
                </div>
              }
            >
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
                onUnifiedPhaseChange={(next) => {
                  if (next === 'documents' || next === 'business') setPhaseAndUrl(next);
                }}
              />
            </Suspense>
          ) : null}

          {showPayout && userId ? (
            <Suspense
              fallback={
                <div className="grid flex-1 place-items-center text-[13px] text-[#5c6570]">
                  Opening payout setup…
                </div>
              }
            >
              <PayoutSetupWizard
                key="pay-embed"
                userId={userId}
                profile={profile}
                commercialTerms={commercialTerms}
                payoutCurrency={profile?.connect_default_currency ?? 'EUR'}
                canEdit={canEditFinance}
                onProfile={handleProfile}
                variant="embedded"
                initialStep={payoutStepForPhase(phase)}
                onClose={onSkip}
                onBackToPreviousPhase={() => setPhaseAndUrl('documents')}
                onUnifiedPhaseChange={(next) => {
                  if (next === 'representative' || next === 'payout' || next === 'status') {
                    setPhaseAndUrl(next);
                  }
                }}
              />
            </Suspense>
          ) : null}

          {showStatus ? (
            <div className="partner-unified-setup-status min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8 [-webkit-overflow-scrolling:touch]">
              <div className="w-full max-w-[40rem]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83]">
                  Next step
                </p>
                <h1 className="mt-1 inline-flex flex-wrap items-center gap-1.5 font-display text-[1.5rem] font-bold tracking-tight text-[#17191d]">
                  {progress.publishReady
                    ? 'You’re ready'
                    : progress.businessReview === 'rejected'
                      ? 'Action required'
                      : progress.businessReview === 'pending'
                        ? 'Almost there'
                        : 'Finish setup'}
                  <PartnerHelpTip label="About setup status">{PARTNER_HELP.publishGate}</PartnerHelpTip>
                </h1>
                <p className="mt-2 max-w-md text-[14px] leading-relaxed text-[#5c6570]">
                  {progress.nextHint}
                </p>

                <button
                  type="button"
                  className="tv-btn-primary mt-6 h-11 min-w-[12rem] px-5 text-[13px]"
                  onClick={() => {
                    if (progress.nextCta.toLowerCase().includes('listing')) {
                      onTours();
                      return;
                    }
                    if (progress.nextPhase === 'status') {
                      if (!hasListing) onTours();
                      else onTours();
                      return;
                    }
                    setPhaseAndUrl(progress.nextPhase);
                  }}
                >
                  {progress.nextCta}
                  <ArrowRight className="ml-1.5 inline-block h-4 w-4" aria-hidden />
                </button>

                {lanes ? (
                  <ul className="mt-8 space-y-0 divide-y divide-[#eef1f4] border-y border-[#eef1f4]">
                    {[
                      ['Company review', lanes.businessVerification],
                      ['Your details', lanes.formProgress],
                      ['Stripe check', lanes.stripeVerification],
                      ['Ready to receive', lanes.payoutReadiness],
                    ].map(([label, value]) => (
                      <li
                        key={label}
                        className="flex items-center justify-between gap-4 py-3.5 text-[13px]"
                      >
                        <span className="font-medium text-[#5c6570]">{label}</span>
                        <span className="text-right font-semibold text-[#17191d]">{value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {progress.publishReady ? (
                  <NoticeCallout className="mt-6" title="Ready to publish" tone="success">
                    {PARTNER_ONBOARDING_PUBLISH_READY_NOTE}
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
