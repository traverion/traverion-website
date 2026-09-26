import {
  TRAVELER_TEST_MODE_DETAIL,
  TRAVELER_TEST_MODE_LABEL,
  travelerShowsTestModeBanner,
} from '../lib/traveler-env-presentation';

type Props = {
  /** `bar` = full-width strip (legacy). `chip` = compact header indicator (preferred). */
  variant?: 'bar' | 'chip';
};

/**
 * Calm Test mode indicator when Stripe publishable key is TEST.
 * Prefer `chip` in the stable header so chrome height does not jump.
 */
export default function TravelerTestModeBanner({ variant = 'chip' }: Props) {
  if (!travelerShowsTestModeBanner()) return null;

  if (variant === 'chip') {
    return (
      <span
        className="inline-flex items-center rounded-full border border-finland/20 bg-finland/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-finland"
        title={TRAVELER_TEST_MODE_DETAIL}
        role="status"
      >
        {TRAVELER_TEST_MODE_LABEL}
      </span>
    );
  }

  return (
    <div
      className="border-b border-finland/15 bg-finland/[0.06] px-4 py-1.5 text-center sm:px-6"
      role="status"
    >
      <p className="text-[12px] leading-snug text-ink">
        <span className="font-semibold uppercase tracking-[0.12em] text-finland">{TRAVELER_TEST_MODE_LABEL}</span>
        <span className="mx-2 font-medium text-ink-faint" aria-hidden>
          ·
        </span>
        <span className="font-medium text-ink-muted">{TRAVELER_TEST_MODE_DETAIL}</span>
      </p>
    </div>
  );
}
