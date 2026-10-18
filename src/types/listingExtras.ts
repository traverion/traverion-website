import {
  normalizeAccessibilityFeatureIds,
  normalizeNotSuitableForIds,
  normalizeSpokenLanguageIds,
  normalizeWhatToBringIds,
} from '../lib/listing-information-catalogs';
import {
  parseSlotOverrides,
  slotOverridesToDb,
  type ListingSlotOverride,
} from '../lib/listing-slot-overrides';
import { normalizeBookingCutoffHours } from '../lib/tour-departure-cutoff';
import { normalizeStayUnits, type StayUnitDraft } from '../lib/stay-accommodation';
import { normalizeStayRestrictions, type StayRestrictions } from '../lib/stay-restrictions';
import {
  normalizeStaySeasons,
  type StayAvailabilityMode,
  type StaySeasonWindow,
} from '../lib/stay-season-quote';

/** Legacy preset values still parsed from stored `listing_extras` JSON. */
export type CancellationPreset = 'free_24h' | 'free_48h' | 'free_7d' | 'non_refundable' | 'custom';

/**
 * Standard Traverion cancellation terms for all listings (not supplier-editable).
 * Saved on every listing create/update from the partner form.
 */
export const TRAVERION_STANDARD_CANCELLATION_POLICY =
  'You may cancel free of charge up to 24 hours before the scheduled start time. After that, guest-initiated cancellations are not available. If the operator cancels or needs to reschedule (for example due to weather or safety), that is handled from your booking details.';

/**
 * Guest-facing stay wording for the same 24-hour rule.
 * Stays are measured from the check-in date (midnight in the property timezone), not a tour start time.
 * Stored listings keep TRAVERION_STANDARD_CANCELLATION_POLICY so refund checks stay unchanged.
 */
export const STAY_GUEST_CANCELLATION_POLICY =
  'You may cancel free of charge up to 24 hours before the check-in date. After that, guest-initiated cancellations are not available. If the host cancels, that is handled from your booking details.';

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

/** How travelers begin THIS option. Listing-level experienceStartStyle remains the catalog filter. */
export type ListingOptionFulfillment = 'meeting_point' | 'pickup';

/** Traveler-facing “why choose this option” — shown when picking a bookable option. */
export const TOUR_OPTION_INFO_MAX = 300;

/** How this option is charged — required before schedules. */
export type ListingOptionChargeModel = 'per_person' | 'flat_group';

/** Fixed clock departure vs flexible operating hours — required before schedules. */
export type ListingOptionStartMode = 'fixed' | 'flexible';

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
  /** Where guests meet or are picked up for this option (place only — not how-to copy). */
  pickupPlace: string;
  /**
   * Pickup-area center. Present only when the supplier saved a searched place.
   * Never inferred from pickupPlace text.
   */
  pickupCenterLat?: number;
  pickupCenterLng?: number;
  /** Straight-line eligibility radius in kilometres. Not a driving distance. */
  pickupRadiusKm?: number;
  pickupPlaceId?: string;
  pickupFormattedAddress?: string;
  /**
   * destination: center was copied from Basics and still follows that place.
   * custom: the supplier chose a different center. Omitted on legacy options.
   */
  pickupCenterSource?: 'destination' | 'custom';
  /** Destination place id this center was copied from. Absent when the center is custom or legacy. */
  pickupCenterLinkedPlaceId?: string;
  /** at_start: pickup happens at the departure. before_start: a window before departure, not an exact clock time. */
  pickupTiming?: 'at_start' | 'before_start';
  /** Minutes before departure the pickup window opens. Only with before_start. */
  pickupWindowMinutes?: number;
  /** When the traveler is told the exact pickup time. */
  pickupTimeConfirmation?: 'at_booking' | 'day_before';
  /** same: end where they started. different: a searched place. none: no drop-off. Omitted on legacy options. */
  dropoffMode?: 'same' | 'different' | 'none';
  dropoffPlace?: string;
  dropoffPlaceId?: string;
  dropoffLat?: number;
  dropoffLng?: number;
  /**
   * Vehicle used when this option provides transport.
   * `none` is an explicit meeting-point choice. Omitted means not chosen — not "transport included".
   */
  transportMode?:
    | 'car'
    | 'minivan'
    | 'van'
    | 'bus'
    | 'suv'
    | 'limousine'
    | 'motorcycle'
    | 'boat'
    | 'other'
    | 'none';
  /** Required when transportMode is other. */
  transportOther?: string;
  /** Meeting-point coordinates when the supplier saved a searched place. */
  meetingLat?: number;
  meetingLng?: number;
  meetingPlaceId?: string;
  /** Optional: meet at a point vs pickup. Omitted on legacy options that only stored pickupPlace. */
  fulfillment?: ListingOptionFulfillment;
  minPersons: number;
  maxPersons: number;
  /** Max guests for one departure / start time (option capacity). */
  maxSpotsPerSlot: number;
  /** Schedule editor round-trip for whole-group concurrent groups. */
  maxGroupsPerSlot?: number;
  /** Short card blurb: private, small group, shared bus, language, etc. Not start instructions. */
  optionInfo: string;
  /**
   * How travelers successfully begin this option (arrive early, wait outside, look for vehicle…).
   * Distinct from pickupPlace / meeting point. Frozen onto purchase_snapshot.pickupInstructions.
   */
  travelerStartInstructions?: string;
  /** Mon–Sun; true = offered that day. */
  weekdays: boolean[];
  /**
   * Optional per-weekday departure times (Mon=0 … Sun=6).
   * Used when editing a schedule via applyScheduleToOption; omitted on legacy flat options.
   */
  weekdayStartTimes?: string[][];
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
  /**
   * Per person vs whole-group price model. Required in option setup before schedules.
   * Distinct from age categories (those nest under per_person).
   */
  chargeModel?: ListingOptionChargeModel;
  /**
   * Fixed start time vs flexible operating hours. Required before schedules.
   * Fixed schedules need a clock time; flexible schedules use operating days without a single departure HM.
   */
  startMode?: ListingOptionStartMode;
  /**
   * Hours before local departure when online booking closes for this option.
   * Overrides listing-level bookingCutoffHoursBeforeStart when set.
   */
  bookingCutoffHoursBeforeStart?: number;
  /**
   * When true, extra guests can book after the normal cutoff if this exact
   * departure already has a confirmed paid booking. Omitted means off.
   */
  lastMinuteBookings?: boolean;
  /** How close to departure those extra bookings stay open. Only with lastMinuteBookings. */
  lastMinuteUntil?: 'departure' | '30m' | '1h';
  /** Traveler can book this option as a private group. */
  isPrivate?: boolean;
  /** How private bookings are priced when isPrivate. */
  privatePricing?: ListingPrivatePricing;
  /** Flat buy-out price when privatePricing is flat_group. */
  privateGroupPriceUsd?: number;
  /**
   * Seasonal / period rule-sets for THIS option. When present, quote and availability
   * resolve the matching schedule for the traveler's date. Omitted on legacy options.
   */
  schedules?: ListingOptionSchedule[];
}

