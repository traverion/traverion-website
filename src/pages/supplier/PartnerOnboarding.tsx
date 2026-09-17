import { ArrowRight, Check } from 'lucide-react';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import {
  PARTNER_ONBOARDING_INTRO_NOTE,
  PARTNER_ONBOARDING_PAYOUT_STEP_NOTE,
  PARTNER_FIRST_LISTING_STEP_NOTE,
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
  hasTour: boolean;
};

export default function PartnerOnboarding({
  onSkip,
  onBusiness,
  onPayout,
  onTours,
  businessDone,
  payoutDone,
  hasTour,
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
      done: hasTour,
      action: onTours,
      cta: hasTour ? 'Open listings' : 'Create listing',
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const nextIncomplete = steps.find((s) => !s.done);

  return (
    <div className="max-w-2xl mx-auto px-1 sm:px-0 py-8 sm:py-14">
      <header className="mb-8 rounded-2xl bg-paper-raised p-5 sm:p-7 shadow-soft ring-1 ring-black/[0.06]">
        <div className="inline-flex items-center gap-2 rounded-full bg-finland/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-finland ring-1 ring-finland/15 mb-3">
          Welcome
        </div>
        <h1 className="font-display text-4xl sm:text-5xl text-ink mb-3 tracking-tight">Set up your operation.</h1>
        <p className="text-ink-muted text-base leading-relaxed max-w-lg">{PARTNER_ONBOARDING_INTRO_NOTE}</p>
      </header>

      <div className="mb-8 rounded-2xl bg-finland/8 px-4 py-3 ring-1 ring-finland/15">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-sm font-semibold text-ink">
            {completed === steps.length ? 'Setup complete' : `${completed} of ${steps.length} steps done`}
          </p>
          <StatusChip tone={completed === steps.length ? 'good' : 'neutral'}>
            {completed === steps.length ? 'Ready' : 'In progress'}
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

      {completed === steps.length ? (
        <div className="mb-8">
          <NoticeCallout title="You’re ready to run the day" tone="success">
            Business, payout, and at least one listing are in place. Jump into Today whenever you like.
          </NoticeCallout>
        </div>
      ) : null}

      <ol className="space-y-3">
        {steps.map((s) => {
          const isNext = nextIncomplete?.n === s.n;
          return (
            <li
              key={s.n}
              className={`rounded-2xl p-4 sm:p-5 shadow-soft ring-1 transition-colors ${
                s.done
                  ? 'bg-emerald-50/60 ring-emerald-200/50'
                  : isNext
                    ? 'bg-paper-raised ring-finland/25'
                    : 'bg-paper-raised ring-black/[0.06]'
              }`}
            >
              <div className="flex gap-4 items-start">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${
                    s.done
                      ? 'bg-emerald-600 text-white'
                      : isNext
                        ? 'bg-finland text-white'
                        : 'bg-black/[0.04] text-ink-muted'
                  }`}
                  aria-hidden
                >
                  {s.done ? <Check className="w-5 h-5" strokeWidth={2.5} /> : s.n}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="font-sans text-lg font-semibold text-ink">{s.title}</h2>
                    <StatusChip tone={s.done ? 'good' : isNext ? 'warn' : 'neutral'}>
                      {s.done ? 'Done' : isNext ? 'Up next' : 'To do'}
                    </StatusChip>
                  </div>
                  <p className="text-sm text-ink-muted mb-3 leading-relaxed">{s.body}</p>
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
        className="lux-flat mt-8 text-sm text-ink-muted hover:text-ink"
      >
        Continue to Today
      </button>
    </div>
  );
}
