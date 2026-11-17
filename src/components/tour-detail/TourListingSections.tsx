import { Check, Info, MapPin, X } from 'lucide-react';
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
import { listingShowsFreeCancellation } from '../../lib/listingTruth';
import ListingPdpCheckList from '../ListingPdpCheckList';
import ListingPdpCollapsible from '../ListingPdpCollapsible';
import ListingPdpFaq, { type ListingPdpFaqItem } from '../ListingPdpFaq';
import ListingPdpPolicyBlock from '../ListingPdpPolicyBlock';
import ListingPdpSupplierBlock from '../ListingPdpSupplierBlock';

type Legal = {
  operatorName: string;
  business_logo_url: string | null;
  privacy_policy_text: string | null;
  terms_conditions_text: string | null;
  public_description?: string | null;
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

const sectionClass = 'tv-pdp-section';
const headingClass = 'tv-section-heading';

function Fact({ label, children }: { label: string; children: string }) {
  const value = children.trim();
  if (!value) return null;
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:gap-5 sm:items-start">
      <dt className="text-sm font-semibold tracking-tight text-[#111827]">{label}</dt>
      <dd className="text-sm leading-relaxed text-ink-muted break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
        {value}
      </dd>
    </div>
  );
}

export function TourOperatorBlock({
  supplierLegal,
  onOpenLegal,
  heading = 'About the operator',
  subtitle = 'Experience operator on Traverion',
  privacyNote = null,
}: {
  supplierLegal: Legal;
  onOpenLegal: (kind: 'privacy' | 'terms') => void;
  heading?: string;
  subtitle?: string;
  privacyNote?: string | null;
}) {
  return (
    <ListingPdpSupplierBlock
      className={sectionClass}
      heading={heading}
      subtitle={subtitle}
      supplier={supplierLegal}
      onOpenLegal={onOpenLegal}
      privacyNote={privacyNote}
    />
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
  const cancellationBody =
    tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY;
  const faqItems: ListingPdpFaqItem[] = [];
  if (cancellationBody) {
    faqItems.push({
      question: 'What is the cancellation policy?',
      answer: cancellationBody,
    });
  }
  if (includes.length > 0) {
    faqItems.push({
      question: 'What is included?',
      answer: includes.join('\n'),
    });
  }
  if (pickup.visible && (pickup.place || pickup.modeIntro || pickup.instructions)) {
    faqItems.push({
      question: 'Where do we meet or get picked up?',
      answer: [pickup.modeIntro, pickup.place, pickup.instructions]
        .map((s) => (s ?? '').trim())
        .filter(Boolean)
        .join('\n\n'),
    });
  }
  if (cutoffLabel) {
    faqItems.push({
      question: 'When does booking close?',
      answer: cutoffLabel,
    });
  }
  if (extras?.knowBeforeYouGo?.trim()) {
    faqItems.push({
      question: 'What should I know before I go?',
      answer: extras.knowBeforeYouGo.trim(),
    });
  }

  return (
    <div>
      {highlights.length > 0 ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Highlights</h2>
          <ListingPdpCheckList items={highlights} />
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
          <div className="max-w-xl rounded-xl bg-[#F7F8FA] px-4 py-3.5 sm:px-5">
            <div className="flex gap-3 text-[15px] leading-relaxed text-ink">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#0B397E] shadow-[0_0_0_1px_rgba(28,25,23,0.06)]">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="min-w-0 space-y-2">
                {pickup.optionScoped && pickup.optionName ? (
                  <p className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-faint">
                    Selected option
                  </p>
                ) : null}
                {pickup.multiOptionHint ? (
                  <p className="text-ink-muted">{pickup.multiOptionHint}</p>
                ) : null}
                {!pickup.multiOptionHint && pickup.modeIntro ? (
                  <p className="font-semibold tracking-tight text-[#111827]">{pickup.modeIntro}</p>
                ) : null}
                {!pickup.multiOptionHint && pickup.place ? (
                  <div>
                    {pickup.placeLabel ? (
                      <p className="text-xs font-medium text-ink-muted">{pickup.placeLabel}</p>
                    ) : null}
                    <p className="mt-0.5 font-medium break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                      {pickup.place}
                    </p>
                  </div>
                ) : null}
                {!pickup.multiOptionHint && pickup.instructions ? (
                  <div className="flex gap-2 pt-0.5">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                    <p className="break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-sm text-ink-muted">
                      {pickup.instructions}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {showImportant ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Good to know</h2>
          <ListingPdpCollapsible
            textForLength={[
              tour.difficulty,
              extras?.knowBeforeYouGo,
              whatToBringLabels.join(' '),
              extras?.whatToBring,
              notSuitableLabels.join(' '),
              extras?.requirementsNotes,
              extras?.minGuestAge,
              accessibilityLabels.join(' '),
              extras?.accessibilitySummary,
              spokenLabels.join(' '),
              extras?.additionalInfo,
              cutoffLabel,
              ...notes,
            ]
              .filter(Boolean)
              .join(' ')}
            collapseAtChars={520}
            collapsedMaxHeightClass="max-h-[18rem]"
          >
            <dl className="max-w-xl divide-y divide-[#E8EBF0]">
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
          </ListingPdpCollapsible>
        </section>
      ) : null}

      <ListingPdpPolicyBlock
        className={sectionClass}
        summary={
          listingShowsFreeCancellation(tour)
            ? 'Free cancellation up to 24 hours before departure'
            : null
        }
        body={cancellationBody}
      />

      <ListingPdpFaq items={faqItems} className={sectionClass} />

      {showOperator && supplierLegal ? (
        <TourOperatorBlock supplierLegal={supplierLegal} onOpenLegal={onOpenLegal} />
      ) : null}
    </div>
  );
}