export type ListingOptionScheduleStatus = 'draft' | 'ready';

/**
 * One operating period for a bookable option. Identity is stable; saves update this id.
 * Multiple schedules may exist on one option (e.g. September vs October pricing).
 */
export interface ListingOptionSchedule {
  id: string;
  name: string;
  availabilityDateFrom: string;
  availabilityDateTo: string;
  weekdays: boolean[];
  /**
   * Local departure HH:MM (legacy / headline). When weekdayStartTimes is set, keep the earliest
   * departure here for list labels and older readers.
   */
  startTime: string;
  /**
   * Mon=0 … Sun=6. Non-empty arrays = departures that day.
   * When omitted, each enabled weekday uses [startTime] (legacy single-time schedules).
   */
  weekdayStartTimes?: string[][];
  pricingMode?: ListingPricingMode;
  priceUsd: number;
  priceCategories?: ListingPriceCategory[];
  isPrivate?: boolean;
  privatePricing?: ListingPrivatePricing;
  privateGroupPriceUsd?: number;
  minPersons: number;
  maxPersons: number;
  /** Traveler seats for one departure (inherits option capacity on schedules). */
  maxSpotsPerSlot: number;
  /**
   * Whole-group: how many concurrent groups may book one start time.
   * Valid when maxGroupsPerSlot × maxPersons ≤ option/slot capacity.
   */
  maxGroupsPerSlot?: number;
  status?: ListingOptionScheduleStatus;
}

