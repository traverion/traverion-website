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

type PartnerOnboardingProps = {
  onSkip: () => void;
  onBusiness: () => void;
  onPayout: () => void;
  onTours: () => void;
  businessDone: boolean;
  payoutDone: boolean;
  /** True when the partner already has at least one tour or stay draft/listing. */
  hasListing: boolean;
  /** True when Traverion has verified both business and payout (publish gate). */
  publishReady: boolean;
};

export default function PartnerOnboarding({
  onSkip,
  onBusiness,
  onPayout,
  onTours,
  businessDone,
  payoutDone,
  hasListing,
  publishReady,
}: PartnerOnboardingProps) {
  const steps = [
    {
      n: '01',
      title: 'Business',
      body: 'Your company details so travelers know who they book with.',
      done: businessDone,
      action: onBusiness,
      cta: businessDone ? 'Review' : 'Add details',
    },
    {
      n: '02',
      title: 'Payout',
      body: PARTNER_ONBOARDING_PAYOUT_STEP_NOTE,
      done: payoutDone,
      action: onPayout,
      cta: payoutDone ? 'Review' : 'Add payout',
    },
    {
      n: '03',
      title: 'First listing',
      body: PARTNER_FIRST_LISTING_STEP_NOTE,
      done: hasListing,
      action: onTours,
      cta: hasListing ? 'Open listings' : 'Create listing',
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const nextIncomplete = steps.find((s) => !s.done);
  const checklistComplete = completed === steps.length;

  return (
    <div className="max-w-2xl mx-auto px-1 sm:px-0 py-5 sm:py-8">
      <header className="mb-4 rounded-lg border border-black/[0.06] bg-paper px-3.5 py-3">
        <h1 className="font-display text-xl sm:text-2xl text-ink tracking-tight">Set up your operation</h1>
        <p className="mt-1 text-xs text-ink-muted leading-snug max-w-lg">{PARTNER_ONBOARDING_INTRO_NOTE}</p>
      </header>

      <div className="mb-4 rounded-lg border border-finland/15 bg-finland/[0.04] px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <p className="text-sm font-semibold text-ink">
            {checklistComplete
              ? publishReady
                ? 'Checklist complete — publish unlocked'
                : 'Checklist complete — verification pending'
              : `${completed} of ${steps.length} steps done`}
          </p>
          <StatusChip tone={checklistComplete && publishReady ? 'good' : checklistComplete ? 'warn' : 'neutral'}>
            {checklistComplete && publishReady ? 'Can publish' : checklistComplete ? 'Awaiting review' : 'In progress'}
          </StatusChip>
        </div>
        <div
          className="h-1.5 rounded-full bg-finland/15 overflow-hidden"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full rounded-full bg-finland transition-[width] duration-300 ease-out"
            style={{ width: `${(completed / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {checklistComplete ? (
        <div className="mb-6 space-y-3">
          <NoticeCallout
            title={publishReady ? 'Publish is unlocked' : 'Still waiting on Traverion'}
            tone={publishReady ? 'success' : 'info'}
          >
            {publishReady ? PARTNER_ONBOARDING_PUBLISH_READY_NOTE : PARTNER_ONBOARDING_CHECKLIST_DONE_NOTE}
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
                onClick={onBusiness}
                className="tv-btn-secondary inline-flex items-center gap-1.5"
              >
                Check verification status
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ol className="space-y-2">
        {steps.map((s) => {
          const isNext = nextIncomplete?.n === s.n;
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
                    <StatusChip tone={s.done ? 'good' : isNext ? 'warn' : 'neutral'}>
                      {s.done ? 'Done' : isNext ? 'Up next' : 'To do'}
                    </StatusChip>
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
