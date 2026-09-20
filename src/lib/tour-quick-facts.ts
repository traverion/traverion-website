import type { TourPackage } from '../types/tour';
import { formatTourDurationDisplay } from '../types/listingExtras';
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

function pickupFact(tour: TourPackage): string | null {
  if (tour.experienceStartStyle === 'operator_pickup') return 'Pickup included';
  if (tour.experienceStartStyle === 'fixed_meeting_place') return 'Meeting point';
  if (tour.experienceStartStyle === 'either_available') return 'Pickup or meet';
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