export interface ListingExtras {
  additionalLanguages?: string[];
  venueSetting?: VenueSetting;
  accessibilitySummary?: string;
  minGuestAge?: string;
  /** Partner Information step — practical notes guests should read before booking. */
  knowBeforeYouGo?: string;
  /** Legacy free-text packing list (preserved when migrating to whatToBringIds). */
  whatToBring?: string;
  /** Structured What to bring catalog IDs. */
  whatToBringIds?: string[];
  /** Legacy free-text requirements (preserved; UI uses notSuitableForIds). */
  requirementsNotes?: string;
  /** Structured “not suitable for” catalog IDs. */
  notSuitableForIds?: string[];
  /** Structured positive accessibility feature IDs. */
  accessibilityFeatureIds?: string[];
  /** Partner Information step — freeform additional notes. */
  additionalInfo?: string;
  /**
   * E.164 booking contact for confirmed guests only.
   * Stripped from public listing reads — never expose on PDP/search.
   */
  bookingContactPhoneE164?: string;
  scheduleStyle?: ScheduleStyle;
  typicalTimelineNotes?: string;
  galleryImageUrls?: string[];
  cancellationPreset?: CancellationPreset;
  cancellationExtra?: string;
  /**
   * Hours before local departure (listing departureTimezone wall clock) when online booking closes.
   * 0 / omitted = bookable until start; after start is always closed.
   */
  bookingCutoffHoursBeforeStart?: number;
  /**
   * IANA timezone for schedule wall times (e.g. Europe/Helsinki).
   * Omitted → platform default Europe/Helsinki. Invalid values are ignored on read.
   */
  departureTimezone?: string;
  /**
   * When true, supplier chose departureTimezone manually — location changes must not overwrite it.
   * Omitted / false → timezone may follow Basics country/city auto-detect.
   */
  departureTimezoneManual?: boolean;
  /**
   * Verified Basics destination from Places. City and country stay the traveler-facing label.
   * Absent on listings saved before destination search. Never inferred from a city name.
   */
  destinationPlace?: {
    placeId: string;
    city: string;
    country: string;
    countryCode: string;
    formatted: string;
    lat: number;
    lng: number;
  };
  /** Multiple bookable options under one tour (partner Options step). */
  bookingOptions?: ListingBookingOption[];
  /**
   * Partner UI only: display names for grid photo slots (e.g. original filenames after upload).
   * Same length/order as the internal 12-slot grid; parallel to URLs in form state.
   */
  photoSlotLabels?: string[];
  /**
   * Partner UI: master image URLs parallel to the photo grid for future recrop without quality loss.
   * Display slots may be cropped; originals stay when upload retained a master.
   */
  photoOriginalUrls?: string[];
  /**
   * Partner UI: crop/zoom state parallel to the photo grid (react-easy-crop).
   * Display URLs remain the traveler-facing cropped images; settings unlock lossless re-edit.
   */
  photoCropSettings?: Array<{
    crop?: { x?: number; y?: number };
    zoom?: number;
    areaPixels?: { x?: number; y?: number; width?: number; height?: number } | null;
  }>;
  /**
   * Public inventory family when this listing is not a tour (stay / experience / package).
   * Omitted means tour. Separate from `experience_kind` on the listing row.
   */
  inventoryFamily?: 'tour' | 'stay' | 'experience' | 'package';
  /** Stay-only facts. Ignored for tours. */
  stay?: StayDetails;
  /**
   * Date-specific capacity / booking-cutoff overrides per departure start time.
   * Does not change recurring schedule defaults. Enforced by assert_checkout_inventory (Phase 243).
   */
  slotOverrides?: ListingSlotOverride[];
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
  /** Guest-visible property rules. Not used to reject a booking. */
  restrictions?: StayRestrictions;
  /**
   * Optional guest-facing label (for example "Aurora Villa").
   * Does not replace city, country, place id, or coordinates.
   */
  locationDisplayName?: string;
  /** single = one bookable accommodation. multi is a draft of room types and is not bookable yet. */
  accommodationMode?: 'single' | 'multi';
  /** Room or unit types. Ignored by checkout until multi-unit inventory exists. */
  units?: StayUnitDraft[];
  /**
   * Exact arrival address for booked guests (street / building / entry notes).
   * Stored in listing_stay_private (owner/service only) — never in public listing_extras.
   * Frozen onto purchase_snapshot at checkout; shown in Trips. City/country for discovery.
   */
  checkInAddress?: string;
  nightlyPriceUsd?: number;
  /** open = bookable unless a night is blocked. scheduled = only nights inside a season. */
  availabilityMode?: StayAvailabilityMode;
  seasons?: StaySeasonWindow[];
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
    out.amenities = o.amenities.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 40);
  }
  if (typeof o.checkInTime === 'string' && o.checkInTime.trim()) out.checkInTime = o.checkInTime.trim().slice(0, 5);
  if (typeof o.checkOutTime === 'string' && o.checkOutTime.trim()) out.checkOutTime = o.checkOutTime.trim().slice(0, 5);
  if (typeof o.houseRules === 'string' && o.houseRules.trim()) out.houseRules = o.houseRules.trim().slice(0, 2000);
  const restrictions = normalizeStayRestrictions(o.restrictions);
  if (restrictions) out.restrictions = restrictions;
  if (typeof o.locationDisplayName === 'string' && o.locationDisplayName.trim()) {
    out.locationDisplayName = o.locationDisplayName.trim().slice(0, 80);
  }
  if (o.accommodationMode === 'multi') out.accommodationMode = 'multi';
  else if (o.accommodationMode === 'single') out.accommodationMode = 'single';
  const units = normalizeStayUnits(o.units);
  if (units.length > 0) out.units = units;
  if (typeof o.checkInAddress === 'string' && o.checkInAddress.trim()) {
    out.checkInAddress = o.checkInAddress.trim().slice(0, 400);
  }
  if (typeof o.nightlyPriceUsd === 'number' && o.nightlyPriceUsd > 0) out.nightlyPriceUsd = o.nightlyPriceUsd;
  if (o.availabilityMode === 'scheduled') out.availabilityMode = 'scheduled';
  else if (o.availabilityMode === 'open') out.availabilityMode = 'open';
  const seasons = normalizeStaySeasons(o.seasons);
  if (seasons.length > 0) out.seasons = seasons;
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

