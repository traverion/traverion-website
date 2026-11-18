import { ArrowRight, Check } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { useSupplierRole } from '../../hooks/useSupplierRole';
import {
  PARTNER_FIRST_LISTING_STEP_NOTE,
  PARTNER_ONBOARDING_CHECKLIST_DONE_NOTE,
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

function phaseDone(
  id: UnifiedSetupPhaseId,
  progress: ReturnType<typeof derivePartnerSetupProgress>
): boolean {
  if (id === 'business') {
    return (
      progress.businessReview === 'pending' ||
      progress.businessReview === 'verified' ||
      (progress.businessDraftComplete && progress.businessReview !== 'rejected')
    );
  }
  if (id === 'documents') {
    return (
      progress.businessReview === 'verified' ||
      (progress.businessDraftComplete && progress.businessReview === 'pending')
    );
  }
  if (id === 'representative' || id === 'payout') {
    return progress.bankingReady || progress.payoutConfigured;
  }
  return progress.publishReady;
}

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

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const next = await fetchSupplierProfile(userId);
    handleProfile(next);
  }, [userId, handleProfile]);

  const businessChip = partnerBusinessStatusChip(progress.businessReview);
  const payoutChip = partnerPayoutStatusChip(progress.payoutReview);
  const phaseIndex = Math.max(
    0,
    UNIFIED_SETUP_SCREENS.findIndex((s) => s.id === phase)
  );
  const screen = UNIFIED_SETUP_SCREENS[phaseIndex] ?? UNIFIED_SETUP_SCREENS[0]!;
  const progressPct = Math.round(((phaseIndex + 1) / UNIFIED_SETUP_SCREENS.length) * 100);

  const showBusiness = phase === 'business' || phase === 'documents';
  const showPayout = phase === 'representative' || phase === 'payout';
  const showStatus = phase === 'status';

  return (
    <div className="partner-unified-setup-shell payout-wizard flex h-full min-h-0 w-full flex-1 overflow-hidden bg-white">
      <aside className="partner-unified-setup-shell__rail hidden h-full min-h-0 w-[15.25rem] shrink-0 flex-col overflow-hidden border-r border-[#e8ebf0] bg-[#f7f8fa] lg:flex">
        <div className="shrink-0 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83]">
            Partner setup
          </p>
          <p className="mt-1 font-display text-[1.25rem] font-bold tracking-tight text-[#17191d]">
            Get ready to host
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8ebf0]"
            role="progressbar"
            aria-valuenow={phaseIndex + 1}
            aria-valuemin={1}
            aria-valuemax={UNIFIED_SETUP_SCREENS.length}
            aria-label="Setup progress"
          >
            <div
              className="h-full rounded-full bg-[#073b83] transition-[width] duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] tabular-nums text-[#71717a]">
            Step {phaseIndex + 1} of {UNIFIED_SETUP_SCREENS.length}
          </p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Setup steps">
          <ol className="space-y-1">
            {UNIFIED_SETUP_SCREENS.map((item, index) => {
              const current = item.id === phase;
              const done = phaseDone(item.id, progress);
              const chip =
                item.id === 'business' || item.id === 'documents'
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
                      'lux-flat flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors',
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
                        current
                          ? 'bg-[#073b83] text-white'
                          : done
                            ? 'bg-[#073b83] text-white'
                            : 'border border-[#d0d5dd] bg-white text-[#71717a]',
                      ].join(' ')}
                    >
                      {done && !current ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {chip && (item.id === 'documents' || item.id === 'payout') ? (
                      <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
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
            className="lux-flat min-h-11 w-full rounded-lg px-3 text-left text-[13px] font-semibold text-[#5c6570] hover:bg-[#eef1f5] hover:text-[#17191d]"
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
            className="min-h-11 text-[13px] font-semibold text-[#17191d]"
            onClick={onSkip}
          >
            Exit
          </button>
          <p className="truncate text-[13px] font-semibold text-[#17191d]">{screen.title}</p>
          <p className="min-w-[3.5rem] text-right text-[11px] tabular-nums text-[#71717a]">
            {phaseIndex + 1}/{UNIFIED_SETUP_SCREENS.length}
          </p>
        </header>

        <div className="shrink-0 border-b border-[#e8ebf0] bg-white px-4 py-2.5 sm:px-5 lg:hidden">
          <div
            className="h-[3px] overflow-hidden rounded-full bg-[#e8ebf0]"
            role="progressbar"
            aria-valuenow={phaseIndex + 1}
            aria-valuemin={1}
            aria-valuemax={UNIFIED_SETUP_SCREENS.length}
            aria-label="Setup progress"
          >
            <div
              className="h-full rounded-full bg-[#073b83] transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {UNIFIED_SETUP_SCREENS.map((item) => {
              const current = item.id === phase;
              const done = phaseDone(item.id, progress);
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
            <div className="partner-unified-setup-status min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 [-webkit-overflow-scrolling:touch]">
              <div className="w-full max-w-[40rem]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83]">
                  Status
                </p>
                <h1 className="mt-1 inline-flex flex-wrap items-center gap-1.5 font-display text-[1.45rem] font-bold tracking-tight text-[#17191d]">
                  Where things stand
                  <PartnerHelpTip label="About setup status">{PARTNER_HELP.publishGate}</PartnerHelpTip>
                </h1>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#5c6570]">
                  {progress.nextHint}
                </p>

                {lanes ? (
                  <dl className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      ['Form progress', lanes.formProgress],
                      ['Traverion business', lanes.businessVerification],
                      ['Stripe verification', lanes.stripeVerification],
                      ['Payout readiness', lanes.payoutReadiness],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-3 rounded-[12px] border border-[#eef1f4] bg-white px-3.5 py-3"
                      >
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71717a]">
                          {label}
                        </dt>
                        <dd className="text-right text-[12px] font-semibold text-[#17191d]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                <button
                  type="button"
                  className="tv-btn-primary mt-5 h-11 w-full px-4 text-[13px] sm:w-auto"
                  onClick={() => {
                    if (progress.nextCta.toLowerCase().includes('listing')) {
                      onTours();
                      return;
                    }
                    if (progress.nextPhase === 'status') {
                      void refreshProfile();
                      return;
                    }
                    setPhaseAndUrl(progress.nextPhase);
                  }}
                >
                  {progress.nextCta}
                  <ArrowRight className="ml-1.5 inline-block h-4 w-4" aria-hidden />
                </button>

                {progress.publishReady ? (
                  <NoticeCallout className="mt-5" title="Ready to publish" tone="success">
                    {PARTNER_ONBOARDING_PUBLISH_READY_NOTE}
                  </NoticeCallout>
                ) : progress.businessDraftComplete && progress.payoutConfigured ? (
                  <NoticeCallout className="mt-5" title="Details on file" tone="info">
                    {PARTNER_ONBOARDING_CHECKLIST_DONE_NOTE}
                  </NoticeCallout>
                ) : null}

                {!hasListing ? (
                  <p className="mt-4 text-[12px] leading-relaxed text-[#5c6570]">
                    {PARTNER_FIRST_LISTING_STEP_NOTE}
                  </p>
                ) : (
                  <button
                    type="button"
                    className="lux-flat mt-4 min-h-10 text-[13px] font-semibold text-[#5c6570] hover:text-[#17191d]"
                    onClick={() => onDepartures?.() ?? onTours()}
                  >
                    Open calendar for departures
                  </button>
                )}

                <div className="mt-8 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="tv-btn-secondary h-10 px-3 text-[13px]"
                    onClick={() => setPhaseAndUrl('documents')}
                  >
                    Review company
                  </button>
                  <button
                    type="button"
                    className="tv-btn-secondary h-10 px-3 text-[13px]"
                    onClick={() => setPhaseAndUrl('payout')}
                  >
                    Review payouts
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
