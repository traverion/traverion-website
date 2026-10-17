import { Check, MapPin, X } from 'lucide-react';
import type { TourPackage } from '../../types/tour';
import {
  TRAVERION_STANDARD_CANCELLATION_POLICY,
  type ListingBookingOption,
} from '../../types/listingExtras';
import { resolveTourPickupMeetingDisplay } from '../../lib/tour-pickup-meeting';
import {
  bookingCutoffTravelerLabel,
  normalizeBookingCutoffHours,
} from '../../lib/tour-departure-cutoff';
import { travelerItinerary } from '../../lib/tour-itinerary';
import {
  ACCESSIBILITY_FEATURES_CATALOG,
  NOT_SUITABLE_FOR_CATALOG,
  SPOKEN_LANGUAGE_CATALOG,
  WHAT_TO_BRING_CATALOG,
  labelsForCatalogIds,
} from '../../lib/listing-information-catalogs';

type Legal = {
  operatorName: string;
  business_logo_url: string | null;
  privacy_policy_text: string | null;
  terms_conditions_text: string | null;
};

type Props = {
  tour: TourPackage;
  /** When set, Pickup and meeting follows this option — not first-option listing denormalization. */
  selectedOption?: ListingBookingOption | null;
  supplierLegal: Legal | null;
  onOpenLegal: (kind: 'privacy' | 'terms') => void;
  /** Reviews sit before the operator. Pass false and render TourOperatorBlock after them. */
  showOperator?: boolean;
};

const sectionClass = 'mt-6 border-t border-[#E8EBF0] pt-6';
const headingClass = 'mb-3 text-xl font-bold tracking-tight text-[#111827]';

function Fact({ label, children }: { label: string; children: string }) {
  const value = children.trim();
  if (!value) return null;
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-semibold text-ink">{label}</dt>
      <dd className="text-sm leading-relaxed text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
        {value}
      </dd>
    </div>
  );
}