const CLOCK_HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Normalize optional per-weekday HH:MM lists (Mon=0 … Sun=6). */
export function normalizeWeekdayStartTimes(raw: unknown): string[][] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: string[][] = [];
  let any = false;
  for (let i = 0; i < WEEKDAY_COUNT; i++) {
    const dayRaw = raw[i];
    const times = Array.isArray(dayRaw)
      ? [
          ...new Set(
            dayRaw
              .map((t) => (typeof t === 'string' ? t.trim().slice(0, 5) : ''))
              .filter((t) => CLOCK_HM.test(t))
          ),
        ].sort()
      : [];
    if (times.length > 0) any = true;
    out.push(times);
  }
  return any ? out : undefined;
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
  // Phase 1232: unset maxPersons → 0 (no invent as minPersons / no invent-12).
  const maxP =
    typeof raw.maxPersons === 'number' && raw.maxPersons >= minP ? Math.floor(raw.maxPersons) : 0;
  // Phase 1225: never invent slot cap from maxPersons (parity with edge parseSchedule 1205).
  const spots =
    typeof raw.maxSpotsPerSlot === 'number' && Number.isFinite(raw.maxSpotsPerSlot) && raw.maxSpotsPerSlot >= 1
      ? Math.floor(raw.maxSpotsPerSlot)
      : 0;
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
    maxSpotsPerSlot: spots,
    optionInfo:
      typeof raw.optionInfo === 'string' ? raw.optionInfo.slice(0, TOUR_OPTION_INFO_MAX) : '',
    weekdays: normalizeWeekdays(raw.weekdays),
    availabilityDateFrom: typeof raw.availabilityDateFrom === 'string' ? raw.availabilityDateFrom : '',
    availabilityDateTo: typeof raw.availabilityDateTo === 'string' ? raw.availabilityDateTo : '',
  };
  {
    const weekdayStartTimes = normalizeWeekdayStartTimes(raw.weekdayStartTimes);
    if (weekdayStartTimes) out.weekdayStartTimes = weekdayStartTimes;
  }
  if (typeof raw.travelerStartInstructions === 'string') {
    // Explicit empty must not re-seed from optionInfo. Keep non-empty text as typed
    // (no live trim) so patchOptionDraft does not eat spaces between words.
    if (raw.travelerStartInstructions.length > 0) {
      out.travelerStartInstructions = raw.travelerStartInstructions.slice(0, 1000);
    }
  } else if (out.optionInfo.trim().length >= 8) {
    // Pre–Phase-1059 rows stored start copy in optionInfo; promote into the dedicated field.
    out.travelerStartInstructions = out.optionInfo.trim().slice(0, 1000);
  }
  if (raw.fulfillment === 'meeting_point' || raw.fulfillment === 'pickup') {
    out.fulfillment = raw.fulfillment;
  }
  {
    const lat = typeof raw.pickupCenterLat === 'number' ? raw.pickupCenterLat : Number.NaN;
    const lng = typeof raw.pickupCenterLng === 'number' ? raw.pickupCenterLng : Number.NaN;
    const radius = typeof raw.pickupRadiusKm === 'number' ? raw.pickupRadiusKm : Number.NaN;
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      out.pickupCenterLat = lat;
      out.pickupCenterLng = lng;
    }
    if (Number.isFinite(radius) && radius >= 1 && radius <= 150) {
      out.pickupRadiusKm = Math.round(radius * 10) / 10;
    }
    if (typeof raw.pickupPlaceId === 'string' && raw.pickupPlaceId.trim()) {
      out.pickupPlaceId = raw.pickupPlaceId.trim().slice(0, 256);
    }
    if (typeof raw.pickupFormattedAddress === 'string' && raw.pickupFormattedAddress.trim()) {
      out.pickupFormattedAddress = raw.pickupFormattedAddress.trim().slice(0, 300);
    }
    if (raw.pickupCenterSource === 'destination' || raw.pickupCenterSource === 'custom') {
      out.pickupCenterSource = raw.pickupCenterSource;
    }
    if (typeof raw.pickupCenterLinkedPlaceId === 'string' && raw.pickupCenterLinkedPlaceId.trim()) {
      out.pickupCenterLinkedPlaceId = raw.pickupCenterLinkedPlaceId.trim().slice(0, 256);
    }
    if (raw.pickupTiming === 'at_start' || raw.pickupTiming === 'before_start') out.pickupTiming = raw.pickupTiming;
    if (typeof raw.pickupWindowMinutes === 'number' && raw.pickupWindowMinutes >= 5 && raw.pickupWindowMinutes <= 180) {
      out.pickupWindowMinutes = Math.round(raw.pickupWindowMinutes);
    }
    if (raw.pickupTimeConfirmation === 'at_booking' || raw.pickupTimeConfirmation === 'day_before') {
      out.pickupTimeConfirmation = raw.pickupTimeConfirmation;
    }
    if (raw.dropoffMode === 'same' || raw.dropoffMode === 'different' || raw.dropoffMode === 'none') {
      out.dropoffMode = raw.dropoffMode;
    }
    if (typeof raw.dropoffPlace === 'string' && raw.dropoffPlace.trim()) {
      out.dropoffPlace = raw.dropoffPlace.trim().slice(0, 300);
    }
    if (typeof raw.dropoffPlaceId === 'string' && raw.dropoffPlaceId.trim()) {
      out.dropoffPlaceId = raw.dropoffPlaceId.trim().slice(0, 256);
    }
    const dropLat = typeof raw.dropoffLat === 'number' ? raw.dropoffLat : Number.NaN;
    const dropLng = typeof raw.dropoffLng === 'number' ? raw.dropoffLng : Number.NaN;
    if (dropLat >= -90 && dropLat <= 90 && dropLng >= -180 && dropLng <= 180) {
      out.dropoffLat = dropLat;
      out.dropoffLng = dropLng;
    }
    if (
      raw.transportMode === 'car' ||
      raw.transportMode === 'minivan' ||
      raw.transportMode === 'van' ||
      raw.transportMode === 'bus' ||
      raw.transportMode === 'suv' ||
      raw.transportMode === 'limousine' ||
      raw.transportMode === 'motorcycle' ||
      raw.transportMode === 'boat' ||
      raw.transportMode === 'other' ||
      raw.transportMode === 'none'
    ) {
      out.transportMode = raw.transportMode;
    }
    if (out.transportMode === 'other' && typeof raw.transportOther === 'string' && raw.transportOther.trim()) {
      out.transportOther = raw.transportOther.trim().slice(0, 80);
    }
    const meetLat = typeof raw.meetingLat === 'number' ? raw.meetingLat : Number.NaN;
    const meetLng = typeof raw.meetingLng === 'number' ? raw.meetingLng : Number.NaN;
    if (meetLat >= -90 && meetLat <= 90 && meetLng >= -180 && meetLng <= 180) {
      out.meetingLat = meetLat;
      out.meetingLng = meetLng;
    }
    if (typeof raw.meetingPlaceId === 'string' && raw.meetingPlaceId.trim()) {
      out.meetingPlaceId = raw.meetingPlaceId.trim().slice(0, 256);
    }
  }
  if (pricingMode) out.pricingMode = pricingMode;
  if (priceCategories) out.priceCategories = priceCategories;
  if (raw.chargeModel === 'per_person' || raw.chargeModel === 'flat_group') {
    out.chargeModel = raw.chargeModel;
  } else if (isPrivate && privatePricing === 'flat_group') {
    out.chargeModel = 'flat_group';
  }
  if (raw.startMode === 'fixed' || raw.startMode === 'flexible') {
    out.startMode = raw.startMode;
  }
  const cutoffHours = normalizeBookingCutoffHours(raw.bookingCutoffHoursBeforeStart);
  if (cutoffHours > 0) out.bookingCutoffHoursBeforeStart = cutoffHours;
  if (raw.lastMinuteBookings === true) {
    out.lastMinuteBookings = true;
    out.lastMinuteUntil =
      raw.lastMinuteUntil === '30m' || raw.lastMinuteUntil === '1h' || raw.lastMinuteUntil === 'departure'
        ? raw.lastMinuteUntil
        : 'departure';
  }
  if (isPrivate) {
    out.isPrivate = true;
    if (privatePricing) out.privatePricing = privatePricing;
    if (privateGroupPriceUsd != null) out.privateGroupPriceUsd = privateGroupPriceUsd;
  }
  if (Array.isArray(raw.schedules)) {
    out.schedules = normalizeListingOptionSchedules(raw.schedules, out.id);
  }
  return out;
}

