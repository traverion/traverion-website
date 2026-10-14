import type { ReactNode } from 'react';
import { Check, ChevronRight, MapPin, X } from 'lucide-react';
import type { ListingBookingOption } from '../../../types/listingExtras';
import { TRAVERION_STANDARD_CANCELLATION_POLICY } from '../../../types/listingExtras';
import { tourOptionCardModel } from '../../../lib/listing-option-card';
import type { TourOptionReadiness } from '../../../lib/listing-option-scenes';
import { isPlaceholderListingImageUrl } from '../../../lib/listingPhotoGrid';
import { reviewProductKindLabel } from '../../../lib/listing-creation-review';
import {
  labelsForCatalogIds,
  SPOKEN_LANGUAGE_CATALOG,
} from '../../../lib/listing-information-catalogs';

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

function PreviewGallery({ photos }: { photos: string[] }) {
  const real = photos.filter((u) => u && !isPlaceholderListingImageUrl(u));
  if (real.length === 0) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-[#F5F6F8] ring-1 ring-[#E5E7EB] sm:aspect-[2.1/1]">
        <p className="px-4 text-center text-[13px] text-[#667085]">
          Add a cover photo to preview the traveler gallery
        </p>
      </div>
    );
  }

  const cover = real[0];
  const rest = real.slice(1);
  const moreCount = Math.max(0, real.length - 5);
  const sideCount = Math.min(4, rest.length);
  const side = rest.slice(0, sideCount);

  // Adaptive desktop mosaic — only render cells that have photos.
  let desktopGrid = 'grid gap-2 sm:gap-2.5';
  if (sideCount === 0) {
    desktopGrid += ' lg:grid-cols-1';
  } else if (sideCount === 1) {
    desktopGrid += ' lg:grid-cols-2';
  } else if (sideCount === 2) {
    desktopGrid += ' lg:grid-cols-3 lg:grid-rows-2 lg:min-h-[22rem]';
  } else {
    desktopGrid += ' lg:grid-cols-4 lg:grid-rows-2 lg:min-h-[28rem]';
  }

  const coverSpan =
    sideCount === 0
      ? ''
      : sideCount === 1
        ? 'lg:col-span-1'
        : sideCount === 2
          ? 'lg:col-span-2 lg:row-span-2'
          : 'lg:col-span-2 lg:row-span-2';

  return (
    <div>
      <div className={desktopGrid}>
        <div
          className={`relative overflow-hidden rounded-2xl bg-[#F5F6F8] ${coverSpan}`}
        >
          <img
            src={cover}
            alt=""
            className={`w-full object-cover ${
              sideCount === 0
                ? 'aspect-[16/10] max-h-[28rem]'
                : 'aspect-[4/3] h-full lg:absolute lg:inset-0 lg:aspect-auto'
            }`}
          />
        </div>
        {side.map((url, i) => (
          <div
            key={url.slice(-40)}
            className={`relative hidden overflow-hidden rounded-xl bg-[#F5F6F8] aspect-[4/3] lg:block ${
              sideCount === 2 ? 'lg:col-span-1' : ''
            }`}
          >
            <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            {i === sideCount - 1 && moreCount > 0 ? (
              <span className="absolute inset-0 flex items-center justify-center bg-[#17191D]/45 text-[13px] font-semibold text-white">
                +{moreCount} more
              </span>
            ) : null}
          </div>
        ))}
        {real.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-0.5 lg:hidden -mx-0.5 px-0.5 snap-x">
            {real.slice(1).map((url) => (
              <img
                key={url.slice(-36)}
                src={url}
                alt=""
                className="h-20 w-[42%] shrink-0 snap-start rounded-xl object-cover sm:h-24"
              />
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="text-[12.5px] tabular-nums text-[#667085]">
          {real.length} photo{real.length === 1 ? '' : 's'}
        </p>
        {real.length > 1 ? (
          <span className="text-[12.5px] font-semibold text-[#073B83]">View all photos</span>
        ) : null}
      </div>
    </div>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h5
      id={id}
      className="text-[1.05rem] font-semibold tracking-tight text-[#17191D] sm:text-[1.125rem]"
    >
      {children}
    </h5>
  );
}

/**
 * Final creation step: traveler-facing preview + compact publishing readiness.
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
  const kindLabel = isStay ? 'Stay' : reviewProductKindLabel(experienceKind);
  const readyCount = reviewRows.filter((r) => r.ready).length;
  const incomplete = reviewRows.filter((r) => !r.ready);
  const allReady = reviewRows.length > 0 && incomplete.length === 0;

  const spokenExtra = labelsForCatalogIds(additionalLanguages, SPOKEN_LANGUAGE_CATALOG);
  const spoken = [languageLabel.trim(), ...spokenExtra]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);

  const durationLabel =
    !isStay && options[0]?.option.duration.trim()
      ? options.length === 1
        ? options[0].option.duration.trim()
        : null
      : null;

  const meetingFromOptions = !isStay
    ? options
        .map(({ option }) => tourOptionCardModel(option, formatAmount).rows.find((r) => r.id === 'meeting'))
        .find((r) => r?.ok && r.text)?.text
    : null;

  return (
    <div id="supplier-listing-field-review" className="listing-preview-publish w-full">
      <header className="mb-5 max-w-2xl sm:mb-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#98A2B3]">
          Traveler preview
        </p>
        <h3 className="mt-1 text-[1.35rem] font-semibold tracking-tight text-[#17191D] sm:text-[1.5rem]">
          Preview & Publish
        </h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[#667085]">
          Review the customer-facing listing, then publish when everything is ready.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(15.5rem,18.5rem)] lg:items-start xl:gap-10">
        {/* —— Traveler preview (no supplier chrome) —— */}
        <div className="min-w-0 space-y-8 sm:space-y-9">
          <section aria-label="Product photos">
            <PreviewGallery photos={photos} />
          </section>

          <section aria-label="Product identity" className="max-w-2xl">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#667085]">
              <span className="inline-flex items-center rounded-md bg-[rgba(7,59,131,0.08)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#073B83]">
                {kindLabel}
              </span>
              {place ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#073B83]" aria-hidden />
                  {place}
                </span>
              ) : (
                <span>Location not set</span>
              )}
              {durationLabel ? (
                <>
                  <span className="text-[#E5E7EB]" aria-hidden>
                    ·
                  </span>
                  <span>{durationLabel}</span>
                </>
              ) : null}
            </p>
            <h4 className="mt-2.5 font-display text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-[#17191D] [overflow-wrap:anywhere] sm:text-[2rem]">
              {title.trim() || (isStay ? 'Untitled stay' : 'Untitled listing')}
            </h4>
            {subtitle.trim() ? (
              <p className="mt-2 text-[15px] leading-snug text-[#667085] [overflow-wrap:anywhere]">
                {subtitle.trim()}
              </p>
            ) : null}
            {startingPriceLabel ? (
              <p className="mt-3.5 text-[1.125rem] font-semibold tabular-nums tracking-tight text-[#17191D]">
                {startingPriceLabel}
              </p>
            ) : (
              <p className="mt-3.5 text-[13px] text-[#667085]">
                {isStay
                  ? 'Nightly price appears when pricing is set'
                  : 'Starting price appears when bookable options have prices'}
              </p>
            )}
          </section>

          {description.trim() ? (
            <section
              aria-labelledby="preview-overview-heading"
              className="max-w-2xl border-t border-[#E5E7EB] pt-8"
            >
              <SectionTitle id="preview-overview-heading">Overview</SectionTitle>
              <div className="mt-3 space-y-3 text-[15px] leading-[1.65] text-[#17191D] [overflow-wrap:anywhere]">
                {description
                  .trim()
                  .split(/\n{2,}/)
                  .map((para) => (
                    <p key={para.slice(0, 48)}>{para.trim()}</p>
                  ))}
              </div>
            </section>
          ) : null}

          {highlights.length > 0 ? (
            <section
              aria-labelledby="preview-highlights-heading"
              className="max-w-2xl border-t border-[#E5E7EB] pt-8"
            >
              <SectionTitle id="preview-highlights-heading">Experience highlights</SectionTitle>
              <ul className="mt-3.5 grid gap-2.5 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-2.5">
                {highlights.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[14px] leading-snug text-[#17191D]">
                    <span className="mt-0.5 flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-[rgba(7,59,131,0.08)] text-[#073B83]">
                      <Check className="h-2.5 w-2.5" strokeWidth={2.75} aria-hidden />
                    </span>
                    <span className="[overflow-wrap:anywhere]">{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {(includes.length > 0 || excludes.length > 0) ? (
            <section
              aria-label="Inclusions and exclusions"
              className={`grid max-w-2xl gap-6 border-t border-[#E5E7EB] pt-8 ${
                includes.length > 0 && excludes.length > 0 ? 'sm:grid-cols-2 sm:gap-8' : ''
              }`}
            >
              {includes.length > 0 ? (
                <div>
                  <SectionTitle id="preview-includes-heading">What&apos;s included</SectionTitle>
                  <ul className="mt-3 space-y-2 text-[14px] leading-snug text-[#17191D]">
                    {includes.map((line) => (
                      <li key={line} className="flex gap-2">
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
                  <SectionTitle id="preview-excludes-heading">Not included</SectionTitle>
                  <ul className="mt-3 space-y-2 text-[14px] leading-snug text-[#667085]">
                    {excludes.map((line) => (
                      <li key={line} className="flex gap-2">
                        <X
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#98A2B3]"
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

          <section
            aria-labelledby="preview-important-heading"
            className="max-w-2xl border-t border-[#E5E7EB] pt-8"
          >
            <SectionTitle id="preview-important-heading">Important information</SectionTitle>
            <dl className="mt-3.5 space-y-3.5">
              {spoken.length > 0 ? (
                <div className="grid gap-0.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-4">
                  <dt className="text-[12.5px] font-medium text-[#667085]">Languages</dt>
                  <dd className="text-[14px] text-[#17191D]">{spoken.join(', ')}</dd>
                </div>
              ) : null}
              {durationLabel ? (
                <div className="grid gap-0.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-4">
                  <dt className="text-[12.5px] font-medium text-[#667085]">Duration</dt>
                  <dd className="text-[14px] text-[#17191D]">{durationLabel}</dd>
                </div>
              ) : null}
              {meetingFromOptions ? (
                <div className="grid gap-0.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-4">
                  <dt className="text-[12.5px] font-medium text-[#667085]">Meeting</dt>
                  <dd className="text-[14px] text-[#17191D] [overflow-wrap:anywhere]">
                    {meetingFromOptions}
                  </dd>
                </div>
              ) : null}
              {knowBeforeYouGo.trim() ? (
                <div className="grid gap-0.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-4">
                  <dt className="text-[12.5px] font-medium text-[#667085]">Know before you go</dt>
                  <dd className="text-[14px] leading-relaxed text-[#17191D] [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {knowBeforeYouGo.trim()}
                  </dd>
                </div>
              ) : null}
              {whatToBring.trim() ? (
                <div className="grid gap-0.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-4">
                  <dt className="text-[12.5px] font-medium text-[#667085]">What to bring</dt>
                  <dd className="text-[14px] leading-relaxed text-[#17191D] [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {whatToBring.trim()}
                  </dd>
                </div>
              ) : null}
              <div className="grid gap-0.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-4">
                <dt className="text-[12.5px] font-medium text-[#667085]">Cancellation</dt>
                <dd className="text-[14px] leading-relaxed text-[#667085]">
                  {TRAVERION_STANDARD_CANCELLATION_POLICY}
                </dd>
              </div>
            </dl>
          </section>

          {!isStay ? (
            <section
              aria-labelledby="preview-options-heading"
              className="border-t border-[#E5E7EB] pt-8"
            >
              <SectionTitle id="preview-options-heading">Booking options</SectionTitle>
              {options.length === 0 ? (
                <p className="mt-2.5 text-[14px] text-[#667085]">No bookable options yet.</p>
              ) : (
                <ul className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
                  {options.map(({ option }) => {
                    const card = tourOptionCardModel(option, formatAmount);
                    const pricing = card.rows.find((r) => r.id === 'pricing');
                    const meeting = card.rows.find((r) => r.id === 'meeting');
                    const duration = card.rows.find((r) => r.id === 'duration');
                    return (
                      <li
                        key={option.id}
                        className="rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-3"
                      >
                        <p className="text-[14px] font-semibold tracking-tight text-[#17191D] [overflow-wrap:anywhere]">
                          {option.name.trim() || 'Untitled option'}
                        </p>
                        {duration?.ok && duration.text ? (
                          <p className="mt-1.5 text-[12.5px] text-[#667085]">{duration.text}</p>
                        ) : null}
                        {pricing?.ok && pricing.text ? (
                          <p className="mt-1 text-[13.5px] font-semibold tabular-nums text-[#17191D]">
                            {pricing.text}
                          </p>
                        ) : null}
                        {meeting?.ok && meeting.text ? (
                          <p className="mt-1.5 text-[12.5px] leading-snug text-[#667085] [overflow-wrap:anywhere]">
                            {meeting.text}
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

        {/* —— Publishing controls (supplier only) —— */}
        <aside className="min-w-0 lg:sticky lg:top-3 lg:pb-24">
          <div className="rounded-lg border border-[#E5E7EB] bg-white">
            <div className="px-4 py-3.5">
              <p className="text-[12px] font-semibold text-[#667085]">Publishing</p>
              <p className="mt-1 text-[1.05rem] font-semibold tracking-tight text-[#17191D]">
                {isPublished
                  ? 'Live listing'
                  : truth.canPublish
                    ? 'Ready to publish'
                    : allReady
                      ? 'Almost there'
                      : 'Not ready yet'}
              </p>
              <p className="mt-1 text-[12.5px] tabular-nums text-[#667085]">
                {readyCount}/{reviewRows.length} stages complete
              </p>
              <div
                className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#F5F6F8]"
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
              <div className="border-t border-amber-200/80 bg-amber-50/60 px-4 py-3" role="status">
                <p className="text-[13px] font-semibold text-[#17191D]">{truth.bannerTitle}</p>
                {truth.bannerBody ? (
                  <p className="mt-1 text-[12.5px] leading-snug text-[#667085]">{truth.bannerBody}</p>
                ) : null}
                <a
                  href={settingsHref}
                  className="mt-2 inline-flex min-h-9 items-center text-[13px] font-semibold text-[#073B83] hover:underline"
                >
                  Go to Settings
                </a>
              </div>
            ) : null}

            {incomplete.length > 0 ? (
              <ul className="border-t border-[#E5E7EB] divide-y divide-[#E5E7EB]">
                {incomplete.map((row) => (
                  <li key={row.label} className="flex items-start gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#17191D]">{row.label}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-[#667085] [overflow-wrap:anywhere]">
                        {row.missing || row.summary}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditStep(row.step)}
                      className="lux-flat inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-[#073B83] hover:underline"
                    >
                      Fix
                      <ChevronRight className="h-3 w-3 opacity-70" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-t border-[#E5E7EB] px-4 py-3">
                <p className="text-[13px] leading-snug text-[#17191D]">
                  {isPublished
                    ? 'All stages look complete. Save changes from the footer to update the live listing.'
                    : 'All stages look complete. Use Publish in the footer when you are ready.'}
                </p>
              </div>
            )}

            <div className="space-y-1.5 border-t border-[#E5E7EB] px-4 py-3">
              <p className="text-[12.5px] leading-snug text-[#667085]">{truth.listingLine}</p>
              {truth.accountLine ? (
                <p className="text-[12px] leading-snug text-[#667085]">{truth.accountLine}</p>
              ) : null}
              {liveListingHref ? (
                <a
                  href={liveListingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-8 items-center text-[13px] font-semibold text-[#073B83] hover:underline"
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
