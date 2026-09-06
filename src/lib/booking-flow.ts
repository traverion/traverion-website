import type { TourPackage } from '../types/tour';
import type { ListingBookingOption } from '../types/listingExtras';
import { materializedBookingOptions } from '../types/listingExtras';

const DRAFT_KEY = (tourId: string) => `traverion_booking_draft_v1_${tourId}`;

export type BookingFlowStep = 'date-guests' | 'review' | 'contact' | 'confirm' | 'done';

/** One bookable row for the traveler (partner option or synthesized default). */
export type TourBookingVariant = {
  id: string;
  label: string;
  subtitle: string;
  pricePerPerson: number;
  listingOption: ListingBookingOption | null;
};

export type BookingDraftV1 = {
  v: 1;
  tourId: string;
  step: BookingFlowStep;
  date: string;
  guests: number;
  name: string;
  email: string;
  placeOfStay: string;
  specialRequests: string;
  savedAt: string;
};

export function parseGroupSizeRange(groupSize: string | undefined): { min: number; max: number } | null {
  if (!groupSize?.trim()) return null;
  const m = groupSize.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  const min = Number.parseInt(m[1], 10);
  const max = Number.parseInt(m[2], 10);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) return null;
  return { min, max: Math.min(max, 99) };
}

/** Min/max party size from listing booking options, group size text, or defaults. */
export function getPartySizeBounds(tour: TourPackage): { min: number; max: number } {
  const opts = materializedBookingOptions(tour.listingExtras?.bookingOptions);
  if (opts.length > 0) {
    const min = Math.min(...opts.map((o) => o.minPersons));
    const max = Math.max(...opts.map((o) => o.maxPersons));
    return {
      min: Math.max(1, min),
      max: Math.min(99, Math.max(min, max)),
    };
  }
  const parsed = parseGroupSizeRange(tour.groupSize);
  if (parsed) {
    return {
      min: Math.max(1, parsed.min),
      max: Math.min(99, Math.max(parsed.min, parsed.max)),
    };
  }
  return { min: 1, max: 12 };
}

/** Min/max for a specific bookable option; falls back to listing-wide bounds. */
export function getPartySizeBoundsForVariant(
  tour: TourPackage,
  variant: TourBookingVariant | null
): { min: number; max: number } {
  const opt = variant?.listingOption;
  if (opt) {
    const min = Math.max(1, Math.floor(opt.minPersons));
    const max = Math.min(99, Math.max(min, Math.floor(opt.maxPersons)));
    return { min, max };
  }
  return getPartySizeBounds(tour);
}

export function formatPartySizeHint(bounds: { min: number; max: number }): string {
  if (bounds.min === bounds.max) {
    return bounds.min === 1
      ? 'This tour is for 1 guest only.'
      : `This tour is for exactly ${bounds.min} guests.`;
  }
  return `${bounds.min}–${bounds.max} guests per booking.`;
}

export function guestCountBoundaryMessage(boundary: 'min' | 'max', bounds: { min: number; max: number }): string {
  if (boundary === 'min') {
    return bounds.min === 1
      ? 'At least 1 guest is required.'
      : `At least ${bounds.min} guests are required for this tour.`;
  }
  return bounds.max === 1
    ? 'This option allows only 1 guest.'
    : `No more than ${bounds.max} guests allowed for this tour.`;
}

export function guestCountValidationError(
  guests: number,
  bounds: { min: number; max: number }
): string | null {
  if (guests < bounds.min) {
    return guestCountBoundaryMessage('min', bounds);
  }
  if (guests > bounds.max) {
    return guestCountBoundaryMessage('max', bounds);
  }
  return null;
}

export function getTourBookingVariants(tour: TourPackage): TourBookingVariant[] {
  const bounds = getPartySizeBounds(tour);
  const opts = materializedBookingOptions(tour.listingExtras?.bookingOptions);
  const basePrice = tour.price?.startingFrom ?? 0;
  if (opts.length > 0) {
    return opts.map((o) => {
      const price = typeof o.priceUsd === 'number' && o.priceUsd >= 0 ? o.priceUsd : basePrice;
      const subtitleParts = [
        o.duration?.trim(),
        o.optionInfo?.trim(),
        o.maxPersons ? `Up to ${o.maxPersons} guests` : null,
      ].filter(Boolean) as string[];
      return {
        id: o.id,
        label: o.name.trim() || 'Tour option',
        subtitle: subtitleParts.join(' · ') || `${bounds.min}–${bounds.max} guests`,
        pricePerPerson: price,
        listingOption: o,
      };
    });
  }
  return [
    {
      id: '__default__',
      label: 'Standard tour',
      subtitle: `${bounds.min}–${bounds.max} guests`,
      pricePerPerson: basePrice,
      listingOption: null,
    },
  ];
}

export function formatBookingDateDisplay(isoDate: string): string {
  if (!isoDate?.trim()) return '';
  const d = new Date(`${isoDate.trim()}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate.trim();
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function sanitizeRestoredBookingStep(
  step: BookingFlowStep,
  hasSessionUser: boolean,
  mode: 'page' | 'modal' = 'page'
): BookingFlowStep {
  if (step === 'done') return mode === 'modal' ? 'review' : 'date-guests';
  if (mode === 'page' && step === 'review') return 'date-guests';
  if (step === 'confirm' && !hasSessionUser) return 'contact';
  return step;
}

export function loadBookingDraft(tourId: string): BookingDraftV1 | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY(tourId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookingDraftV1>;
    if (parsed.v !== 1 || parsed.tourId !== tourId) return null;
    const maxAgeMs = 1000 * 60 * 60 * 24 * 3;
    const saved = parsed.savedAt ? Date.parse(parsed.savedAt) : 0;
    if (!Number.isFinite(saved) || Date.now() - saved > maxAgeMs) {
      sessionStorage.removeItem(DRAFT_KEY(tourId));
      return null;
    }
    return {
      v: 1,
      tourId,
      step: (parsed.step as BookingFlowStep) ?? 'date-guests',
      date: typeof parsed.date === 'string' ? parsed.date : '',
      guests: typeof parsed.guests === 'number' ? parsed.guests : 2,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      placeOfStay: typeof parsed.placeOfStay === 'string' ? parsed.placeOfStay : '',
      specialRequests: typeof parsed.specialRequests === 'string' ? parsed.specialRequests : '',
      savedAt: parsed.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveBookingDraft(tourId: string, draft: Omit<BookingDraftV1, 'v' | 'tourId' | 'savedAt'>): void {
  try {
    const payload: BookingDraftV1 = {
      v: 1,
      tourId,
      savedAt: new Date().toISOString(),
      ...draft,
    };
    sessionStorage.setItem(DRAFT_KEY(tourId), JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

export function clearBookingDraft(tourId: string): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY(tourId));
  } catch {
    /* ignore */
  }
}

export function humanizeBookingSubmitError(message: string | undefined): string {
  const raw = (message ?? '').trim();
  const lower = raw.toLowerCase();
  if (!raw) {
    return 'We could not save your booking. Check your connection and tap Confirm again.';
  }
  if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('load failed')) {
    return 'Connection problem. Check your network and try again.';
  }
  if (lower.includes('jwt') || lower.includes('session') || lower.includes('auth')) {
    return 'Your session may have expired. Sign in again, then confirm your booking once more.';
  }
  if (
    lower.includes('violates') ||
    lower.includes('constraint') ||
    lower.includes('foreign key') ||
    lower.includes('not null')
  ) {
    return 'Something on the server rejected this request. Refresh the page or try again in a few minutes.';
  }
  return raw;
}
