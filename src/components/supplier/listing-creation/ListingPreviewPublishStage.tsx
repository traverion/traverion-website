import type { ReactNode } from 'react';
import { Check, ChevronRight, MapPin, X } from 'lucide-react';
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

function SectionHeading({
  index,
  id,
  children,
}: {
  index: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <h5
      id={id}
      className="flex items-baseline gap-2.5 font-display text-[1.2rem] font-semibold tracking-tight text-[#17191D] sm:text-[1.3rem]"
    >
      <span className="listing-preview-publish__section-num text-[12px] font-semibold" aria-hidden>
        {index}
      </span>
      <span>{children}</span>
    </h5>
  );
}

/**
 * Final creation step: traveler-facing preview + publishing readiness.
 * Desktop: ~70% preview · ~30% sticky readiness. Mobile: stacked.
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
  const gallerySlots = Array.from({ length: 4 }, (_, i) => gallery[i] ?? null);
  const moreCount = Math.max(0, photos.length - 5);
  const kindLabel = isStay ? 'Stay' : reviewProductKindLabel(experienceKind);
  const readyCount = reviewRows.filter((r) => r.ready).length;
  const allReady = reviewRows.length > 0 && readyCount === reviewRows.length;
  const spoken =
    [languageLabel.trim(), ...additionalLanguages.map((s) => s.trim()).filter(Boolean)]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);

  const durationLabel =
    !isStay && options[0]?.option.duration.trim()
      ? options.length === 1
        ? options[0].option.duration.trim()
        : 'See options below'
      : null;

  let sectionIdx = 0;
  const nextSection = () => {
    sectionIdx += 1;
    return String(sectionIdx).padStart(2, '0');
  };

  const overviewNum = description.trim() ? nextSection() : null;
  const highlightsNum = highlights.length > 0 ? nextSection() : null;
  const includesNum = includes.length > 0 || excludes.length > 0 ? nextSection() : null;
  const importantNum = nextSection();
  const optionsNum = !isStay ? nextSection() : null;

  return (
    <div id="supplier-listing-field-review" className="listing-preview-publish w-full">
      <header className="mb-6 max-w-3xl sm:mb-8">
        <h3 className="font-display text-[1.6rem] font-bold tracking-tight text-[#17191D] sm:text-[1.85rem]">
          Preview & Publish
        </h3>
        <p className="mt-2 text-[14px] leading-relaxed text-[#69717D]">
          How travelers will see this listing — then confirm readiness and publish.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(16.5rem,20rem)] lg:items-start xl:gap-12">
        {/* —— Traveler preview —— */}
        <div className="min-w-0 space-y-10 sm:space-y-12">
          {/* Hero */}
          <section aria-label="Product photos and title">
            {hasCover ? (
              <div className="grid gap-2 sm:gap-2.5 lg:grid-cols-4 lg:grid-rows-2 lg:min-h-[28rem]">
                <div className="relative overflow-hidden rounded-2xl bg-[#F5F6F8] lg:col-span-2 lg:row-span-2">
                  <img
                    src={cover}
                    alt=""
                    className="aspect-[4/3] h-full w-full object-cover lg:absolute lg:inset-0 lg:aspect-auto motion-safe:transition-transform motion-safe:duration-500 lg:hover:scale-[1.02]"
                  />
                </div>
                {gallerySlots.map((url, i) =>
                  url ? (
                    <div
                      key={url.slice(-40)}
                      className="relative hidden overflow-hidden rounded-xl bg-[#F5F6F8] aspect-[4/3] lg:block"
                    >
                      <img
                        src={url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 hover:scale-[1.03]"
                      />
                      {i === 3 && moreCount > 0 ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-[#17191D]/45 text-[13px] font-semibold text-white">
                          +{moreCount} more
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      key={`slot-${i}`}
                      className="relative hidden overflow-hidden rounded-xl bg-[#FAFAFB] ring-1 ring-inset ring-[#E7E9ED] aspect-[4/3] lg:block"
                      aria-hidden
                    />
                  )
                )}
                {photos.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto pb-0.5 lg:hidden -mx-0.5 px-0.5 snap-x">
                    {photos.slice(1, 6).map((url) => (
                      <img
                        key={url.slice(-36)}
                        src={url}
                        alt=""
                        className="h-20 w-[30%] shrink-0 snap-start rounded-xl object-cover sm:h-24"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-[#FAFAFB] ring-1 ring-[#E7E9ED] sm:aspect-[2.1/1]">
                <p className="px-4 text-center text-[13px] text-[#69717D]">
                  Add a cover photo to preview the traveler gallery
                </p>
              </div>
            )}

            {photos.length > 0 ? (
              <p className="mt-2.5 text-[12.5px] tabular-nums text-[#69717D]">
                {photos.length} photo{photos.length === 1 ? '' : 's'}
              </p>
            ) : null}

            <div className="mt-5 max-w-3xl sm:mt-6">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[#69717D]">
                {place ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                    {place}
                  </span>
                ) : (
                  <span>Location not set</span>
                )}
                <span className="text-[#E7E9ED]" aria-hidden>
                  ·
                </span>
                <span>{kindLabel}</span>
              </p>
              <h4 className="mt-2 font-display text-[1.55rem] font-semibold leading-[1.18] tracking-tight text-[#17191D] [overflow-wrap:anywhere] sm:text-[1.85rem]">
                {title.trim() || (isStay ? 'Untitled stay' : 'Untitled listing')}
              </h4>
              {subtitle.trim() ? (
                <p className="mt-2 text-[15px] leading-snug text-[#69717D] [overflow-wrap:anywhere]">
                  {subtitle.trim()}
                </p>
              ) : null}
              {startingPriceLabel ? (
                <p className="mt-4 text-[1.2rem] font-semibold tabular-nums tracking-tight text-[#17191D]">
                  {startingPriceLabel}
                </p>
              ) : (
                <p className="mt-4 text-[13px] text-[#69717D]">
                  {isStay
                    ? 'Nightly price appears when pricing is set'
                    : 'Starting price appears when bookable options have prices'}
                </p>
              )}
            </div>
          </section>

          {/* Overview */}
          {description.trim() && overviewNum ? (
            <section
              aria-labelledby="preview-overview-heading"
              className="max-w-3xl border-t border-[#E7E9ED] pt-10"
            >
              <SectionHeading index={overviewNum} id="preview-overview-heading">
                Overview
              </SectionHeading>
              <div className="mt-4 space-y-3.5 text-[15px] leading-[1.7] text-[#17191D] [overflow-wrap:anywhere]">
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
          {highlights.length > 0 && highlightsNum ? (
            <section
              aria-labelledby="preview-highlights-heading"
              className="max-w-3xl border-t border-[#E7E9ED] pt-10"
            >
              <SectionHeading index={highlightsNum} id="preview-highlights-heading">
                Experience highlights
              </SectionHeading>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3">
                {highlights.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[14.5px] leading-snug text-[#17191D]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(7,59,131,0.08)] text-[#073B83]">
                      <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    </span>
                    <span className="[overflow-wrap:anywhere]">{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Includes / excludes */}
          {(includes.length > 0 || excludes.length > 0) && includesNum ? (
            <section
              aria-label="Inclusions and exclusions"
              className="grid max-w-3xl gap-8 border-t border-[#E7E9ED] pt-10 sm:grid-cols-2 sm:gap-10"
            >
              <div className="sm:col-span-2">
                <SectionHeading index={includesNum} id="preview-includes-heading">
                  What&apos;s included
                </SectionHeading>
              </div>
              {includes.length > 0 ? (
                <div>
                  <h6 className="text-[13px] font-semibold tracking-tight text-[#17191D]">Included</h6>
                  <ul className="mt-3 space-y-2 text-[14.5px] leading-snug text-[#17191D]">
                    {includes.map((line) => (
                      <li key={line} className="flex gap-2.5">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#073B83]"
                          strokeWidth={2.25}
                          aria-hidden
                        />
                        <span className="[overflow-wrap:anywhere]">{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {excludes.length > 0 ? (
                <div>
                  <h6 className="text-[13px] font-semibold tracking-tight text-[#17191D]">Not included</h6>
                  <ul className="mt-3 space-y-2 text-[14.5px] leading-snug text-[#69717D]">
                    {excludes.map((line) => (
                      <li key={line} className="flex gap-2.5">
                        <X
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#8B929C]"
                          strokeWidth={2.25}
                          aria-hidden
                        />
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
            className="max-w-3xl border-t border-[#E7E9ED] pt-10"
          >
            <SectionHeading index={importantNum} id="preview-important-heading">
              Important information
            </SectionHeading>
            <dl className="mt-4 space-y-4">
              {spoken.length > 0 ? (
                <div className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-[12.5px] font-semibold text-[#69717D]">
                    Language{spoken.length === 1 ? '' : 's'}
                  </dt>
                  <dd className="text-[14.5px] text-[#17191D]">{spoken.join(', ')}</dd>
                </div>
              ) : null}
              {durationLabel ? (
                <div className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-[12.5px] font-semibold text-[#69717D]">Duration</dt>
                  <dd className="text-[14.5px] text-[#17191D]">{durationLabel}</dd>
                </div>
              ) : null}
              {knowBeforeYouGo.trim() ? (
                <div className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-[12.5px] font-semibold text-[#69717D]">Know before you go</dt>
                  <dd className="text-[14.5px] leading-relaxed text-[#17191D] [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {knowBeforeYouGo.trim()}
                  </dd>
                </div>
              ) : null}
              {whatToBring.trim() ? (
                <div className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-[12.5px] font-semibold text-[#69717D]">What to bring</dt>
                  <dd className="text-[14.5px] leading-relaxed text-[#17191D] [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {whatToBring.trim()}
                  </dd>
                </div>
              ) : null}
              <div className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                <dt className="text-[12.5px] font-semibold text-[#69717D]">Cancellation</dt>
                <dd className="text-[14.5px] leading-relaxed text-[#69717D]">
                  {TRAVERION_STANDARD_CANCELLATION_POLICY}
                </dd>
              </div>
            </dl>
          </section>

          {/* Booking options */}
          {!isStay && optionsNum ? (
            <section
              aria-labelledby="preview-options-heading"
              className="border-t border-[#E7E9ED] pt-10"
            >
              <SectionHeading index={optionsNum} id="preview-options-heading">
                Booking options
              </SectionHeading>
              {options.length === 0 ? (
                <p className="mt-3 text-[14px] text-[#69717D]">No bookable options yet.</p>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {options.map(({ option, readiness }) => {
                    const card = tourOptionCardModel(option, formatAmount);
                    const pricing = card.rows.find((r) => r.id === 'pricing')?.text;
                    const meeting = card.rows.find((r) => r.id === 'meeting')?.text;
                    const duration = card.rows.find((r) => r.id === 'duration')?.text;
                    const configured = readiness === 'ready';
                    return (
                      <li
                        key={option.id}
                        className="rounded-lg border border-[#E7E9ED] bg-white px-4 py-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 text-[14.5px] font-semibold tracking-tight text-[#17191D] [overflow-wrap:anywhere]">
                            {option.name.trim() || 'Untitled option'}
                          </p>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] ${
                              configured
                                ? 'bg-[#F5F6F8] text-[#69717D]'
                                : 'bg-amber-50 text-amber-900'
                            }`}
                          >
                            {configured ? 'Ready' : 'Incomplete'}
                          </span>
                        </div>
                        <p className="mt-2 text-[13px] leading-snug text-[#69717D]">
                          {[duration, pricing].filter(Boolean).join(' · ')}
                        </p>
                        {meeting ? (
                          <p className="mt-1.5 text-[13px] leading-snug text-[#69717D] [overflow-wrap:anywhere]">
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
          <div className="rounded-lg border border-[#E7E9ED] bg-white">
            <div className="border-b border-[#E7E9ED] px-4 py-4">
              <p className="text-[12.5px] font-semibold text-[#69717D]">Publishing</p>
              <p className="mt-1 font-display text-[1.25rem] font-semibold tracking-tight text-[#17191D]">
                {isPublished
                  ? 'Live listing'
                  : truth.canPublish
                    ? 'Ready to publish'
                    : allReady
                      ? 'Almost there'
                      : 'Finish required steps'}
              </p>
              <p className="mt-1 text-[12.5px] leading-snug text-[#69717D] tabular-nums">
                {readyCount} of {reviewRows.length} stages complete
              </p>
              <div
                className="mt-3 h-1 overflow-hidden rounded-full bg-[#F5F6F8]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={reviewRows.length}
                aria-valuenow={readyCount}
                aria-label="Creation stages complete"
              >
                <div
                  className="h-full rounded-full bg-[#073B83] transition-[width] duration-300"
                  style={{
                    width: `${reviewRows.length ? (readyCount / reviewRows.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {truth.bannerTitle ? (
              <div className="border-b border-amber-200/80 bg-amber-50/70 px-4 py-3" role="status">
                <p className="text-[13px] font-semibold text-[#17191D]">{truth.bannerTitle}</p>
                {truth.bannerBody ? (
                  <p className="mt-1 text-[12.5px] leading-snug text-[#69717D]">{truth.bannerBody}</p>
                ) : null}
                <a
                  href={settingsHref}
                  className="mt-2 inline-flex min-h-9 items-center text-[13px] font-semibold text-[#073B83] hover:underline"
                >
                  Go to Settings
                </a>
              </div>
            ) : null}

            <ul className="divide-y divide-[#E7E9ED]">
              {reviewRows.map((row) => (
                <li key={row.label} className="flex items-start gap-2.5 px-4 py-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      row.ready
                        ? 'bg-[#073B83] text-white'
                        : 'bg-[#F5F6F8] text-[#8B929C] ring-1 ring-[#E7E9ED]'
                    }`}
                    aria-hidden
                  >
                    {row.ready ? <Check className="h-3 w-3" strokeWidth={2.75} /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-[#17191D]">{row.label}</p>
                      <button
                        type="button"
                        onClick={() => onEditStep(row.step)}
                        className="lux-flat inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-[#073B83] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073B83]/30"
                      >
                        {row.ready ? 'Edit' : 'Fix'}
                        <ChevronRight className="h-3 w-3 opacity-70" aria-hidden />
                      </button>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-[#69717D] [overflow-wrap:anywhere]">
                      {row.ready ? row.summary : row.missing || row.summary}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-2 border-t border-[#E7E9ED] px-4 py-4">
              <p className="text-[13px] leading-snug text-[#17191D]">{truth.listingLine}</p>
              {truth.accountLine ? (
                <p className="text-[12.5px] leading-snug text-[#69717D]">{truth.accountLine}</p>
              ) : null}
              <p className="text-[12px] leading-snug text-[#69717D]">
                {isPublished
                  ? 'Save changes from the footer to update your live listing.'
                  : 'Publish makes this listing bookable on Traverion when verification allows. You can still edit after it goes live.'}
              </p>
              {liveListingHref ? (
                <a
                  href={liveListingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center text-[13px] font-semibold text-[#073B83] hover:underline"
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