export function normalizeListingOptionSchedule(
  raw: Record<string, unknown>,
  fallbackId: string
): ListingOptionSchedule {
  const minP = typeof raw.minPersons === 'number' && raw.minPersons >= 1 ? Math.floor(raw.minPersons) : 1;
  // Phase 1232: unset maxPersons → 0 (no invent as minPersons / no invent-12).
  const maxP =
    typeof raw.maxPersons === 'number' && raw.maxPersons >= minP ? Math.floor(raw.maxPersons) : 0;
  // Phase 1225: never invent schedule slot cap from maxPersons.
  const spots =
    typeof raw.maxSpotsPerSlot === 'number' && Number.isFinite(raw.maxSpotsPerSlot) && raw.maxSpotsPerSlot >= 1
      ? Math.floor(raw.maxSpotsPerSlot)
      : 0;
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
  const out: ListingOptionSchedule = {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : fallbackId,
    name: typeof raw.name === 'string' ? raw.name : '',
    availabilityDateFrom: typeof raw.availabilityDateFrom === 'string' ? raw.availabilityDateFrom : '',
    availabilityDateTo: typeof raw.availabilityDateTo === 'string' ? raw.availabilityDateTo : '',
    weekdays: normalizeWeekdays(raw.weekdays),
    startTime: typeof raw.startTime === 'string' ? raw.startTime : '',
    priceUsd,
    minPersons: minP,
    maxPersons: maxP,
    maxSpotsPerSlot: spots,
  };
  {
    const weekdayStartTimes = normalizeWeekdayStartTimes(raw.weekdayStartTimes);
    if (weekdayStartTimes) {
      out.weekdayStartTimes = weekdayStartTimes;
      out.weekdays = weekdayStartTimes.map((times) => times.length > 0);
      const earliest = weekdayStartTimes.flat().sort()[0];
      if (earliest) out.startTime = earliest;
    }
  }
  if (pricingMode) out.pricingMode = pricingMode;
  if (priceCategories) out.priceCategories = priceCategories;
  if (isPrivate) {
    out.isPrivate = true;
    if (privatePricing) out.privatePricing = privatePricing;
    if (privateGroupPriceUsd != null) out.privateGroupPriceUsd = privateGroupPriceUsd;
  }
  if (raw.status === 'ready' || raw.status === 'draft') out.status = raw.status;
  if (
    typeof raw.maxGroupsPerSlot === 'number' &&
    Number.isFinite(raw.maxGroupsPerSlot) &&
    raw.maxGroupsPerSlot >= 1
  ) {
    // Keep in sync with LISTING_CAPACITY_MAX (listing-option-schedules) without a circular import.
    out.maxGroupsPerSlot = Math.min(200, Math.floor(raw.maxGroupsPerSlot));
  }
  return out;
}

