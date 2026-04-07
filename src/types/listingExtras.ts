/** Legacy preset values still parsed from stored `listing_extras` JSON. */
export type CancellationPreset = 'free_24h' | 'free_48h' | 'free_7d' | 'non_refundable' | 'custom';

/**
 * Standard Traverion cancellation terms for all listings (not supplier-editable).
 * Saved on every listing create/update from the partner form.
 */
export const TRAVERION_STANDARD_CANCELLATION_POLICY =
  'You may cancel free of charge up to 24 hours before the scheduled start time. After that, guest-initiated cancellations are not available. If the operator cancels or needs to reschedule (for example due to weather or safety), that is handled from your booking details.';

export type VenueSetting = 'unspecified' | 'indoor' | 'outdoor' | 'mixed';

export type ScheduleStyle = 'flexible' | 'fixed_slots' | 'on_request';

/** One bookable variant of a listing (e.g. small group vs bus tour) with its own price, timing, and pickup. */
export interface ListingBookingOption {
  id: string;
  name: string;
  /** Price in USD for this option. */
  priceUsd: number;
  /** Local start time HH:MM. */
  startTime: string;
  /** How long this option runs (e.g. “3 hours”). */
  duration: string;
  /** Where guests meet or are picked up for this option. */
  pickupPlace: string;
  minPersons: number;
  maxPersons: number;
  /** Max guests for one departure / start time. */
  maxSpotsPerSlot: number;
  /** Short note: private, small group, shared bus, language, etc. */
  optionInfo: string;
  /** Mon–Sun; true = offered that day. */
  weekdays: boolean[];
  /** Inclusive season start YYYY-MM-DD; empty = year-round / not set. */
  availabilityDateFrom: string;
  availabilityDateTo: string;
}

export interface ListingExtras {
  additionalLanguages?: string[];
  venueSetting?: VenueSetting;
  accessibilitySummary?: string;
  minGuestAge?: string;
  scheduleStyle?: ScheduleStyle;
  typicalTimelineNotes?: string;
  galleryImageUrls?: string[];
  cancellationPreset?: CancellationPreset;
  cancellationExtra?: string;
  /** Multiple priced variants under one product (partner Cost & options). */
  bookingOptions?: ListingBookingOption[];
}

const WEEKDAY_COUNT = 7;

function normalizeWeekdays(raw: unknown): boolean[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [true, true, true, true, true, false, false];
  }
  const out = raw.slice(0, WEEKDAY_COUNT).map((x) => Boolean(x));
  while (out.length < WEEKDAY_COUNT) out.push(false);
  return out;
}

export function normalizeListingBookingOption(raw: Record<string, unknown>, fallbackId: string): ListingBookingOption {
  const minP = typeof raw.minPersons === 'number' && raw.minPersons >= 1 ? Math.floor(raw.minPersons) : 1;
  let maxP = typeof raw.maxPersons === 'number' && raw.maxPersons >= minP ? Math.floor(raw.maxPersons) : Math.max(minP, 12);
  const spots =
    typeof raw.maxSpotsPerSlot === 'number' && raw.maxSpotsPerSlot >= 1
      ? Math.floor(raw.maxSpotsPerSlot)
      : maxP;
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : fallbackId,
    name: typeof raw.name === 'string' ? raw.name : '',
    priceUsd: typeof raw.priceUsd === 'number' && !Number.isNaN(raw.priceUsd) ? Math.max(0, raw.priceUsd) : 0,
    startTime: typeof raw.startTime === 'string' ? raw.startTime : '',
    duration: typeof raw.duration === 'string' ? raw.duration : '',
    pickupPlace: typeof raw.pickupPlace === 'string' ? raw.pickupPlace : '',
    minPersons: minP,
    maxPersons: maxP,
    maxSpotsPerSlot: Math.max(1, spots),
    optionInfo: typeof raw.optionInfo === 'string' ? raw.optionInfo : '',
    weekdays: normalizeWeekdays(raw.weekdays),
    availabilityDateFrom: typeof raw.availabilityDateFrom === 'string' ? raw.availabilityDateFrom : '',
    availabilityDateTo: typeof raw.availabilityDateTo === 'string' ? raw.availabilityDateTo : '',
  };
}

