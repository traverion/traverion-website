import { ArrowRight, Check } from 'lucide-react';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import {
  PARTNER_ONBOARDING_INTRO_NOTE,
  PARTNER_ONBOARDING_PAYOUT_STEP_NOTE,
  PARTNER_FIRST_LISTING_STEP_NOTE,
  PARTNER_ONBOARDING_CHECKLIST_DONE_NOTE,
  PARTNER_ONBOARDING_PUBLISH_READY_NOTE,
} from '../../lib/booking-confirmation-copy';
import StatusChip from '../../components/StatusChip';
import NoticeCallout from '../../components/NoticeCallout';
import { PARTNER_HELP } from '../../lib/partnerHelpCopy';
import {
  partnerBusinessReviewState,
  partnerBusinessStatusChip,
  partnerPayoutReviewState,
  partnerPayoutStatusChip,
} from '../../lib/partnerVerificationStatus';
import PartnerHelpTip from '../../components/supplier/PartnerHelpTip';

type PartnerOnboardingProps = {
  onSkip: () => void;
  onBusiness: () => void;
  onPayout: () => void;
  onTours: () => void;
  businessDone: boolean;
  payoutDone: boolean;
  /** True when the partner already has at least one tour or stay draft/listing. */
  hasListing: boolean;
  /** Open Calendar for the first tour listing (departures / capacity). */
  onDepartures?: () => void;
  /** True when Traverion has verified both business and payout (publish gate). */
  publishReady: boolean;
  businessVerificationStatus?: string;
  businessVerificationSubmittedAt?: string;
  businessVerificationFeedback?: string;
  payoutVerificationStatus?: string;
  payoutVerificationSubmittedAt?: string;
};

