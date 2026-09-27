import type { TourPackage } from '../types/tour';
import { formatTourDurationDisplay, materializedBookingOptions } from '../types/listingExtras';
import { listingShowsFreeCancellation } from './listingTruth';

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  fi: 'Finnish',
  sv: 'Swedish',
  nl: 'Dutch',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
};

export function experienceLanguageLabel(code: string): string {
  const key = code.trim().toLowerCase();
  return LANGUAGE_LABELS[key] ?? code.trim();
}

export function tourKindLabel(kind: TourPackage['experienceKind']): string {
  if (kind === 'ticket') return 'Ticket';
  if (kind === 'transportation') return 'Transfer';
  return 'Tour';
}

/**
 * START fact for the PDP strip.
 * Prefer explicit listing start style; otherwise derive from option fulfillment
 * so a pickup-only option is never labeled “Meeting point” merely because a
 * place string was denormalized onto the listing.
 */
export function pickupFact(tour: TourPackage): string | null {
  if (tour.experienceStartStyle === 'operator_pickup') return 'Pickup included';
  if (tour.experienceStartStyle === 'fixed_meeting_place') return 'Meeting point';
  if (tour.experienceStartStyle === 'either_available') return 'Pickup or meet';

  const options = materializedBookingOptions(tour.listingExtras?.bookingOptions);
  const fulfillments = options
    .map((o) => o.fulfillment)
    .filter((f): f is 'pickup' | 'meeting_point' => f === 'pickup' || f === 'meeting_point');
  if (fulfillments.length > 0) {
    const allPickup = fulfillments.every((f) => f === 'pickup');
    const allMeet = fulfillments.every((f) => f === 'meeting_point');
    if (allPickup) return 'Pickup included';
    if (allMeet) return 'Meeting point';
    return 'Pickup or meet';
  }

  if (tour.meetingPoint?.trim()) return 'Meeting point';
  return null;
}

export function tourQuickFacts(tour: TourPackage): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const duration = formatTourDurationDisplay(tour.duration).trim();
  if (duration) facts.push({ label: 'Duration', value: duration });
  if (tour.groupSize?.trim() && !/option/i.test(tour.groupSize)) {
    facts.push({ label: 'Group size', value: tour.groupSize.trim() });
  }
  if (tour.experienceLanguage?.trim()) {
    facts.push({ label: 'Language', value: experienceLanguageLabel(tour.experienceLanguage) });
  }
  const pickup = pickupFact(tour);
  if (pickup) facts.push({ label: 'Start', value: pickup });
  if (listingShowsFreeCancellation(tour)) {
    facts.push({ label: 'Cancellation', value: 'Free within 24 hours' });
  }
  return facts;
}
