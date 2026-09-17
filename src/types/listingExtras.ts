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

/**
 * Participant / ticket type under an OPTION (e.g. Adult, Child).
 * Distinct from the option itself (Morning / Hotel pickup / Private).
 */
export type ListingPriceCategoryKind =
  | 'adult'
  | 'child'
  | 'infant'
  | 'youth'
  | 'senior'
  | 'participant';

export type ListingPricingMode = 'uniform' | 'age_dependent';

export type ListingPrivatePricing = 'per_person' | 'flat_group';

export interface ListingPriceCategory {
  id: string;
  label: string;
  kind: ListingPriceCategoryKind;
  /** Inclusive age bounds; null = not specified. */
  ageMin: number | null;
  ageMax: number | null;
  /** Unit price for this category (0 allowed when free, e.g. infants). */
  priceUsd: number;
  /** Category exists for coverage but cannot be booked. */
  notPermitted?: boolean;
  /** When false, quantity may still be collected but not count toward capacity (lap infants). */
  countsTowardCapacity?: boolean;
  /** Child/infant must be accompanied by an adult/senior on the booking. */
  requiresAdult?: boolean;
}

/**
 * One bookable PRODUCT OPTION (variant): e.g. hotel pickup vs meeting point, morning vs evening.
 * Price categories (Adult/Child) live *inside* an option — they are not separate options.
 */
export interface ListingBookingOption {
  id: string;
  name: string;
  /**
   * Headline / uniform unit price.
   * When pricingMode is age_dependent, kept in sync with the adult (or primary) category
   * for catalog and legacy single-unit checkout.
   */
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
  /** Activity / offer start YYYY-MM-DD; empty = not limited to a fixed start. */
  availabilityDateFrom: string;
  /** Activity end YYYY-MM-DD when the offer has a fixed end (e.g. season); empty = no end date / runs ongoing. */
  availabilityDateTo: string;
  /**
   * uniform = one price per person (priceUsd).
   * age_dependent = travelers pick quantities per priceCategories.
   */
  pricingMode?: ListingPricingMode;
  priceCategories?: ListingPriceCategory[];
  /** Traveler can book this option as a private group. */
  isPrivate?: boolean;
  /** How private bookings are priced when isPrivate. */
  privatePricing?: ListingPrivatePricing;
  /** Flat buy-out price when privatePricing is flat_group. */
  privateGroupPriceUsd?: number;
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
  /**
   * Partner UI only: display names for grid photo slots (e.g. original filenames after upload).
   * Same length/order as the internal 12-slot grid; parallel to URLs in form state.
   */
  photoSlotLabels?: string[];
  /**
   * Public inventory family when this listing is not a tour (stay / experience / package).
   * Omitted means tour. Separate from `experience_kind` on the listing row.
   */
  inventoryFamily?: 'tour' | 'stay' | 'experience' | 'package';
  /** Stay-only facts. Ignored for tours. */
  stay?: StayDetails;
}

export type StayDetails = {
  propertyType?: string;
  bedrooms?: number;
  beds?: number;
  bathrooms?: number;
  amenities?: string[];
  checkInTime?: string;
  checkOutTime?: string;
  houseRules?: string;
  nightlyPriceUsd?: number;
  minNights?: number;
  maxGuests?: number;
  cleaningFeeUsd?: number;
};

function normalizeStayDetails(raw: unknown): StayDetails | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: StayDetails = {};
  if (typeof o.propertyType === 'string' && o.propertyType.trim()) out.propertyType = o.propertyType.trim();
  if (typeof o.bedrooms === 'number' && o.bedrooms >= 0) out.bedrooms = Math.floor(o.bedrooms);
  if (typeof o.beds === 'number' && o.beds >= 0) out.beds = Math.floor(o.beds);
  if (typeof o.bathrooms === 'number' && o.bathrooms >= 0) out.bathrooms = Math.round(o.bathrooms * 2) / 2;
  if (Array.isArray(o.amenities)) {
    out.amenities = o.amenities.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 24);
  }
  if (typeof o.checkInTime === 'string' && o.checkInTime.trim()) out.checkInTime = o.checkInTime.trim().slice(0, 5);
  if (typeof o.checkOutTime === 'string' && o.checkOutTime.trim()) out.checkOutTime = o.checkOutTime.trim().slice(0, 5);
  if (typeof o.houseRules === 'string' && o.houseRules.trim()) out.houseRules = o.houseRules.trim().slice(0, 2000);
  if (typeof o.nightlyPriceUsd === 'number' && o.nightlyPriceUsd > 0) out.nightlyPriceUsd = o.nightlyPriceUsd;
  if (typeof o.minNights === 'number' && o.minNights >= 1) out.minNights = Math.floor(o.minNights);
  if (typeof o.maxGuests === 'number' && o.maxGuests >= 1) out.maxGuests = Math.floor(o.maxGuests);
  if (typeof o.cleaningFeeUsd === 'number' && o.cleaningFeeUsd >= 0) out.cleaningFeeUsd = o.cleaningFeeUsd;
  return Object.keys(out).length > 0 ? out : undefined;
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