export default function PartnerOnboarding({
  onSkip,
  onBusiness,
  onPayout,
  onTours,
  businessDone,
  payoutDone,
  hasListing,
  onDepartures,
  publishReady,
  businessVerificationStatus = '',
  businessVerificationSubmittedAt = '',
  businessVerificationFeedback = '',
  payoutVerificationStatus = '',
  payoutVerificationSubmittedAt = '',
}: PartnerOnboardingProps) {
  const businessReview = partnerBusinessReviewState({
    verificationStatus: businessVerificationStatus,
    submittedAt: businessVerificationSubmittedAt,
    draftComplete: businessDone,
    feedback: businessVerificationFeedback,
  });
  const payoutReview = partnerPayoutReviewState({
    verificationStatus: payoutVerificationStatus,
    submittedAt: payoutVerificationSubmittedAt,
    hasBankDetails: payoutDone,
  });
  const businessChip = partnerBusinessStatusChip(businessReview);
  const payoutChip = partnerPayoutStatusChip(payoutReview);
  const businessVerified = businessReview === 'verified';
  const payoutVerified = payoutReview === 'verified';
  const detailsOnFile = businessDone && payoutDone && hasListing;
  const needsVerificationAction =
    businessReview === 'rejected' || payoutReview === 'rejected';
  const awaitingVerification =
    !publishReady &&
    (businessReview === 'pending' ||
      payoutReview === 'pending' ||
      (detailsOnFile && !needsVerificationAction));

  const steps = [
    {
      n: '01',
      title: 'Business',
      body:
        businessReview === 'rejected'
          ? 'Traverion asked for updates. Replace documents if needed, then resubmit.'
          : businessReview === 'pending'
            ? 'Details are submitted and waiting for Traverion review — not verified yet.'
            : businessDone
              ? 'Company details are saved. Submit for review if you have not already.'
              : 'Your company details so travelers know who they book with.',
      done: businessVerified,
      action: onBusiness,
      cta:
        businessReview === 'pending'
          ? 'View status'
          : businessReview === 'rejected'
            ? 'Fix and resubmit'
            : businessDone
              ? 'Review'
              : 'Add details',
      statusChip: businessChip,
    },
    {
      n: '02',
      title: 'Payout',
      body: PARTNER_ONBOARDING_PAYOUT_STEP_NOTE,
      done: payoutVerified,
      action: onPayout,
      cta:
        payoutReview === 'rejected'
          ? 'Fix and resubmit'
          : payoutReview === 'pending'
            ? 'View status'
            : payoutDone
              ? 'Review'
              : 'Add payout',
      statusChip: payoutChip,
    },
    {
      n: '03',
      title: 'First listing',
      body: PARTNER_FIRST_LISTING_STEP_NOTE,
      done: hasListing,
      action: onTours,
      cta: hasListing ? 'Open listings' : 'Create listing',
      statusChip: null as null | typeof businessChip,
    },
    {
      n: '04',
      title: 'Add departures',
      body: 'Add dates so travelers can book.',
      done: false,
      action: onDepartures ?? onTours,
      cta: 'Open calendar',
      statusChip: null as null | typeof businessChip,
      optionalUntilListing: true,
    },
  ];

  const visibleSteps = steps.filter((s) => !('optionalUntilListing' in s && s.optionalUntilListing) || hasListing);

  const requiredSteps = visibleSteps.filter((s) => !('optionalUntilListing' in s && s.optionalUntilListing));
  const completed = requiredSteps.filter((s) => s.done).length;
  const nextIncomplete = visibleSteps.find((s) => !s.done && !('optionalUntilListing' in s && s.optionalUntilListing));
  const checklistComplete = completed === requiredSteps.length && requiredSteps.length > 0;
  const showSetupBanner = checklistComplete || detailsOnFile || needsVerificationAction || awaitingVerification;

  return (
    <div className="max-w-2xl mx-auto px-1 sm:px-0 py-5 sm:py-8">
      <header className="mb-4 rounded-lg border border-black/[0.06] bg-paper px-3.5 py-3">
        <h1 className="inline-flex flex-wrap items-center gap-1.5 font-display text-xl sm:text-2xl text-ink tracking-tight">
          Finish setup
          <PartnerHelpTip label="About setup">{PARTNER_HELP.publishGate}</PartnerHelpTip>
        </h1>
        <p className="mt-1 text-xs text-ink-muted leading-snug max-w-lg">{PARTNER_ONBOARDING_INTRO_NOTE}</p>
      </header>

      <div className="mb-4 rounded-lg border border-finland/15 bg-finland/[0.04] px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <p className="text-sm font-semibold text-ink">
            {publishReady
              ? 'Ready to publish'
              : needsVerificationAction
                ? 'Action required'
                : awaitingVerification
                  ? 'Details saved — verification pending'
                  : `${completed} of ${requiredSteps.length} verified`}
          </p>
          <StatusChip
            tone={
              publishReady ? 'good' : needsVerificationAction ? 'bad' : awaitingVerification ? 'warn' : 'neutral'
            }
          >
            {publishReady
              ? 'Verified'
              : needsVerificationAction
                ? 'Action required'
                : awaitingVerification
                  ? 'Under review'
                  : 'Incomplete'}
          </StatusChip>
        </div>
        <div
          className="h-1.5 rounded-full bg-finland/15 overflow-hidden"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={requiredSteps.length}
          aria-label="Onboarding verification progress"
        >
          <div
            className="h-full rounded-full bg-finland transition-[width] duration-300 ease-out"
            style={{
              width: `${requiredSteps.length ? (completed / requiredSteps.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {showSetupBanner ? (
        <div className="mb-6 space-y-3">
          <NoticeCallout
            title={
              publishReady
                ? 'Verified'
                : needsVerificationAction
                  ? 'Action required'
                  : awaitingVerification
                    ? 'Saved — not verified yet'
                    : 'Finish setup'
            }
            tone={
              publishReady ? 'success' : needsVerificationAction ? 'warn' : awaitingVerification ? 'info' : 'info'
            }
          >
            {publishReady
              ? PARTNER_ONBOARDING_PUBLISH_READY_NOTE
              : needsVerificationAction
                ? businessVerificationFeedback.trim()
                  ? businessVerificationFeedback.trim()
                  : 'Update the items Traverion flagged, then submit again. Saved details are not the same as verified status.'
                : PARTNER_ONBOARDING_CHECKLIST_DONE_NOTE}
            {!publishReady ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusChip tone={businessChip.tone}>{businessChip.label}</StatusChip>
                <StatusChip tone={payoutChip.tone}>{payoutChip.label}</StatusChip>
              </div>
            ) : null}
          </NoticeCallout>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onTours}
              className="tv-btn-primary inline-flex items-center gap-1.5"
            >
              {hasListing ? 'Open listings' : 'Create listing'} <ArrowRight className="w-4 h-4" aria-hidden />
            </button>
            {!publishReady ? (
              <button
                type="button"
                onClick={
                  payoutReview === 'rejected' && businessReview !== 'rejected' ? onPayout : onBusiness
                }
                className="tv-btn-secondary inline-flex items-center gap-1.5"
              >
                {needsVerificationAction ? 'Fix and resubmit' : 'View status'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ol className="space-y-2">
        {visibleSteps.map((s) => {
          const isNext =
            ('optionalUntilListing' in s && s.optionalUntilListing && hasListing && checklistComplete)
              ? s.n === '04'
              : nextIncomplete?.n === s.n;
          return (
            <li
              key={s.n}
              className={`rounded-lg border px-3 py-2.5 transition-colors ${
                s.done
                  ? 'border-emerald-200/80 bg-emerald-50/50'
                  : isNext
                    ? 'border-finland/40 bg-paper ring-1 ring-finland/25'
                    : 'border-black/[0.06] bg-paper'
              }`}
            >
              <div className="flex gap-2.5 items-start">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${
                    s.done
                      ? 'bg-emerald-600 text-white'
                      : isNext
                        ? 'bg-finland text-white'
                        : 'bg-black/[0.04] text-ink-muted'
                  }`}
                  aria-hidden
                >
                  {s.done ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : s.n}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <h2 className="text-sm font-semibold text-ink">{s.title}</h2>
                    {s.statusChip ? (
                      <StatusChip tone={s.statusChip.tone}>{s.statusChip.label}</StatusChip>
                    ) : (
                      <StatusChip tone={s.done ? 'good' : isNext ? 'warn' : 'neutral'}>
                        {s.done ? 'Done' : isNext ? 'Up next' : 'To do'}
                      </StatusChip>
                    )}
                  </div>
                  <p className="text-sm text-ink-muted mb-2.5 leading-snug">{s.body}</p>
                  <button
                    type="button"
                    onClick={s.action}
                    className={
                      isNext && !s.done
                        ? 'tv-btn-primary inline-flex items-center gap-1.5'
                        : 'lux-flat inline-flex items-center gap-1.5 text-sm font-semibold text-finland'
                    }
                  >
                    {s.cta} <ArrowRight className="w-4 h-4" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={() => {
          onSkip();
          navigateSupplierUrl(PARTNER_APP_BASE);
        }}
        className="lux-flat mt-6 text-sm text-ink-muted hover:text-ink"
      >
        Continue to Today
      </button>
    </div>
  );
}
