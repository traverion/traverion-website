import { Check, ChevronRight, MapPin } from 'lucide-react';
import type { ListingBookingOption } from '../../../types/listingExtras';
import { TRAVERION_STANDARD_CANCELLATION_POLICY } from '../../../types/listingExtras';
import { tourOptionCardModel } from '../../../lib/listing-option-card';
import type { TourOptionReadiness } from '../../../lib/listing-option-scenes';
import { isPlaceholderListingImageUrl } from '../../../lib/listingPhotoGrid';
import { reviewProductKindLabel } from '../../../lib/listing-creation-review';

export type PreviewPublishReviewRow = {
  step: number;
  label: string;
  summary: string;
  ready: boolean;
  missing: string | null;
};

export type PreviewPublishTruth = {
  listingLine: string;
  accountLine: string | null;
  canPublish: boolean;
  bannerTitle: string | null;
  bannerBody: string | null;
};

type PreviewOption = {
  option: ListingBookingOption;
  readiness: TourOptionReadiness;
};

/**
 * Final creation step: traveler-facing preview + publishing readiness.
 * Desktop: ~2/3 preview · ~1/3 sticky readiness. Mobile: stacked.
 */
export function ListingPreviewPublishStage({
  isStay,
  title,
  subtitle,
  description,
  place,
  experienceKind,
  languageLabel,
  photos,
  startingPriceLabel,
  highlights,
  includes,
  excludes,
  options,
  formatAmount,
  knowBeforeYouGo,
  whatToBring,
  additionalLanguages,
  reviewRows,
  truth,
  settingsHref,
  liveListingHref,
  isPublished,
  onEditStep,
}: {
  isStay: boolean;
  title: string;
  subtitle: string;
  description: string;
  place: string;
  experienceKind: string;
  languageLabel: string;
  photos: string[];
  startingPriceLabel: string | null;
  highlights: string[];
  includes: string[];
  excludes: string[];
  options: PreviewOption[];
  formatAmount: (n: number) => string;
  knowBeforeYouGo: string;
  whatToBring: string;
  additionalLanguages: string[];
  reviewRows: PreviewPublishReviewRow[];
  truth: PreviewPublishTruth;
  settingsHref: string;
  liveListingHref: string | null;
  isPublished: boolean;
  onEditStep: (step: number) => void;
}) {
  const cover = photos[0] ?? '';
  const hasCover = Boolean(cover && !isPlaceholderListingImageUrl(cover));
  const gallery = photos.slice(1, 5);
  const moreCount = Math.max(0, photos.length - 5);
  const kindLabel = isStay ? 'Stay' : reviewProductKindLabel(experienceKind);
  const readyCount = reviewRows.filter((r) => r.ready).length;
  const allReady = reviewRows.length > 0 && readyCount === reviewRows.length;
  const spoken =
    [languageLabel.trim(), ...additionalLanguages.map((s) => s.trim()).filter(Boolean)]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div id="supplier-listing-field-review" className="listing-preview-publish w-full">
      <header className="mb-5 max-w-3xl sm:mb-6">
        <h3 className="font-display text-[1.55rem] font-bold tracking-tight text-ink sm:text-[1.75rem]">
          Preview & Publish
        </h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
          Review how travelers will see this listing, confirm every stage is ready, then publish when
          Traverion verification allows.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,21.5rem)] lg:items-start xl:gap-10">
        {/* —— Traveler preview —— */}
        <div className="min-w-0 space-y-8 sm:space-y-10">
          {/* Hero */}
          <section aria-label="Product photos and title">
            {hasCover ? (
              <div className="grid gap-2 sm:gap-2.5 lg:grid-cols-4 lg:grid-rows-2 lg:min-h-[22rem]">
                <div className="relative overflow-hidden rounded-[var(--partner-radius,0.5rem)] bg-black/[0.04] lg:col-span-2 lg:row-span-2">
                  <img
                    src={cover}
                    alt=""
                    className="aspect-[4/3] h-full w-full object-cover lg:absolute lg:inset-0 lg:aspect-auto"
                  />
                </div>
                {gallery.map((url, i) => (
                  <div
                    key={url.slice(-40)}
                    className="relative hidden overflow-hidden rounded-[var(--partner-radius-sm,0.375rem)] bg-black/[0.04] aspect-[4/3] lg:block"
                  >
                    <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    {i === 3 && moreCount > 0 ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-[13px] font-semibold text-white">
                        +{moreCount} more
                      </span>
                    ) : null}
                  </div>
                ))}
                {photos.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto pb-0.5 lg:hidden -mx-0.5 px-0.5">
                    {photos.slice(1, 6).map((url) => (
                      <img
                        key={url.slice(-36)}
                        src={url}
                        alt=""
                        className="h-16 w-[28%] shrink-0 rounded object-cover sm:h-20"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex aspect-[16/9] items-center justify-center rounded-[var(--partner-radius,0.5rem)] bg-black/[0.04] ring-1 ring-black/[0.06] sm:aspect-[2.1/1]">
                <p className="px-4 text-center text-[13px] text-ink-muted">
                  Add a cover photo to preview the traveler gallery
                </p>
              </div>
            )}

            <div className="mt-4 max-w-3xl sm:mt-5">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-muted">
                {place ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                    {place}
                  </span>
                ) : (
                  <span>Location not set</span>
                )}
                <span className="text-ink-faint" aria-hidden>
                  ·
                </span>
                <span>{kindLabel}</span>
                {photos.length > 0 ? (
                  <>
                    <span className="text-ink-faint" aria-hidden>
                      ·
                    </span>
                    <span className="tabular-nums">
                      {photos.length} photo{photos.length === 1 ? '' : 's'}
                    </span>
                  </>
                ) : null}
              </p>
              <h4 className="mt-1.5 font-display text-[1.45rem] font-semibold leading-[1.2] tracking-tight text-ink [overflow-wrap:anywhere] sm:text-[1.65rem]">
                {title.trim() || (isStay ? 'Untitled stay' : 'Untitled listing')}
              </h4>
              {subtitle.trim() ? (
                <p className="mt-1.5 text-[15px] leading-snug text-ink-muted [overflow-wrap:anywhere]">
                  {subtitle.trim()}
                </p>
              ) : null}
              {startingPriceLabel ? (
                <p className="mt-3 text-[1.05rem] font-semibold tabular-nums tracking-tight text-ink">
                  {startingPriceLabel}
                </p>
              ) : (
                <p className="mt-3 text-[13px] text-ink-muted">
                  {isStay
                    ? 'Nightly price appears when pricing is set'
                    : 'Starting price appears when bookable options have prices'}
                </p>
              )}
            </div>
          </section>

          {/* Overview */}
          {description.trim() ? (
            <section aria-labelledby="preview-overview-heading" className="max-w-3xl">
              <h5
                id="preview-overview-heading"
                className="font-display text-[1.15rem] font-semibold tracking-tight text-ink"
              >
                Overview
              </h5>
              <div className="mt-2.5 space-y-3 text-[14.5px] leading-[1.65] text-ink [overflow-wrap:anywhere]">
                {description
                  .trim()
                  .split(/\n{2,}/)
                  .map((para) => (
                    <p key={para.slice(0, 48)}>{para.trim()}</p>
                  ))}
              </div>
            </section>
          ) : null}

          {/* Highlights */}
          {highlights.length > 0 ? (
            <section aria-labelledby="preview-highlights-heading" className="max-w-3xl">
              <h5
                id="preview-highlights-heading"
                className="font-display text-[1.15rem] font-semibold tracking-tight text-ink"
              >
                Highlights
              </h5>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {highlights.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[14px] leading-snug text-ink">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-finland/[0.08] text-finland">
                      <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    </span>
                    <span className="[overflow-wrap:anywhere]">{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Includes / excludes */}
          {(includes.length > 0 || excludes.length > 0) ? (
            <section
              aria-label="Inclusions and exclusions"
              className="grid max-w-3xl gap-6 border-t border-black/[0.06] pt-8 sm:grid-cols-2 sm:gap-8"
            >
              {includes.length > 0 ? (
                <div>
                  <h5 className="text-[13px] font-semibold tracking-tight text-ink">What&apos;s included</h5>
                  <ul className="mt-2.5 space-y-1.5 text-[14px] leading-snug text-ink">
                    {includes.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink/40" aria-hidden />
                        <span className="[overflow-wrap:anywhere]">{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {excludes.length > 0 ? (
                <div>
                  <h5 className="text-[13px] font-semibold tracking-tight text-ink">Not included</h5>
                  <ul className="mt-2.5 space-y-1.5 text-[14px] leading-snug text-ink-muted">
                    {excludes.map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                        <span className="[overflow-wrap:anywhere]">{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Important information */}
          <section
            aria-labelledby="preview-important-heading"
            className="max-w-3xl border-t border-black/[0.06] pt-8"
          >
            <h5
              id="preview-important-heading"
              className="font-display text-[1.15rem] font-semibold tracking-tight text-ink"
            >
              Good to know
            </h5>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {spoken.length > 0 ? (
                <div className="rounded-[var(--partner-radius-sm,0.375rem)] bg-black/[0.025] px-3 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
                    Language{spoken.length === 1 ? '' : 's'}
                  </dt>
                  <dd className="mt-0.5 text-[13.5px] text-ink">{spoken.join(', ')}</dd>
                </div>
              ) : null}
              {place ? (
                <div className="rounded-[var(--partner-radius-sm,0.375rem)] bg-black/[0.025] px-3 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
                    Destination
                  </dt>
                  <dd className="mt-0.5 text-[13.5px] text-ink">{place}</dd>
                </div>
              ) : null}
              {!isStay && options[0]?.option.duration.trim() ? (
                <div className="rounded-[var(--partner-radius-sm,0.375rem)] bg-black/[0.025] px-3 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
                    Duration
                  </dt>
                  <dd className="mt-0.5 text-[13.5px] text-ink">
                    {options.length === 1
                      ? options[0].option.duration.trim()
                      : 'See options below'}
                  </dd>
                </div>
              ) : null}
            </dl>
            {knowBeforeYouGo.trim() ? (
              <div className="mt-4">
                <p className="text-[12px] font-semibold text-ink">Know before you go</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {knowBeforeYouGo.trim()}
                </p>
              </div>
            ) : null}
            {whatToBring.trim() ? (
              <div className="mt-3">
                <p className="text-[12px] font-semibold text-ink">What to bring</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {whatToBring.trim()}
                </p>
              </div>
            ) : null}
            <div className="mt-4">
              <p className="text-[12px] font-semibold text-ink">Cancellation</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
                {TRAVERION_STANDARD_CANCELLATION_POLICY}
              </p>
            </div>
          </section>

          {/* Booking options */}
          {!isStay ? (
            <section
              aria-labelledby="preview-options-heading"
              className="border-t border-black/[0.06] pt-8"
            >
              <h5
                id="preview-options-heading"
                className="font-display text-[1.15rem] font-semibold tracking-tight text-ink"
              >
                Booking options
              </h5>
              {options.length === 0 ? (
                <p className="mt-2 text-[13.5px] text-ink-muted">No bookable options yet.</p>
              ) : (
                <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {options.map(({ option, readiness }) => {
                    const card = tourOptionCardModel(option, formatAmount);
                    const pricing = card.rows.find((r) => r.id === 'pricing')?.text;
                    const meeting = card.rows.find((r) => r.id === 'meeting')?.text;
                    const duration = card.rows.find((r) => r.id === 'duration')?.text;
                    const configured = readiness === 'ready';
                    return (
                      <li
                        key={option.id}
                        className="rounded-[var(--partner-radius,0.5rem)] border border-black/[0.08] bg-paper px-3.5 py-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 text-[14px] font-semibold tracking-tight text-ink [overflow-wrap:anywhere]">
                            {option.name.trim() || 'Untitled option'}
                          </p>
                          <span
                            className={`shrink-0 text-[11px] font-medium ${
                              configured ? 'text-ink-muted' : 'text-amber-900'
                            }`}
                          >
                            {configured ? 'Configured' : 'Incomplete'}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-muted">
                          {[duration, pricing].filter(Boolean).join(' · ')}
                        </p>
                        {meeting ? (
                          <p className="mt-1 text-[12.5px] leading-snug text-ink-muted [overflow-wrap:anywhere]">
                            {meeting}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}
        </div>

        {/* —— Publishing readiness —— */}
        <aside className="min-w-0 lg:sticky lg:top-3">
          <div className="rounded-[var(--partner-radius,0.5rem)] border border-black/[0.09] bg-paper shadow-[0_1px_0_rgba(15,23,42,0.03)]">
            <div className="border-b border-black/[0.06] px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                Publishing
              </p>
              <p className="mt-1 font-display text-[1.2rem] font-semibold tracking-tight text-ink">
                {isPublished
                  ? 'Live listing'
                  : truth.canPublish
                    ? 'Ready to publish'
                    : allReady
                      ? 'Almost there'
                      : 'Finish required steps'}
              </p>
              <p className="mt-1 text-[12.5px] leading-snug text-ink-muted tabular-nums">
                {readyCount} of {reviewRows.length} stages complete
              </p>
              <div
                className="mt-3 h-1 overflow-hidden rounded-full bg-black/[0.06]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={reviewRows.length}
                aria-valuenow={readyCount}
                aria-label="Creation stages complete"
              >
                <div
                  className="h-full rounded-full bg-finland transition-[width] duration-300"
                  style={{
                    width: `${reviewRows.length ? (readyCount / reviewRows.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {truth.bannerTitle ? (
              <div className="border-b border-amber-200/70 bg-amber-50/60 px-4 py-3" role="status">
                <p className="text-[13px] font-semibold text-ink">{truth.bannerTitle}</p>
                {truth.bannerBody ? (
                  <p className="mt-1 text-[12.5px] leading-snug text-ink-muted">{truth.bannerBody}</p>
                ) : null}
                <a
                  href={settingsHref}
                  className="mt-2 inline-flex min-h-9 items-center text-[13px] font-semibold text-finland hover:underline"
                >
                  Go to Settings
                </a>
              </div>
            ) : null}

            <ul className="divide-y divide-black/[0.06]">
              {reviewRows.map((row) => (
                <li key={row.label} className="flex items-start gap-2.5 px-4 py-2.5">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      row.ready
                        ? 'bg-finland text-white'
                        : 'bg-black/[0.04] text-ink-faint ring-1 ring-black/10'
                    }`}
                    aria-hidden
                  >
                    {row.ready ? <Check className="h-3 w-3" strokeWidth={2.75} /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-ink">{row.label}</p>
                      <button
                        type="button"
                        onClick={() => onEditStep(row.step)}
                        className="lux-flat inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-finland hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/30"
                      >
                        {row.ready ? 'Edit' : 'Fix'}
                        <ChevronRight className="h-3 w-3 opacity-70" aria-hidden />
                      </button>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-ink-muted [overflow-wrap:anywhere]">
                      {row.ready ? row.summary : row.missing || row.summary}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-black/[0.06] px-4 py-3.5 space-y-2">
              <p className="text-[13px] leading-snug text-ink">{truth.listingLine}</p>
              {truth.accountLine ? (
                <p className="text-[12.5px] leading-snug text-ink-muted">{truth.accountLine}</p>
              ) : null}
              <p className="text-[12px] leading-snug text-ink-muted">
                {isPublished
                  ? 'Save changes from the footer to update your live listing.'
                  : 'Publish makes this listing bookable on Traverion when verification allows. You can still edit after it goes live.'}
              </p>
              {liveListingHref ? (
                <a
                  href={liveListingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center text-[13px] font-semibold text-finland hover:underline"
                >
                  View live listing
                </a>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