function normalizeListingOptionSchedules(raw: unknown, optionId: string): ListingOptionSchedule[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .filter((x) => x != null && typeof x === 'object')
    .map((x, i) =>
      normalizeListingOptionSchedule(x as Record<string, unknown>, `${optionId}-sch-${i}`)
    )
    .slice(0, 24); // hard ceiling; product UI caps adds at LISTING_OPTION_SCHEDULES_MAX (5)
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
    !(o.travelerStartInstructions ?? '').trim() &&
    !o.startTime.trim() &&
    !o.availabilityDateFrom.trim() &&
    !o.availabilityDateTo.trim() &&
    !o.isPrivate &&
    !(o.schedules && o.schedules.length > 0)
  );
}

/**
 * Traveler start instructions for an option.
 * Prefer dedicated field; fall back to optionInfo only for pre–Phase-1059 rows
 * where optionInfo was denormalized into listing.pickup_instructions.
 */
export function resolveOptionTravelerStartInstructions(option: {
  travelerStartInstructions?: string | null;
  optionInfo?: string | null;
}): string {
  const dedicated = (option.travelerStartInstructions ?? '').trim();
  if (dedicated) return dedicated;
  return (option.optionInfo ?? '').trim();
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
    out.additionalLanguages = normalizeSpokenLanguageIds(
      o.additionalLanguages.map((x) => String(x ?? '').trim()).filter(Boolean)
    );
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
  if (typeof o.knowBeforeYouGo === 'string' && o.knowBeforeYouGo.trim()) {
    out.knowBeforeYouGo = o.knowBeforeYouGo.trim().slice(0, 800);
  }
  if (typeof o.whatToBring === 'string' && o.whatToBring.trim()) {
    out.whatToBring = o.whatToBring.trim().slice(0, 500);
  }
  if (Array.isArray(o.whatToBringIds)) {
    out.whatToBringIds = normalizeWhatToBringIds(
      o.whatToBringIds.map((x) => String(x ?? '').trim()).filter(Boolean)
    );
  }
  if (typeof o.requirementsNotes === 'string' && o.requirementsNotes.trim()) {
    out.requirementsNotes = o.requirementsNotes.trim().slice(0, 500);
  }
  if (Array.isArray(o.notSuitableForIds)) {
    out.notSuitableForIds = normalizeNotSuitableForIds(
      o.notSuitableForIds.map((x) => String(x ?? '').trim()).filter(Boolean)
    );
  }
  if (Array.isArray(o.accessibilityFeatureIds)) {
    out.accessibilityFeatureIds = normalizeAccessibilityFeatureIds(
      o.accessibilityFeatureIds.map((x) => String(x ?? '').trim()).filter(Boolean)
    );
  }
  if (typeof o.additionalInfo === 'string' && o.additionalInfo.trim()) {
    out.additionalInfo = o.additionalInfo.trim().slice(0, 800);
  }
  if (typeof o.bookingContactPhoneE164 === 'string' && o.bookingContactPhoneE164.trim()) {
    out.bookingContactPhoneE164 = o.bookingContactPhoneE164.trim().slice(0, 24);
  }
  const ss = o.scheduleStyle;
  if (ss === 'flexible' || ss === 'fixed_slots' || ss === 'on_request') {
    out.scheduleStyle = ss;
  }
  if (typeof o.typicalTimelineNotes === 'string' && o.typicalTimelineNotes.trim()) {
    out.typicalTimelineNotes = o.typicalTimelineNotes.trim();
  }
  if (typeof o.bookingCutoffHoursBeforeStart === 'number' && o.bookingCutoffHoursBeforeStart > 0) {
    out.bookingCutoffHoursBeforeStart = Math.min(168, Math.floor(o.bookingCutoffHoursBeforeStart));
  } else if (typeof o.bookingCutoffHoursBeforeStart === 'string' && o.bookingCutoffHoursBeforeStart.trim()) {
    const n = Number(o.bookingCutoffHoursBeforeStart);
    if (Number.isFinite(n) && n > 0) out.bookingCutoffHoursBeforeStart = Math.min(168, Math.floor(n));
  }
  if (typeof o.departureTimezone === 'string' && o.departureTimezone.trim()) {
    const tz = o.departureTimezone.trim();
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      out.departureTimezone = tz;
    } catch {
      /* ignore invalid IANA */
    }
  }
  if (o.departureTimezoneManual === true) {
    out.departureTimezoneManual = true;
  }
  if (o.destinationPlace && typeof o.destinationPlace === 'object' && !Array.isArray(o.destinationPlace)) {
    const place = o.destinationPlace as Record<string, unknown>;
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    const placeId = typeof place.placeId === 'string' ? place.placeId.trim() : '';
    const city = typeof place.city === 'string' ? place.city.trim() : '';
    const country = typeof place.country === 'string' ? place.country.trim() : '';
    const countryCode = typeof place.countryCode === 'string' ? place.countryCode.trim().toUpperCase() : '';
    const formatted = typeof place.formatted === 'string' ? place.formatted.trim() : '';
    if (
      placeId &&
      city &&
      country &&
      /^[A-Z]{2}$/.test(countryCode) &&
      formatted &&
      Number.isFinite(lat) &&
      lat >= -90 &&
      lat <= 90 &&
      Number.isFinite(lng) &&
      lng >= -180 &&
      lng <= 180
    ) {
      out.destinationPlace = {
        placeId: placeId.slice(0, 256),
        city: city.slice(0, 120),
        country: country.slice(0, 120),
        countryCode,
        formatted: formatted.slice(0, 180),
        lat,
        lng,
      };
    }
  }
  if (Array.isArray(o.galleryImageUrls)) {
    out.galleryImageUrls = o.galleryImageUrls.map((x) => String(x ?? '').trim()).filter(Boolean);
  }
  if (Array.isArray(o.photoSlotLabels)) {
    out.photoSlotLabels = o.photoSlotLabels.map((x) => String(x ?? '').trim().slice(0, 200));
  }
  if (Array.isArray(o.photoOriginalUrls)) {
    out.photoOriginalUrls = o.photoOriginalUrls.map((x) => String(x ?? '').trim());
  }
  if (Array.isArray(o.photoCropSettings)) {
    out.photoCropSettings = o.photoCropSettings.map((row) => {
      if (!row || typeof row !== 'object') return {};
      const r = row as Record<string, unknown>;
      const crop =
        r.crop && typeof r.crop === 'object'
          ? {
              x: Number((r.crop as { x?: unknown }).x) || 0,
              y: Number((r.crop as { y?: unknown }).y) || 0,
            }
          : undefined;
      const zoomN = Number(r.zoom);
      const areaRaw = r.areaPixels ?? r.croppedAreaPixels;
      let areaPixels:
        | { x: number; y: number; width: number; height: number }
        | null
        | undefined;
      if (areaRaw && typeof areaRaw === 'object') {
        const a = areaRaw as Record<string, unknown>;
        const x = Number(a.x);
        const y = Number(a.y);
        const width = Number(a.width);
        const height = Number(a.height);
        if ([x, y, width, height].every((n) => Number.isFinite(n)) && width > 0 && height > 0) {
          areaPixels = { x, y, width, height };
        }
      } else if (areaRaw === null) {
        areaPixels = null;
      }
      return {
        ...(crop ? { crop } : {}),
        ...(Number.isFinite(zoomN) ? { zoom: zoomN } : {}),
        ...(areaPixels !== undefined ? { areaPixels } : {}),
      };
    });
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

  const slotOverrides = parseSlotOverrides(o.slotOverrides);
  if (slotOverrides.length) out.slotOverrides = slotOverrides;

  return out;
}

