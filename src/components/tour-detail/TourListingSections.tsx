import { Check, X } from 'lucide-react';
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
};

function itinerarySteps(tour: TourPackage) {
  const generic = /^(tour|experience|activity)$/i;
  const steps = (tour.itinerary ?? []).filter(
    (d) =>
      String(d.title ?? '').trim() ||
      String(d.description ?? '').trim() ||
      (d.activities ?? []).some((a) => String(a).trim())
  );
  if (steps.length !== 1) return steps;
  const only = steps[0];
  const title = String(only.title ?? '').trim();
  const titleDup = title.toLowerCase() === String(tour.title ?? '').trim().toLowerCase() || generic.test(title);
  const stepDesc = String(only.description ?? '').trim().toLowerCase();
  const tourDesc = String(tour.description ?? '').trim().toLowerCase();
  const descDup = !stepDesc || stepDesc === tourDesc || generic.test(stepDesc);
  const activityTexts = (only.activities ?? []).map((a) => String(a).trim()).filter(Boolean);
  const onlyGenericActivity =
    activityTexts.length === 0 || activityTexts.every((a) => generic.test(a));
  if (titleDup && descDup && onlyGenericActivity) return [];
  return steps;
}

const sectionClass = 'border-t border-black/[0.06] pt-8';
const headingClass = 'font-display text-xl text-ink mb-3';

export default function TourListingSections({
  tour,
  selectedOption = null,
  supplierLegal,
  onOpenLegal,
}: Props) {
  const highlights = tour.highlights.map((h) => String(h).trim()).filter(Boolean);
  const steps = itinerarySteps(tour);
  const includes = tour.includes.map((s) => String(s).trim()).filter(Boolean);
  const excludes = tour.excludes.map((s) => String(s).trim()).filter(Boolean);
  const notes = (tour.price?.importantNotes ?? []).map((n) => String(n).trim()).filter(Boolean);
  const showImportant =
    tour.difficulty === 'Challenging' ||
    notes.length > 0 ||
    Boolean(tour.listingExtras?.minGuestAge?.trim()) ||
    normalizeBookingCutoffHours(tour.listingExtras?.bookingCutoffHoursBeforeStart) > 0;
  const pickup = resolveTourPickupMeetingDisplay(tour, selectedOption);
  const cutoffLabel = bookingCutoffTravelerLabel(
    tour.listingExtras?.bookingCutoffHoursBeforeStart ?? 0
  );

  return (
    <div className="space-y-8">
      {highlights.length > 0 ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Highlights</h2>
          <ul className="space-y-2">
            {highlights.map((highlight) => (
              <li key={highlight} className="flex items-start gap-2.5 text-[15px] text-ink">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-finland" strokeWidth={2.25} aria-hidden />
                <span className="break-words [overflow-wrap:anywhere]">{highlight}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {steps.length > 0 ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Itinerary</h2>
          <ol className="space-y-5 border-l border-black/[0.08] pl-5">
            {steps.map((day, index) => {
              const multiDay = steps.length > 1;
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
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

      {includes.length > 0 || excludes.length > 0 ? (
        <section className={sectionClass}>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {includes.length > 0 ? (
              <div>
                <h2 className={headingClass}>Included</h2>
                <ul className="space-y-2">
                  {includes.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[15px] text-ink">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-finland" strokeWidth={2.25} aria-hidden />
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
      ) : null}

      {pickup.visible ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Pickup and meeting</h2>
          <div className="max-w-2xl space-y-2 text-[15px] leading-relaxed text-ink">
            {pickup.optionScoped && pickup.optionName ? (
              <p className="text-sm font-semibold text-ink">For option · {pickup.optionName}</p>
            ) : null}
            {pickup.multiOptionHint ? (
              <p className="text-ink-muted">{pickup.multiOptionHint}</p>
            ) : null}
            {pickup.modeIntro ? <p>{pickup.modeIntro}</p> : null}
            {pickup.place ? (
              <div>
                {pickup.placeLabel ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                    {pickup.placeLabel}
                  </p>
                ) : null}
                <p className="mt-0.5 break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{pickup.place}</p>
              </div>
            ) : null}
            {pickup.instructions ? (
              <p className="break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-ink-muted">
                {pickup.instructions}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showImportant ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Good to know</h2>
          <ul className="max-w-2xl space-y-2 text-[15px] text-ink">
            {tour.difficulty === 'Challenging' ? <li>This tour is marked challenging.</li> : null}
            {tour.listingExtras?.minGuestAge?.trim() ? (
              <li>Minimum age: {tour.listingExtras.minGuestAge.trim()}</li>
            ) : null}
            {cutoffLabel ? <li>{cutoffLabel}.</li> : null}
            {notes.map((n) => (
              <li key={n} className="break-words [overflow-wrap:anywhere]">
                {n}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={sectionClass}>
        <h2 className={headingClass}>Cancellation</h2>
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-muted">
          {tour.cancellationPolicy?.trim() || TRAVERION_STANDARD_CANCELLATION_POLICY}
        </p>
      </section>

      {supplierLegal ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Operator</h2>
          <div className="flex items-center gap-4">
            {supplierLegal.business_logo_url ? (
              <img
                src={supplierLegal.business_logo_url}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-black/[0.06]"
              />
            ) : (
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-finland/10 text-sm font-semibold text-finland"
                aria-hidden
              >
                {supplierLegal.operatorName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-ink">{supplierLegal.operatorName}</p>
              <p className="text-sm text-ink-muted">Runs this tour on Traverion</p>
            </div>
          </div>
          {supplierLegal.privacy_policy_text?.trim() || supplierLegal.terms_conditions_text?.trim() ? (
            <div className="mt-4 flex flex-wrap gap-2">
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
      ) : null}
    </div>
  );
}
