import { ArrowRight, Check } from 'lucide-react';
import { useMemo } from 'react';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import {
  PARTNER_FIRST_LISTING_STEP_NOTE,
  PARTNER_ONBOARDING_CHECKLIST_DONE_NOTE,
  PARTNER_ONBOARDING_INTRO_NOTE,
  PARTNER_ONBOARDING_PUBLISH_READY_NOTE,
} from '../../lib/booking-confirmation-copy';
import {
  derivePartnerSetupProgress,
  readinessCopyFromProfile,
  UNIFIED_SETUP_SCREENS,
  type UnifiedSetupPhaseId,
} from '../../lib/partner-unified-setup';
import { PARTNER_HELP } from '../../lib/partnerHelpCopy';
import {
  partnerBusinessStatusChip,
  partnerPayoutStatusChip,
} from '../../lib/partnerVerificationStatus';
import type { SupplierProfileRow } from '../../data/supabase-supplier-profile';
import StatusChip from '../../components/StatusChip';
import NoticeCallout from '../../components/NoticeCallout';
import PartnerHelpTip from '../../components/supplier/PartnerHelpTip';

type PartnerOnboardingProps = {
  profile: SupplierProfileRow | null;
  onSkip: () => void;
  onContinuePhase: (phase: UnifiedSetupPhaseId) => void;
  onTours: () => void;
  hasListing: boolean;
  onDepartures?: () => void;
};