/** Persist non-empty listing extras (cancellation preset/extra are legacy-only in DB; no longer written). */
export function listingExtrasToDb(extras: ListingExtras | undefined): Record<string, unknown> | null {
  if (!extras) return null;
  const payload: Record<string, unknown> = {};
  const spoken = normalizeSpokenLanguageIds(extras.additionalLanguages);
  if (spoken.length) payload.additionalLanguages = spoken;
  if (extras.venueSetting && extras.venueSetting !== 'unspecified') payload.venueSetting = extras.venueSetting;
  if (extras.accessibilitySummary?.trim()) payload.accessibilitySummary = extras.accessibilitySummary.trim();
  if (extras.minGuestAge?.trim()) payload.minGuestAge = extras.minGuestAge.trim();
  if (extras.knowBeforeYouGo?.trim()) payload.knowBeforeYouGo = extras.knowBeforeYouGo.trim().slice(0, 800);
  if (extras.whatToBring?.trim()) payload.whatToBring = extras.whatToBring.trim().slice(0, 500);
  const bringIds = normalizeWhatToBringIds(extras.whatToBringIds);
  if (bringIds.length) payload.whatToBringIds = bringIds;
  if (extras.requirementsNotes?.trim()) {
    payload.requirementsNotes = extras.requirementsNotes.trim().slice(0, 500);
  }
  const notSuitable = normalizeNotSuitableForIds(extras.notSuitableForIds);
  if (notSuitable.length) payload.notSuitableForIds = notSuitable;
  const a11yIds = normalizeAccessibilityFeatureIds(extras.accessibilityFeatureIds);
  if (a11yIds.length) payload.accessibilityFeatureIds = a11yIds;
  if (extras.additionalInfo?.trim()) payload.additionalInfo = extras.additionalInfo.trim().slice(0, 800);
  // bookingContactPhoneE164 is private (listing_booking_contact) — never persist into public JSON.
  if (extras.scheduleStyle) payload.scheduleStyle = extras.scheduleStyle;
  if (extras.typicalTimelineNotes?.trim()) payload.typicalTimelineNotes = extras.typicalTimelineNotes.trim();
  if (typeof extras.bookingCutoffHoursBeforeStart === 'number' && extras.bookingCutoffHoursBeforeStart > 0) {
    payload.bookingCutoffHoursBeforeStart = Math.min(168, Math.floor(extras.bookingCutoffHoursBeforeStart));
  }
  if (extras.departureTimezone?.trim()) {
    const tz = extras.departureTimezone.trim();
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      payload.departureTimezone = tz;
    } catch {
      /* skip invalid */
    }
  }
  if (extras.departureTimezoneManual === true) {
    payload.departureTimezoneManual = true;
  }
  if (extras.galleryImageUrls?.length) payload.galleryImageUrls = extras.galleryImageUrls;
  if (extras.photoSlotLabels?.some((l) => l.trim())) payload.photoSlotLabels = extras.photoSlotLabels;
  if (extras.photoOriginalUrls?.some((u) => u.trim())) payload.photoOriginalUrls = extras.photoOriginalUrls;
  if (
    extras.photoCropSettings?.some(
      (c) =>
        c &&
        (c.zoom != null ||
          c.crop != null ||
          (c.areaPixels != null && typeof c.areaPixels === 'object'))
    )
  ) {
    payload.photoCropSettings = extras.photoCropSettings;
  }
  if (extras.bookingOptions?.length) payload.bookingOptions = extras.bookingOptions;
  // Always persist when present (including []) so Availability can clear date overrides.
  if (Array.isArray(extras.slotOverrides)) {
    payload.slotOverrides = slotOverridesToDb(extras.slotOverrides) ?? [];
  }
  if (extras.inventoryFamily && extras.inventoryFamily !== 'tour') {
    payload.inventoryFamily = extras.inventoryFamily;
  }
  if (extras.stay && Object.keys(extras.stay).length > 0) {
    // checkInAddress is private (listing_stay_private) — never persist into public JSON.
    const { checkInAddress: _privateAddr, ...publicStay } = extras.stay;
    if (Object.keys(publicStay).length > 0) payload.stay = publicStay;
  }
  return Object.keys(payload).length > 0 ? payload : null;
}

/** Remove exact stay address from extras used on public catalog / PDP reads. */
/** Remove booking contact from extras used on public catalog / PDP reads. */
export function stripPublicBookingContactPhone(
  extras: ListingExtras | undefined
): ListingExtras | undefined {
  if (!extras?.bookingContactPhoneE164) return extras;
  const { bookingContactPhoneE164: _drop, ...rest } = extras;
  return rest;
}

export function stripPublicStayCheckInAddress(extras: ListingExtras | undefined): ListingExtras | undefined {
  if (!extras?.stay?.checkInAddress) return extras;
  const { checkInAddress: _drop, ...restStay } = extras.stay;
  const next: ListingExtras = { ...extras, stay: Object.keys(restStay).length > 0 ? restStay : undefined };
  if (!next.stay) {
    const { stay: _s, ...withoutStay } = next;
    return Object.keys(withoutStay).length > 0 ? withoutStay : undefined;
  }
  return next;
}