const PRICE_CATEGORY_KINDS: ListingPriceCategoryKind[] = [
  'adult',
  'child',
  'infant',
  'youth',
  'senior',
  'participant',
];

function normalizeAgeBound(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < 0 || n > 120) return null;
  return n;
}

export function normalizeListingPriceCategory(raw: Record<string, unknown>, fallbackId: string): ListingPriceCategory {
  const kindRaw = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
  const kind = (PRICE_CATEGORY_KINDS.includes(kindRaw as ListingPriceCategoryKind)
    ? kindRaw
    : 'participant') as ListingPriceCategoryKind;
  const label =
    typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.trim().slice(0, 40)
      : kind === 'participant'
        ? 'Participant'
        : kind.charAt(0).toUpperCase() + kind.slice(1);
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : fallbackId,
    label,
    kind,
    ageMin: normalizeAgeBound(raw.ageMin),
    ageMax: normalizeAgeBound(raw.ageMax),
    priceUsd: typeof raw.priceUsd === 'number' && !Number.isNaN(raw.priceUsd) ? Math.max(0, raw.priceUsd) : 0,
    notPermitted: Boolean(raw.notPermitted),
    countsTowardCapacity: raw.countsTowardCapacity === false ? false : true,
    requiresAdult: Boolean(raw.requiresAdult),
  };
}

function normalizePriceCategories(raw: unknown): ListingPriceCategory[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out = raw
    .filter((x) => x != null && typeof x === 'object')
    .map((x, i) => normalizeListingPriceCategory(x as Record<string, unknown>, `cat-${i}`))
    .slice(0, 8);
  return out.length > 0 ? out : undefined;
}

function syncHeadlinePriceFromCategories(
  priceUsd: number,
  pricingMode: ListingPricingMode | undefined,
  cats: ListingPriceCategory[] | undefined,
  isPrivate: boolean | undefined,
  privatePricing: ListingPrivatePricing | undefined,
  privateGroupPriceUsd: number | undefined
): number {
  if (isPrivate && privatePricing === 'flat_group' && typeof privateGroupPriceUsd === 'number' && privateGroupPriceUsd > 0) {
    return privateGroupPriceUsd;
  }
  if (pricingMode === 'age_dependent' && cats?.length) {
    const usable = cats.filter((c) => !c.notPermitted);
    const adult = usable.find((c) => c.kind === 'adult' && c.priceUsd > 0);
    if (adult) return adult.priceUsd;
    const priced = usable.filter((c) => c.priceUsd > 0).sort((a, b) => b.priceUsd - a.priceUsd);
    if (priced[0]) return priced[0].priceUsd;
  }
  return priceUsd;
}