export function TourOperatorBlock({
  supplierLegal,
  onOpenLegal,
}: {
  supplierLegal: Legal;
  onOpenLegal: (kind: 'privacy' | 'terms') => void;
}) {
  return (
    <section className={sectionClass}>
      <h2 className={headingClass}>About the operator</h2>
      <div className="flex items-center gap-4">
        {supplierLegal.business_logo_url ? (
          <img
            src={supplierLegal.business_logo_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-black/[0.06]"
          />
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#073b83]/10 text-sm font-semibold text-[#073b83]"
            aria-hidden
          >
            {supplierLegal.operatorName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-ink">{supplierLegal.operatorName}</p>
          <p className="text-sm text-ink-muted">Runs this experience on Traverion</p>
        </div>
      </div>
      {supplierLegal.privacy_policy_text?.trim() || supplierLegal.terms_conditions_text?.trim() ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {supplierLegal.privacy_policy_text?.trim() ? (
            <button type="button" onClick={() => onOpenLegal('privacy')} className="tv-btn-ghost">
              Privacy policy
            </button>
          ) : null}
          {supplierLegal.terms_conditions_text?.trim() ? (
            <button type="button" onClick={() => onOpenLegal('terms')} className="tv-btn-ghost">
              Terms & conditions
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function TourListingSections({
  tour,
  selectedOption = null,
  supplierLegal,
  onOpenLegal,
  showOperator = true,
}: Props) {
  const highlights = tour.highlights.map((h) => String(h).trim()).filter(Boolean);
  const itinerary = travelerItinerary(tour);
  const includes = tour.includes.map((s) => String(s).trim()).filter(Boolean);
  const excludes = tour.excludes.map((s) => String(s).trim()).filter(Boolean);
  const notes = (tour.price?.importantNotes ?? []).map((n) => String(n).trim()).filter(Boolean);
  const extras = tour.listingExtras;
  const whatToBringLabels = labelsForCatalogIds(extras?.whatToBringIds ?? [], WHAT_TO_BRING_CATALOG);
  const notSuitableLabels = labelsForCatalogIds(
    extras?.notSuitableForIds ?? [],
    NOT_SUITABLE_FOR_CATALOG
  );
  const accessibilityLabels = labelsForCatalogIds(
    extras?.accessibilityFeatureIds ?? [],
    ACCESSIBILITY_FEATURES_CATALOG
  );
  const spokenLabels = labelsForCatalogIds(extras?.additionalLanguages ?? [], SPOKEN_LANGUAGE_CATALOG);
  const showImportant =
    Boolean(tour.difficulty) ||
    notes.length > 0 ||
    Boolean(extras?.minGuestAge?.trim()) ||
    Boolean(extras?.accessibilitySummary?.trim()) ||
    Boolean(extras?.knowBeforeYouGo?.trim()) ||
    Boolean(extras?.whatToBring?.trim()) ||
    whatToBringLabels.length > 0 ||
    notSuitableLabels.length > 0 ||
    accessibilityLabels.length > 0 ||
    spokenLabels.length > 0 ||
    Boolean(extras?.requirementsNotes?.trim()) ||
    Boolean(extras?.additionalInfo?.trim()) ||
    normalizeBookingCutoffHours(extras?.bookingCutoffHoursBeforeStart) > 0;
  const pickup = resolveTourPickupMeetingDisplay(tour, selectedOption);
  const cutoffLabel = bookingCutoffTravelerLabel(
    tour.listingExtras?.bookingCutoffHoursBeforeStart ?? 0
  );

  return (
    <div>
      {highlights.length > 0 ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Highlights</h2>
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {highlights.map((highlight) => (
              <li key={highlight} className="flex items-start gap-2.5 text-[15px] font-medium text-[#111827]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EAF2FF] text-[#0758CB]">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                </span>
                <span className="break-words [overflow-wrap:anywhere]">{highlight}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {itinerary.kind === 'steps' ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Itinerary</h2>
          <ol className="space-y-5 border-l border-black/[0.08] pl-5">
            {itinerary.steps.map((day, index) => {
              const multiDay = itinerary.steps.length > 1;
              const label = multiDay
                ? `Step ${index + 1}`
                : day.location?.trim()
                  ? day.location.trim()
                  : 'What happens';
              const locationSuffix = multiDay && day.location?.trim() ? ` · ${day.location.trim()}` : '';
              return (
                <li key={`${day.day}-${index}`} className="relative">
                  <span
                    className="absolute -left-[1.45rem] top-1.5 h-2 w-2 rounded-full bg-finland"
                    aria-hidden
                  />
                  <p className="text-xs font-medium text-ink-muted">
                    {label}
                    {locationSuffix}
                  </p>
                  {day.title?.trim() ? (
                    <h3 className="mt-1 font-semibold text-ink break-words [overflow-wrap:anywhere]">{day.title.trim()}</h3>
                  ) : null}
                  {day.description?.trim() ? (
                    <p className="mt-1 text-[15px] leading-relaxed text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{day.description.trim()}</p>
                  ) : null}
                  {(day.activities ?? []).filter((a) => String(a).trim()).length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                      {(day.activities ?? [])
                        .map((a) => String(a).trim())
                        .filter(Boolean)
                        .map((a) => (
                          <li key={a} className="break-words [overflow-wrap:anywhere]">{a}</li>
                        ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {itinerary.kind === 'notes' ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Itinerary</h2>
          <p className="max-w-2xl text-[15px] leading-relaxed text-ink break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
            {itinerary.notes}
          </p>
        </section>
      ) : null}

      {includes.length > 0 || excludes.length > 0 ? (
        <section className={sectionClass}>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {includes.length > 0 ? (
              <div>
                <h2 className={headingClass}>Included</h2>
                <ul className="space-y-2">
                  {includes.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[15px] font-medium text-[#111827]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0758CB]" strokeWidth={2.25} aria-hidden />
                      <span className="break-words [overflow-wrap:anywhere]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {excludes.length > 0 ? (
              <div>
                <h2 className={headingClass}>Not included</h2>
                <ul className="space-y-2">
                  {excludes.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[15px] text-ink">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" strokeWidth={2.25} aria-hidden />
                      <span className="break-words [overflow-wrap:anywhere]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        // Phase 1603: empty inclusions — do not vanish; travelers need an honest signal.
        <section className={sectionClass}>
          <h2 className={headingClass}>What’s included</h2>
          <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            This operator has not listed inclusions yet. Confirm details with them after booking, or check your
            confirmation.
          </p>
        </section>
      )}

      {pickup.visible ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Pickup and meeting</h2>
          <div className="flex max-w-2xl gap-3 text-[15px] leading-relaxed text-ink">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f4f5f7] text-[#073b83]">
              <MapPin className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 space-y-2">
            {pickup.optionScoped && pickup.optionName ? (
              <p className="text-sm font-semibold text-ink">For option · {pickup.optionName}</p>
            ) : null}
            {pickup.multiOptionHint ? (
              <p className="text-ink-muted">{pickup.multiOptionHint}</p>
            ) : null}
            {!pickup.multiOptionHint && pickup.modeIntro ? <p>{pickup.modeIntro}</p> : null}
            {!pickup.multiOptionHint && pickup.place ? (
              <div>
                {pickup.placeLabel ? (
                  <p className="text-xs font-medium text-ink-muted">
                    {pickup.placeLabel}
                  </p>
                ) : null}
                <p className="mt-0.5 break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{pickup.place}</p>
              </div>
            ) : null}
            {!pickup.multiOptionHint && pickup.instructions ? (
              <p className="break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-ink-muted">
                {pickup.instructions}
              </p>
            ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {showImportant ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Good to know</h2>
          <dl className="max-w-2xl divide-y divide-[#E8EBF0] border-y border-[#E8EBF0]">
            {tour.difficulty ? <Fact label="Difficulty">{tour.difficulty}</Fact> : null}
            {extras?.knowBeforeYouGo?.trim() ? (
              <Fact label="Before you go">{extras.knowBeforeYouGo.trim()}</Fact>
            ) : null}
            {whatToBringLabels.length > 0 ? (
              <Fact label="What to bring">{whatToBringLabels.join(', ')}</Fact>
            ) : null}
            {extras?.whatToBring?.trim() ? (
              <Fact label="What to bring">{extras.whatToBring.trim()}</Fact>
            ) : null}
            {notSuitableLabels.length > 0 ? (
              <Fact label="Not suitable">{notSuitableLabels.join(', ')}</Fact>
            ) : null}
            {extras?.requirementsNotes?.trim() ? (
              <Fact label="Requirements">{extras.requirementsNotes.trim()}</Fact>
            ) : null}
            {extras?.minGuestAge?.trim() ? (
              <Fact label="Minimum age">{extras.minGuestAge.trim()}</Fact>
            ) : null}
            {accessibilityLabels.length > 0 ? (
              <Fact label="Accessibility">{accessibilityLabels.join(', ')}</Fact>
            ) : null}
            {extras?.accessibilitySummary?.trim() ? (
              <Fact label="Accessibility">{extras.accessibilitySummary.trim()}</Fact>
            ) : null}
            {spokenLabels.length > 0 ? (
              <Fact label="Languages">{spokenLabels.join(', ')}</Fact>
            ) : null}
            {extras?.additionalInfo?.trim() ? (
              <Fact label="Also note">{extras.additionalInfo.trim()}</Fact>
            ) : null}
            {cutoffLabel ? <Fact label="Booking cutoff">{cutoffLabel}</Fact> : null}
            {notes.map((n) => (
              <Fact key={n} label="Note">
                {n}
              </Fact>
            ))}
          </dl>
        </section>
      ) : null}

      <section className={sectionClass}>
        <h2 className={headingClass}>Cancellation</h2>
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">
          {tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY}
        </p>
      </section>

      {showOperator && supplierLegal ? (
        <TourOperatorBlock supplierLegal={supplierLegal} onOpenLegal={onOpenLegal} />
      ) : null}
    </div>
  );
}
