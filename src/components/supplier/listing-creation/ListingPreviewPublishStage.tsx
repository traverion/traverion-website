import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, MapPin, Monitor, Smartphone, X } from 'lucide-react';
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
import { useDialogFocus } from '../../../hooks/useDialogFocus';

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

function realPhotos(photos: string[]): string[] {
  return photos.filter((u) => u && !isPlaceholderListingImageUrl(u));
}

function mosaicClass(count: number): string {
  if (count <= 1) return 'listing-preview-gallery--1';
  if (count === 2) return 'listing-preview-gallery--2';
  if (count === 3) return 'listing-preview-gallery--3';
  if (count === 4) return 'listing-preview-gallery--4';
  return 'listing-preview-gallery--5';
}

function PreviewGallery({
  photos,
  onOpen,
}: {
  photos: string[];
  onOpen: (index: number) => void;
}) {
  const real = realPhotos(photos);
  if (real.length === 0) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-[#F5F6F8] ring-1 ring-[#E5E7EB] sm:aspect-[2.1/1]">
        <p className="px-4 text-center text-[13px] text-[#667085]">
          Add a cover photo to preview the traveler gallery
        </p>
      </div>
    );
  }

  const sideLimit = Math.min(4, real.length - 1);
  const side = real.slice(1, 1 + sideLimit);
  const moreCount = Math.max(0, real.length - 5);
  const mosaicCount = Math.min(5, real.length);

  return (
    <div>
      <div className={`listing-preview-gallery ${mosaicClass(mosaicCount)}`}>
        <button
          type="button"
          onClick={() => onOpen(0)}
          className="listing-preview-gallery__cell listing-preview-gallery__hero lux-flat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83]"
          aria-label={`Open gallery, photo 1 of ${real.length}`}
        >
          <img src={real[0]} alt="" />
        </button>
        {side.map((url, i) => (
          <button
            key={url.slice(-40)}
            type="button"
            onClick={() => onOpen(i + 1)}
            className="listing-preview-gallery__cell listing-preview-gallery__thumb listing-preview-gallery__thumb--desktop lux-flat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83]"
            aria-label={`Open gallery, photo ${i + 2} of ${real.length}`}
          >
            <img src={url} alt="" />
            {i === side.length - 1 && moreCount > 0 ? (
              <span className="absolute inset-0 flex items-center justify-center bg-[#17191D]/45 text-[13px] font-semibold text-white">
                +{moreCount} more
              </span>
            ) : null}
          </button>
        ))}
        {real.length > 1 ? (
          <div className="listing-preview-gallery__thumbs-mobile">
            {real.slice(1).map((url, i) => (
              <button
                key={`m-${url.slice(-36)}`}
                type="button"
                onClick={() => onOpen(i + 1)}
                className="listing-preview-gallery__cell lux-flat"
                aria-label={`Photo ${i + 2} of ${real.length}`}
              >
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[12.5px] tabular-nums text-[#667085]">
          {real.length} photo{real.length === 1 ? '' : 's'}
        </p>
        {real.length > 0 ? (
          <button
            type="button"
            onClick={() => onOpen(0)}
            className="lux-flat text-[12.5px] font-semibold text-[#073B83] hover:underline"
          >
            View all photos
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PreviewLightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: string[];
  index: number;
  onIndex: (n: number) => void;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, sheetRef, onClose);
  const safe = Math.min(Math.max(0, index), photos.length - 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onIndex(safe <= 0 ? photos.length - 1 : safe - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onIndex(safe >= photos.length - 1 ? 0 : safe + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onIndex, photos.length, safe]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={sheetRef}
      className="tv-gallery-lightbox listing-preview-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="text-sm font-medium tabular-nums">
          {safe + 1} / {photos.length}
        </p>
        <button type="button" className="tv-btn-ghost min-h-11 text-white hover:bg-white/10" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
        {photos.length > 1 ? (
          <button
            type="button"
            className="tv-gallery-lightbox__nav absolute left-3 z-10 sm:left-6"
            aria-label="Previous photo"
            onClick={() => onIndex(safe <= 0 ? photos.length - 1 : safe - 1)}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
        <img
          src={photos[safe]}
          alt=""
          className="max-h-[min(78vh,900px)] max-w-full rounded-lg object-contain shadow-2xl"
        />
        {photos.length > 1 ? (
          <button
            type="button"
            className="tv-gallery-lightbox__nav absolute right-3 z-10 sm:right-6"
            aria-label="Next photo"
            onClick={() => onIndex(safe >= photos.length - 1 ? 0 : safe + 1)}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-6">
          {photos.map((img, i) => (
            <button
              key={img.slice(-40)}
              type="button"
              onClick={() => onIndex(i)}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 ${
                i === safe ? 'ring-white' : 'ring-transparent opacity-70 hover:opacity-100'
              }`}
              aria-label={`Go to photo ${i + 1}`}
              aria-current={i === safe ? 'true' : undefined}
            >
              <img src={img} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h5 id={id} className="text-[1.05rem] font-semibold tracking-tight text-[#17191D] sm:text-[1.125rem]">
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
  const viewportId = useId();
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const kindLabel = isStay ? 'Stay' : reviewProductKindLabel(experienceKind);
  const readyCount = reviewRows.filter((r) => r.ready).length;
  const incomplete = reviewRows.filter((r) => !r.ready);
  const allReady = reviewRows.length > 0 && incomplete.length === 0;
  const gallery = useMemo(() => realPhotos(photos), [photos]);

  const spokenExtra = labelsForCatalogIds(additionalLanguages, SPOKEN_LANGUAGE_CATALOG);
  const spoken = [languageLabel.trim(), ...spokenExtra]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);

  useEffect(() => {
    if (options.length === 0) {
      setSelectedOptionId(null);
      return;
    }
    setSelectedOptionId((prev) =>
      prev && options.some((o) => o.option.id === prev) ? prev : options[0].option.id
    );
  }, [options]);

  const selected = options.find((o) => o.option.id === selectedOptionId) ?? options[0] ?? null;
  const selectedCard = selected ? tourOptionCardModel(selected.option, formatAmount) : null;
  const selectedDuration = selectedCard?.rows.find((r) => r.id === 'duration');
  const selectedPricing = selectedCard?.rows.find((r) => r.id === 'pricing');
  const selectedMeeting = selectedCard?.rows.find((r) => r.id === 'meeting');

  const meetingTexts = options
    .map(({ option }) => tourOptionCardModel(option, formatAmount).rows.find((r) => r.id === 'meeting'))
    .filter((r): r is NonNullable<typeof r> => Boolean(r?.ok && r.text))
    .map((r) => r.text);
  const uniqueMeetings = [...new Set(meetingTexts)];
  // Product-wide meeting only when every option shares the same meeting line.
  const sharedMeeting =
    !isStay && options.length > 0 && uniqueMeetings.length === 1 ? uniqueMeetings[0] : null;

  const displayPrice =
    selectedPricing?.ok && selectedPricing.text
      ? selectedPricing.text
      : startingPriceLabel;

  const displayDuration =
    selectedDuration?.ok && selectedDuration.text
      ? selectedDuration.text
      : !isStay && options.length === 1 && options[0].option.duration.trim()
        ? options[0].option.duration.trim()
        : null;

  return (
    <div id="supplier-listing-field-review" className="listing-preview-publish w-full">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
        <div className="min-w-0 max-w-xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#98A2B3]">
            Traveler preview
          </p>
          <h3 className="mt-1 text-[1.35rem] font-semibold tracking-tight text-[#17191D] sm:text-[1.5rem]">
            Preview & Publish
          </h3>
        </div>
        <div
          className="inline-flex rounded-lg border border-[#E5E7EB] bg-white p-0.5"
          role="group"
          aria-labelledby={viewportId}
        >
          <span id={viewportId} className="sr-only">
            Preview viewport
          </span>
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`lux-flat inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold ${
              viewport === 'desktop' ? 'bg-[#F5F6F8] text-[#17191D]' : 'text-[#667085]'
            }`}
            aria-pressed={viewport === 'desktop'}
          >
            <Monitor className="h-3.5 w-3.5" aria-hidden />
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`lux-flat inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold ${
              viewport === 'mobile' ? 'bg-[#F5F6F8] text-[#17191D]' : 'text-[#667085]'
            }`}
            aria-pressed={viewport === 'mobile'}
          >
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            Mobile
          </button>
        </div>
      </header>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(14.5rem,17rem)] lg:items-start xl:gap-8">
        <div
          className={`min-w-0 space-y-7 ${
            viewport === 'mobile' ? 'listing-preview-publish--mobile-frame' : ''
          }`}
        >
          <section aria-label="Product photos">
            <PreviewGallery
              photos={photos}
              onOpen={(i) => {
                if (gallery.length === 0) return;
                setLightboxIndex(i);
              }}
            />
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
              {displayDuration ? (
                <>
                  <span className="text-[#E5E7EB]" aria-hidden>
                    ·
                  </span>
                  <span>{displayDuration}</span>
                </>
              ) : null}
            </p>
            <h4 className="mt-2 font-display text-[1.55rem] font-semibold leading-[1.15] tracking-tight text-[#17191D] [overflow-wrap:anywhere] sm:text-[1.85rem]">
              {title.trim() || (isStay ? 'Untitled stay' : 'Untitled listing')}
            </h4>
            {subtitle.trim() ? (
              <p className="mt-1.5 text-[15px] leading-snug text-[#667085] [overflow-wrap:anywhere]">
                {subtitle.trim()}
              </p>
            ) : null}
            {displayPrice ? (
              <p className="mt-3 text-[1.125rem] font-semibold tabular-nums tracking-tight text-[#17191D]">
                {displayPrice}
              </p>
            ) : (
              <p className="mt-3 text-[13px] text-[#667085]">
                {isStay
                  ? 'Nightly price appears when pricing is set'
                  : 'Starting price appears when bookable options have prices'}
              </p>
            )}
          </section>

          {description.trim() ? (
            <section
              aria-labelledby="preview-overview-heading"
              className="max-w-2xl border-t border-[#E5E7EB] pt-7"
            >
              <SectionTitle id="preview-overview-heading">Overview</SectionTitle>
              <div className="mt-2.5 space-y-2.5 text-[15px] leading-[1.65] text-[#17191D] [overflow-wrap:anywhere]">
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
              className="max-w-2xl border-t border-[#E5E7EB] pt-7"
            >
              <SectionTitle id="preview-highlights-heading">Experience highlights</SectionTitle>
              <p className="mt-1 text-[12.5px] text-[#667085]">
                Product-wide highlights apply to this listing as a whole.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-2">
                {highlights.map((line) => (
                  <li key={line} className="flex gap-2 text-[14px] leading-snug text-[#17191D]">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#073B83]"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="[overflow-wrap:anywhere]">{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {includes.length > 0 || excludes.length > 0 ? (
            <section
              aria-label="Inclusions and exclusions"
              className={`grid max-w-2xl gap-5 border-t border-[#E5E7EB] pt-7 ${
                includes.length > 0 && excludes.length > 0 ? 'sm:grid-cols-2 sm:gap-7' : ''
              }`}
            >
              {includes.length > 0 ? (
                <div>
                  <SectionTitle id="preview-includes-heading">What&apos;s included</SectionTitle>
                  <ul className="mt-2.5 space-y-1.5 text-[14px] leading-snug text-[#17191D]">
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
                  <ul className="mt-2.5 space-y-1.5 text-[14px] leading-snug text-[#667085]">
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
            className="max-w-2xl border-t border-[#E5E7EB] pt-7"
          >
            <SectionTitle id="preview-important-heading">Important information</SectionTitle>
            <dl className="mt-3 space-y-3">
              {spoken.length > 0 ? (
                <div className="grid gap-0.5 sm:grid-cols-[7.25rem_minmax(0,1fr)] sm:gap-x-3">
                  <dt className="text-[12.5px] font-medium text-[#667085]">Languages</dt>
                  <dd className="text-[14px] text-[#17191D]">{spoken.join(', ')}</dd>
                </div>
              ) : null}
              {sharedMeeting ? (
                <div className="grid gap-0.5 sm:grid-cols-[7.25rem_minmax(0,1fr)] sm:gap-x-3">
                  <dt className="text-[12.5px] font-medium text-[#667085]">Meeting</dt>
                  <dd className="text-[14px] text-[#17191D] [overflow-wrap:anywhere]">{sharedMeeting}</dd>
                </div>
              ) : null}
              {knowBeforeYouGo.trim() ? (
                <div className="grid gap-0.5 sm:grid-cols-[7.25rem_minmax(0,1fr)] sm:gap-x-3">
                  <dt className="text-[12.5px] font-medium text-[#667085]">Know before you go</dt>
                  <dd className="max-w-prose text-[14px] leading-relaxed text-[#17191D] [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {knowBeforeYouGo.trim()}
                  </dd>
                </div>
              ) : null}
              {whatToBring.trim() ? (
                <div className="grid gap-0.5 sm:grid-cols-[7.25rem_minmax(0,1fr)] sm:gap-x-3">
                  <dt className="text-[12.5px] font-medium text-[#667085]">What to bring</dt>
                  <dd className="max-w-prose text-[14px] leading-relaxed text-[#17191D] [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {whatToBring.trim()}
                  </dd>
                </div>
              ) : null}
              <div className="grid gap-0.5 sm:grid-cols-[7.25rem_minmax(0,1fr)] sm:gap-x-3">
                <dt className="text-[12.5px] font-medium text-[#667085]">Cancellation</dt>
                <dd className="max-w-prose text-[14px] leading-relaxed text-[#667085]">
                  {TRAVERION_STANDARD_CANCELLATION_POLICY}
                </dd>
              </div>
            </dl>
          </section>

          {!isStay ? (
            <section
              aria-labelledby="preview-options-heading"
              className="border-t border-[#E5E7EB] pt-7"
            >
              <SectionTitle id="preview-options-heading">Booking options</SectionTitle>
              <p className="mt-1 text-[12.5px] text-[#667085]">
                Select an option to preview its duration, price unit, and meeting details.
              </p>
              {options.length === 0 ? (
                <p className="mt-2.5 text-[14px] text-[#667085]">No bookable options yet.</p>
              ) : (
                <ul className="mt-3 grid gap-2.5 sm:grid-cols-2" role="listbox" aria-label="Booking options">
                  {options.map(({ option }) => {
                    const card = tourOptionCardModel(option, formatAmount);
                    const pricing = card.rows.find((r) => r.id === 'pricing');
                    const meeting = card.rows.find((r) => r.id === 'meeting');
                    const duration = card.rows.find((r) => r.id === 'duration');
                    const selectedOpt = option.id === selected?.option.id;
                    return (
                      <li key={option.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedOpt}
                          onClick={() => setSelectedOptionId(option.id)}
                          className={`lux-flat w-full rounded-lg border px-3.5 py-3 text-left transition-colors ${
                            selectedOpt
                              ? 'border-[#073B83] bg-[rgba(7,59,131,0.04)] ring-1 ring-[#073B83]/35'
                              : 'border-[#E5E7EB] bg-white hover:border-[#D0D5DD]'
                          }`}
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
                          ) : pricing && !pricing.ok ? (
                            <p className="mt-1 text-[12.5px] text-[#667085]">{pricing.text}</p>
                          ) : null}
                          {meeting?.ok && meeting.text ? (
                            <p className="mt-1.5 text-[12.5px] leading-snug text-[#667085] [overflow-wrap:anywhere]">
                              {meeting.text}
                            </p>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selected && selectedMeeting?.ok && !sharedMeeting ? (
                <p className="mt-3 rounded-lg bg-[#F5F6F8] px-3 py-2.5 text-[13px] leading-snug text-[#17191D]">
                  <span className="font-semibold">Selected option meeting: </span>
                  {selectedMeeting.text}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="min-w-0 lg:sticky lg:top-3 lg:pb-20">
          <div className="rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-3">
            <p className="text-[1.05rem] font-semibold tracking-tight text-[#17191D]">
              {isPublished
                ? 'Live listing'
                : truth.canPublish || allReady
                  ? 'Ready to publish'
                  : 'Not ready to publish'}
            </p>
            <p className="mt-0.5 text-[12.5px] tabular-nums text-[#667085]">
              {readyCount} of {reviewRows.length} stages completed
            </p>
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-[#F5F6F8]"
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

            {truth.bannerTitle ? (
              <div className="mt-3 rounded-md border border-amber-200/80 bg-amber-50/70 px-2.5 py-2" role="status">
                <p className="text-[12.5px] font-semibold text-[#17191D]">{truth.bannerTitle}</p>
                {truth.bannerBody ? (
                  <p className="mt-0.5 text-[12px] leading-snug text-[#667085]">{truth.bannerBody}</p>
                ) : null}
                <a
                  href={settingsHref}
                  className="mt-1.5 inline-flex text-[12.5px] font-semibold text-[#073B83] hover:underline"
                >
                  Go to Settings
                </a>
              </div>
            ) : null}

            {incomplete.length > 0 ? (
              <ul className="mt-3 space-y-2 border-t border-[#E5E7EB] pt-3">
                {incomplete.map((row) => (
                  <li key={row.label} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-[#17191D]">{row.label}</p>
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
            ) : null}

            {truth.accountLine && !truth.bannerTitle ? (
              <p className="mt-2.5 text-[12px] leading-snug text-[#667085]">{truth.accountLine}</p>
            ) : null}

            {liveListingHref ? (
              <a
                href={liveListingHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-flex text-[12.5px] font-semibold text-[#073B83] hover:underline"
              >
                View live listing
              </a>
            ) : null}
          </div>
        </aside>
      </div>

      {lightboxIndex !== null && gallery.length > 0 ? (
        <PreviewLightbox
          photos={gallery}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
