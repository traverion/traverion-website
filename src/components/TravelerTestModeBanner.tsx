import {
  TRAVELER_TEST_MODE_DETAIL,
  TRAVELER_TEST_MODE_LABEL,
  travelerShowsTestModeBanner,
} from '../lib/traveler-env-presentation';

/**
 * Calm global indicator when Stripe publishable key is TEST.
 * Browse/marketing copy stays clean; payment surfaces keep explicit TEST CTAs.
 */
export default function TravelerTestModeBanner() {
  if (!travelerShowsTestModeBanner()) return null;

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
