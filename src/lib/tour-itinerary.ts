import type { TourPackage } from '../types/tour';
import type { DayPlan } from '../types/tour';

const GENERIC_STEP = /^(tour|experience|activity)$/i;

/**
 * Structured itinerary steps that are real content — not the auto DayPlan stub
 * that duplicates title/description with a generic "Tour" activity.
 */
export function meaningfulItinerarySteps(tour: TourPackage): DayPlan[] {
  const steps = (tour.itinerary ?? []).filter(
    (d) =>
      String(d.title ?? '').trim() ||
      String(d.description ?? '').trim() ||
      (d.activities ?? []).some((a) => String(a).trim())
  );
  if (steps.length !== 1) return steps;
  const only = steps[0];
  const title = String(only.title ?? '').trim();
  const titleDup =
    title.toLowerCase() === String(tour.title ?? '').trim().toLowerCase() || GENERIC_STEP.test(title);
  const stepDesc = String(only.description ?? '').trim().toLowerCase();
  const tourDesc = String(tour.description ?? '').trim().toLowerCase();
  const descDup = !stepDesc || stepDesc === tourDesc || GENERIC_STEP.test(stepDesc);
  const activityTexts = (only.activities ?? []).map((a) => String(a).trim()).filter(Boolean);
  const onlyGenericActivity =
    activityTexts.length === 0 || activityTexts.every((a) => GENERIC_STEP.test(a));
  if (titleDup && descDup && onlyGenericActivity) return [];
  return steps;
}

export type TravelerItinerary =
  | { kind: 'steps'; steps: DayPlan[] }
  | { kind: 'notes'; notes: string }
  | { kind: 'none' };

/**
 * Traveler itinerary truth: prefer real DayPlan steps; otherwise partner
 * `typicalTimelineNotes` (write-only until this surface). Never invent flow.
 */
export function travelerItinerary(tour: TourPackage): TravelerItinerary {
  const steps = meaningfulItinerarySteps(tour);
  if (steps.length > 0) return { kind: 'steps', steps };
  const notes = (tour.listingExtras?.typicalTimelineNotes ?? '').trim();
  if (notes) return { kind: 'notes', notes };
  return { kind: 'none' };
}

/** Persist shape: notes become a visible single step; otherwise empty (no stub). */
export function itineraryForListingPersist(input: {
  title: string;
  description: string;
  city: string;
  destination: string;
  typicalTimelineNotes: string;
}): DayPlan[] {
  const notes = input.typicalTimelineNotes.trim();
  if (!notes) return [];
  return [
    {
      day: 1,
      title: 'Typical flow',
      description: notes,
      meals: '',
      location: input.city.trim() || input.destination.trim() || '',
      activities: [],
    },
  ];
}