/**
 * Rows that are still the default blank template (e.g. after "Add another option" was clicked but nothing was filled).
 * These must not block Continue or publish checks.
 */
export function isListingBookingOptionEffectivelyEmpty(o: ListingBookingOption): boolean {
  return (
    !o.name.trim() &&
    o.priceUsd <= 0 &&
    !o.duration.trim() &&
    !o.pickupPlace.trim() &&
    !o.optionInfo.trim() &&
    !o.startTime.trim() &&
    !o.availabilityDateFrom.trim() &&
    !o.availabilityDateTo.trim()
  );
}

export function materializedBookingOptions(options: ListingBookingOption[] | undefined): ListingBookingOption[] {
  if (!options?.length) return [];
  return options.filter((o) => !isListingBookingOptionEffectivelyEmpty(o));
}

export function parseListingExtras(raw: unknown): ListingExtras {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: ListingExtras = {};

  if (Array.isArray(o.additionalLanguages)) {
    out.additionalLanguages = o.additionalLanguages.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  const vs = o.venueSetting;
  if (vs === 'indoor' || vs === 'outdoor' || vs === 'mixed' || vs === 'unspecified') {
    out.venueSetting = vs;
  }
  if (typeof o.accessibilitySummary === 'string' && o.accessibilitySummary.trim()) {
    out.accessibilitySummary = o.accessibilitySummary.trim();
  }
  if (typeof o.minGuestAge === 'string' && o.minGuestAge.trim()) {
    out.minGuestAge = o.minGuestAge.trim();
  }
  const ss = o.scheduleStyle;
  if (ss === 'flexible' || ss === 'fixed_slots' || ss === 'on_request') {
    out.scheduleStyle = ss;
  }
  if (typeof o.typicalTimelineNotes === 'string' && o.typicalTimelineNotes.trim()) {
    out.typicalTimelineNotes = o.typicalTimelineNotes.trim();
  }
  if (Array.isArray(o.galleryImageUrls)) {
    out.galleryImageUrls = o.galleryImageUrls.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  const cp = o.cancellationPreset;
  if (cp === 'free_24h' || cp === 'free_48h' || cp === 'free_7d' || cp === 'non_refundable' || cp === 'custom') {
    out.cancellationPreset = cp;
  }
  if (typeof o.cancellationExtra === 'string' && o.cancellationExtra.trim()) {
    out.cancellationExtra = o.cancellationExtra.trim();
  }

  if (Array.isArray(o.bookingOptions) && o.bookingOptions.length > 0) {
    out.bookingOptions = o.bookingOptions
      .filter((x) => x != null && typeof x === 'object')
      .map((x, i) => normalizeListingBookingOption(x as Record<string, unknown>, `opt-${i}`));
  }

  return out;
}

/** Persist non-empty listing extras (cancellation preset/extra are legacy-only in DB; no longer written). */
export function listingExtrasToDb(extras: ListingExtras | undefined): Record<string, unknown> | null {
  if (!extras) return null;
  const payload: Record<string, unknown> = {};
  if (extras.additionalLanguages?.length) payload.additionalLanguages = extras.additionalLanguages;
  if (extras.venueSetting && extras.venueSetting !== 'unspecified') payload.venueSetting = extras.venueSetting;
  if (extras.accessibilitySummary?.trim()) payload.accessibilitySummary = extras.accessibilitySummary.trim();
  if (extras.minGuestAge?.trim()) payload.minGuestAge = extras.minGuestAge.trim();
  if (extras.scheduleStyle) payload.scheduleStyle = extras.scheduleStyle;
  if (extras.typicalTimelineNotes?.trim()) payload.typicalTimelineNotes = extras.typicalTimelineNotes.trim();
  if (extras.galleryImageUrls?.length) payload.galleryImageUrls = extras.galleryImageUrls;
  if (extras.bookingOptions?.length) payload.bookingOptions = extras.bookingOptions;
  return Object.keys(payload).length > 0 ? payload : null;
}