export function normalizeListingBookingOption(raw: Record<string, unknown>, fallbackId: string): ListingBookingOption {
  const minP = typeof raw.minPersons === 'number' && raw.minPersons >= 1 ? Math.floor(raw.minPersons) : 1;
  let maxP = typeof raw.maxPersons === 'number' && raw.maxPersons >= minP ? Math.floor(raw.maxPersons) : Math.max(minP, 12);
  const spots =
    typeof raw.maxSpotsPerSlot === 'number' && raw.maxSpotsPerSlot >= 1
      ? Math.floor(raw.maxSpotsPerSlot)
      : maxP;
  const pricingMode: ListingPricingMode | undefined =
    raw.pricingMode === 'age_dependent' ? 'age_dependent' : raw.pricingMode === 'uniform' ? 'uniform' : undefined;
  const priceCategories = normalizePriceCategories(raw.priceCategories);
  const isPrivate = Boolean(raw.isPrivate);
  const privatePricing: ListingPrivatePricing | undefined =
    raw.privatePricing === 'flat_group'
      ? 'flat_group'
      : raw.privatePricing === 'per_person'
        ? 'per_person'
        : isPrivate
          ? 'per_person'
          : undefined;
  const privateGroupPriceUsd =
    typeof raw.privateGroupPriceUsd === 'number' && !Number.isNaN(raw.privateGroupPriceUsd)
      ? Math.max(0, raw.privateGroupPriceUsd)
      : undefined;
  let priceUsd = typeof raw.priceUsd === 'number' && !Number.isNaN(raw.priceUsd) ? Math.max(0, raw.priceUsd) : 0;
  priceUsd = syncHeadlinePriceFromCategories(
    priceUsd,
    pricingMode,
    priceCategories,
    isPrivate,
    privatePricing,
    privateGroupPriceUsd
  );
  const out: ListingBookingOption = {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : fallbackId,
    name: typeof raw.name === 'string' ? raw.name : '',
    priceUsd,
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
  if (pricingMode) out.pricingMode = pricingMode;
  if (priceCategories) out.priceCategories = priceCategories;
  if (isPrivate) {
    out.isPrivate = true;
    if (privatePricing) out.privatePricing = privatePricing;
    if (privateGroupPriceUsd != null) out.privateGroupPriceUsd = privateGroupPriceUsd;
  }
  return out;
}

/**
 * Rows that are still the default blank template (e.g. after "Add another option" was clicked but nothing was filled).
 * These must not block Continue or publish checks.
 */
export function isListingBookingOptionEffectivelyEmpty(o: ListingBookingOption): boolean {
  const hasCats = (o.priceCategories ?? []).some((c) => c.label.trim() || c.priceUsd > 0);
  return (
    !o.name.trim() &&
    o.priceUsd <= 0 &&
    !hasCats &&
    !o.duration.trim() &&
    !o.pickupPlace.trim() &&
    !o.optionInfo.trim() &&
    !o.startTime.trim() &&
    !o.availabilityDateFrom.trim() &&
    !o.availabilityDateTo.trim() &&
    !o.isPrivate
  );
}

export function materializedBookingOptions(options: ListingBookingOption[] | undefined): ListingBookingOption[] {
  if (!options?.length) return [];
  return options.filter((o) => !isListingBookingOptionEffectivelyEmpty(o));
}

/** Unit for partner UI; stored duration is always a plain string (e.g. "3 hours"). */
export type BookingOptionDurationUnit = 'minutes' | 'hours' | 'days';

export function parseBookingOptionDuration(raw: string): { amount: string; unit: BookingOptionDurationUnit } {
  const t = raw.trim();
  if (!t) return { amount: '', unit: 'hours' };

  const m = t.match(/(\d+(?:\.\d+)?)/);
  const amount = m ? m[1] : '';

  let unit: BookingOptionDurationUnit = 'hours';
  if (amount) {
    if (/(^|\s)(min|mins|minute|minutes)(\s|$|[,.;])/i.test(t)) unit = 'minutes';
    else if (/(^|\s)(day|days)(\s|$|[,.;])/i.test(t)) unit = 'days';
    else if (/(^|\s)(hr|hrs|hour|hours)(\s|$|[,.;])/i.test(t) || /\d\s*h\b/i.test(t)) unit = 'hours';
  }
  return { amount, unit };
}

export function formatBookingOptionDuration(amountStr: string, unit: BookingOptionDurationUnit): string {
  const t = amountStr.trim();
  if (!t) return '';
  const n = Number(t);
  if (Number.isNaN(n) || n < 0) return '';
  const word =
    unit === 'minutes'
      ? n === 1
        ? 'minute'
        : 'minutes'
      : unit === 'hours'
        ? n === 1
          ? 'hour'
          : 'hours'
        : n === 1
          ? 'day'
          : 'days';
  const numStr = Number.isInteger(n) ? String(Math.trunc(n)) : String(n);
  return `${numStr} ${word}`;
}

/**
 * Traveler-facing duration line: keep values that already name a unit; if the stored value is only a number,
 * append a sensible unit (default hours, matching partner booking-option parsing).
 */
export function formatTourDurationDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (
    /\b(hour|hours|hrs|hr|day|days|minute|minutes|mins|min|night|nights)\b/i.test(t) ||
    /\d\s*h\b/i.test(t)
  ) {
    return t;
  }
  const { amount, unit } = parseBookingOptionDuration(t);
  if (!amount) return t;
  const formatted = formatBookingOptionDuration(amount, unit);
  return formatted || t;
}

/** True when duration has a positive numeric length (partner form uses number + unit). */
export function isListingBookingOptionDurationValid(raw: string): boolean {
  return getListingBookingOptionDurationIssue(raw) === null;
}

/** Single human-readable issue, or null if duration is acceptable. */
export function getListingBookingOptionDurationIssue(raw: string): string | null {
  const t = raw.trim();
  if (!t) {
    return 'Enter how long this option runs: add a number, then choose minutes, hours, or days.';
  }
  const { amount } = parseBookingOptionDuration(t);
  if (!amount) {
    return 'Duration needs a number plus a unit. For example type 3 and choose Hours, or 90 and Minutes.';
  }
  const n = Number(amount);
  if (Number.isNaN(n) || n <= 0) {
    return 'Use a duration greater than zero (for example 2 hours or 45 minutes).';
  }
  return null;
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
  if (Array.isArray(o.photoSlotLabels)) {
    out.photoSlotLabels = o.photoSlotLabels.map((x) => String(x ?? '').trim().slice(0, 200));
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

  const fam = o.inventoryFamily;
  if (fam === 'tour' || fam === 'stay' || fam === 'experience' || fam === 'package') {
    out.inventoryFamily = fam;
  }
  const stay = normalizeStayDetails(o.stay);
  if (stay) out.stay = stay;

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
  if (extras.photoSlotLabels?.some((l) => l.trim())) payload.photoSlotLabels = extras.photoSlotLabels;
  if (extras.bookingOptions?.length) payload.bookingOptions = extras.bookingOptions;
  if (extras.inventoryFamily && extras.inventoryFamily !== 'tour') {
    payload.inventoryFamily = extras.inventoryFamily;
  }
  if (extras.stay && Object.keys(extras.stay).length > 0) payload.stay = extras.stay;
  return Object.keys(payload).length > 0 ? payload : null;
}
