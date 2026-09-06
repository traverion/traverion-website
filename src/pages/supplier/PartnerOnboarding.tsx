import { ArrowRight } from 'lucide-react';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';

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
      body: 'Where Traverion sends money after a booking is confirmed.',
      done: payoutDone,
      action: onPayout,
      cta: payoutDone ? 'Review' : 'Add payout',
    },
    {
      n: '03',
      title: 'First tour',
      body: 'Photos, price, meeting point, then publish when you are ready.',
      done: hasTour,
      action: onTours,
      cta: hasTour ? 'Open tours' : 'Create a tour',
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-1 sm:px-0 py-8 sm:py-14">
      <p className="text-xs uppercase tracking-[0.2em] text-ink-muted mb-3">Welcome</p>
      <h1 className="font-display text-4xl sm:text-5xl text-ink mb-4">Set up your tours.</h1>
      <p className="text-ink-muted text-base leading-relaxed mb-10 max-w-lg">
        Three things, then you are live. You can skip and come back — nothing is published until you choose.
      </p>
      <ol className="space-y-6">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-5 items-start">
            <span className="font-display text-2xl text-ink-faint w-10 shrink-0">{s.n}</span>
            <div className="flex-1 min-w-0 pb-6 border-b border-black/[0.06]">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-sans text-lg font-semibold text-ink">{s.title}</h2>
                {s.done ? <span className="text-xs text-emerald-700">Done</span> : null}
              </div>
              <p className="text-sm text-ink-muted mb-3">{s.body}</p>
              <button
                type="button"
                onClick={s.action}
                className="lux-flat inline-flex items-center gap-1.5 text-sm font-semibold text-finland"
              >
                {s.cta} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
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