export default function PartnerOnboarding({
  profile,
  onSkip,
  onContinuePhase,
  onTours,
  hasListing,
  onDepartures,
}: PartnerOnboardingProps) {
  const { user } = useSupplierAuth();
  const userId = user?.id ?? '';
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

  const businessChip = partnerBusinessStatusChip(progress.businessReview);
  const payoutChip = partnerPayoutStatusChip(progress.payoutReview);

  const phases = UNIFIED_SETUP_SCREENS.map((screen, index) => {
    let done = false;
    let cta = 'Continue';
    let body = screen.lede;
    let chip: ReturnType<typeof partnerBusinessStatusChip> | null = null;

    if (screen.id === 'business') {
      done =
        progress.businessReview === 'pending' ||
        progress.businessReview === 'verified' ||
        (progress.businessDraftComplete && progress.businessReview !== 'rejected');
      chip = businessChip;
      cta =
        progress.businessReview === 'rejected'
          ? 'Fix details'
          : progress.businessReview === 'pending' || progress.businessReview === 'verified'
            ? 'View company'
            : progress.businessDraftComplete
              ? 'Review company'
              : 'Add company details';
      body =
        progress.businessReview === 'rejected'
          ? 'Traverion asked for updates to your company details.'
          : progress.businessReview === 'pending'
            ? 'Company details are with Traverion for review.'
            : progress.businessDraftComplete || progress.businessReview === 'verified'
              ? 'Company details are saved and reused for payouts.'
              : screen.lede;
    } else if (screen.id === 'documents') {
      done =
        progress.businessReview === 'verified' ||
        (progress.businessDraftComplete && progress.businessReview === 'pending');
      chip = businessChip;
      cta =
        progress.businessReview === 'rejected'
          ? 'Replace document'
          : progress.businessReview === 'pending'
            ? 'View submission'
            : progress.businessDraftComplete
              ? 'Review documents'
              : 'Upload documents';
      body =
        progress.businessReview === 'pending'
          ? 'Registration proof is with Traverion for review.'
          : progress.businessReview === 'rejected'
            ? 'Upload an official registration extract, then resubmit.'
            : screen.lede;
    } else if (screen.id === 'representative') {
      done = progress.payoutConfigured || progress.bankingReady;
      cta = done ? 'Review representative' : 'Add representative';
      body = done
        ? 'Representative details are saved for payout setup.'
        : screen.lede;
    } else if (screen.id === 'payout') {
      done = progress.bankingReady || progress.payoutConfigured;
      chip = payoutChip;
      cta = done ? 'Review payouts' : 'Set up payouts';
      body = done
        ? 'Payout preferences are on file. Stripe verification is separate.'
        : screen.lede;
    } else {
      done = progress.publishReady;
      cta = hasListing ? 'Open listings' : 'Create listing';
      body = hasListing ? PARTNER_FIRST_LISTING_STEP_NOTE : screen.lede;
    }

    return {
      ...screen,
      n: String(index + 1).padStart(2, '0'),
      done,
      cta,
      body,
      chip,
      action: () => {
        if (screen.id === 'status') {
          if (hasListing) onTours();
          else onTours();
          return;
        }
        onContinuePhase(screen.id);
      },
    };
  });

  const required = phases.filter((p) => p.id !== 'status');
  const completed = required.filter((p) => p.done).length;
  const needsAction =
    progress.businessReview === 'rejected' || progress.payoutReview === 'rejected';

  return (
    <div className="partner-unified-setup mx-auto w-full max-w-[40rem] px-1 py-5 sm:px-0 sm:py-8">
      <header className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#073b83]">
          Partner setup
        </p>
        <h1 className="mt-1 inline-flex flex-wrap items-center gap-1.5 font-display text-[1.65rem] font-bold tracking-tight text-[#17191d] sm:text-[1.85rem]">
          Get ready to host
          <PartnerHelpTip label="About setup">{PARTNER_HELP.publishGate}</PartnerHelpTip>
        </h1>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-[#5c6570]">
          {PARTNER_ONBOARDING_INTRO_NOTE}
        </p>
      </header>

      <section className="mb-5 rounded-[14px] border border-[#e8ebf0] bg-[#fafbfc] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-[#17191d]">
              {progress.publishReady
                ? 'Ready to publish'
                : needsAction
                  ? 'Action required'
                  : progress.businessReview === 'pending' || progress.payoutConfigured
                    ? 'Setup in progress'
                    : 'Start setup'}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#5c6570]">{progress.nextHint}</p>
          </div>
          <StatusChip
            tone={
              progress.publishReady ? 'good' : needsAction ? 'bad' : 'warn'
            }
          >
            {progress.publishReady
              ? 'Ready'
              : needsAction
                ? 'Needs attention'
                : `${completed}/${required.length}`}
          </StatusChip>
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8ebf0]"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={required.length}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-[#073b83] transition-[width] duration-300 ease-out"
            style={{
              width: `${required.length ? (completed / required.length) * 100 : 0}%`,
            }}
          />
        </div>
        <button
          type="button"
          className="tv-btn-primary mt-4 h-11 w-full px-4 text-[13px] sm:w-auto"
          onClick={() => {
            if (progress.nextCta.toLowerCase().includes('listing')) {
              onTours();
              return;
            }
            onContinuePhase(progress.nextPhase);
          }}
        >
          {progress.nextCta}
          <ArrowRight className="ml-1.5 inline-block h-4 w-4" aria-hidden />
        </button>
      </section>

      {lanes ? (
        <dl className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              <dd className="text-right text-[12px] font-semibold text-[#17191d]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <ol className="space-y-2.5">
        {phases.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={step.action}
              className="group flex w-full items-start gap-3 rounded-[14px] border border-[#e8ebf0] bg-white px-3.5 py-3.5 text-left transition-colors hover:border-[#073b83]/35 hover:bg-[#f8fafc]"
            >
              <span
                className={[
                  'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold',
                  step.done
                    ? 'bg-[#073b83] text-white'
                    : 'border border-[#d0d5dd] bg-white text-[#5c6570]',
                ].join(' ')}
                aria-hidden
              >
                {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : step.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold tracking-tight text-[#17191d]">
                    {step.title}
                  </span>
                  {step.chip ? (
                    <StatusChip tone={step.chip.tone}>{step.chip.label}</StatusChip>
                  ) : null}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-[#5c6570]">
                  {step.body}
                </span>
                <span className="mt-2 inline-flex items-center text-[13px] font-semibold text-[#073b83] group-hover:text-[#052d65]">
                  {step.cta}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {hasListing ? (
        <div className="mt-4">
          <button
            type="button"
            className="lux-flat min-h-10 text-[13px] font-semibold text-[#5c6570] hover:text-[#17191d]"
            onClick={() => onDepartures?.() ?? onTours()}
          >
            Open calendar for departures
          </button>
        </div>
      ) : null}

      {progress.publishReady ? (
        <NoticeCallout className="mt-5" title="Ready to publish" tone="success">
          {PARTNER_ONBOARDING_PUBLISH_READY_NOTE}
        </NoticeCallout>
      ) : progress.businessDraftComplete && progress.payoutConfigured ? (
        <NoticeCallout className="mt-5" title="Details on file" tone="info">
          {PARTNER_ONBOARDING_CHECKLIST_DONE_NOTE}
        </NoticeCallout>
      ) : null}

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          className="lux-flat min-h-10 text-[13px] font-semibold text-[#71717a] hover:text-[#17191d]"
          onClick={onSkip}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
