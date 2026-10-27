import type {
  RentalDetails,
  RentalOperatingDay,
  RentalPricing,
  RentalVariant,
  RentalWeekday,
} from '../types/rental';
import { isRentalCategoryId } from '../types/rental';
import { newListingCreationId } from './listing-creation-persist';

const WEEKDAYS: RentalWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** New listings start with every day closed so suppliers choose operating days explicitly. */
export function defaultRentalOperatingDays(): RentalOperatingDay[] {
  return WEEKDAYS.map((day) => ({
    day,
    open: false,
    earliestPickupHm: '09:00',
    latestPickupHm: '17:00',
    earliestReturnHm: '09:00',
    latestReturnHm: '18:00',
  }));
}

export function rentalFiniteCoord(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

/** A chosen suggestion sets the address and the pin together. Instructions are left untouched. */
export function applyRentalAddressSelection(
  rental: RentalDetails,
  which: 'pickup' | 'return',
  selection: { address: string; lat: number; lng: number },
): RentalDetails {
  const address = selection.address.trim().slice(0, 240);
  const lat = rentalFiniteCoord(selection.lat, -90, 90);
  const lng = rentalFiniteCoord(selection.lng, -180, 180);
  if (which === 'return') {
    return {
      ...rental,
      returnSameAsPickup: false,
      returnAddress: address,
      ...(lat != null && lng != null ? { returnLat: lat, returnLng: lng } : {}),
    };
  }
  return {
    ...rental,
    pickupAddress: address,
    ...(lat != null && lng != null ? { pickupLat: lat, pickupLng: lng } : {}),
  };
}

/** Marker drag or map click moves the pin only. The saved address text stays. */
export function applyRentalCollectionPin(
  rental: RentalDetails,
  which: 'pickup' | 'return',
  point: { lat: number; lng: number },
): RentalDetails {
  const lat = rentalFiniteCoord(point.lat, -90, 90);
  const lng = rentalFiniteCoord(point.lng, -180, 180);
  if (lat == null || lng == null) return rental;
  if (which === 'return') return { ...rental, returnLat: lat, returnLng: lng };
  return { ...rental, pickupLat: lat, pickupLng: lng };
}

export function emptyRentalDetails(): RentalDetails {
  return {
    returnSameAsPickup: true,
    calendarDayRentals: true,
    durationMode: 'daily',
    bufferMinutes: 0,
    bookingNoticeHours: 0,
    operatingDays: defaultRentalOperatingDays(),
    sharedPricing: {},
    variants: [],
    highlights: [],
    inclusions: [],
    extras: [],
    specifications: {},
    requirements: {},
    creatorComplete: false,
  };
}

export function newRentalVariantId(): string {
  return newListingCreationId();
}

export function createDefaultRentalVariant(name = 'Standard'): RentalVariant {
  return {
    id: newRentalVariantId(),
    name,
    quantity: 1,
    attributes: {},
    pricingOverride: null,
  };
}

function normalizePricing(raw: unknown): RentalPricing | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: RentalPricing = {};
  if (typeof o.currency === 'string' && o.currency.trim()) out.currency = o.currency.trim().slice(0, 3).toUpperCase();
  if (typeof o.pricePerHourMinor === 'number' && Number.isFinite(o.pricePerHourMinor)) {
    out.pricePerHourMinor = Math.max(0, Math.round(o.pricePerHourMinor));
  } else if (o.pricePerHourMinor === null) {
    out.pricePerHourMinor = null;
  }
  if (typeof o.pricePerDayMinor === 'number' && Number.isFinite(o.pricePerDayMinor)) {
    out.pricePerDayMinor = Math.max(0, Math.round(o.pricePerDayMinor));
  } else if (o.pricePerDayMinor === null) {
    out.pricePerDayMinor = null;
  }
  if (typeof o.multiDayDiscountPercent === 'number' && Number.isFinite(o.multiDayDiscountPercent)) {
    out.multiDayDiscountPercent = Math.max(0, Math.min(90, Math.round(o.multiDayDiscountPercent)));
  }
  if (typeof o.multiDayDiscountMinDays === 'number' && Number.isFinite(o.multiDayDiscountMinDays)) {
    out.multiDayDiscountMinDays = Math.max(2, Math.min(90, Math.round(o.multiDayDiscountMinDays)));
  }
  return out;
}

function normalizeVariant(raw: unknown): RentalVariant | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : newRentalVariantId();
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 80) : 'Option';
  const quantity =
    typeof o.quantity === 'number' && Number.isFinite(o.quantity)
      ? Math.max(0, Math.min(9999, Math.floor(o.quantity)))
      : 0;
  const attributes: Record<string, string> = {};
  if (o.attributes && typeof o.attributes === 'object' && !Array.isArray(o.attributes)) {
    for (const [k, v] of Object.entries(o.attributes as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) attributes[k.slice(0, 40)] = v.trim().slice(0, 120);
    }
  }
  const pricingOverride =
    o.pricingOverride === null ? null : normalizePricing(o.pricingOverride) ?? null;
  return {
    id,
    name,
    description:
      typeof o.description === 'string' && o.description.trim()
        ? o.description.trim().slice(0, 500)
        : undefined,
    attributes,
    quantity,
    pricingOverride,
    availabilityOverrideNote:
      typeof o.availabilityOverrideNote === 'string' && o.availabilityOverrideNote.trim()
        ? o.availabilityOverrideNote.trim().slice(0, 240)
        : undefined,
  };
}

export function normalizeRentalDetails(raw: unknown): RentalDetails | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: RentalDetails = emptyRentalDetails();

  if (typeof o.category === 'string' && isRentalCategoryId(o.category)) out.category = o.category;
  if (typeof o.itemType === 'string' && o.itemType.trim()) out.itemType = o.itemType.trim().slice(0, 60);
  if (typeof o.customItemType === 'string' && o.customItemType.trim()) {
    out.customItemType = o.customItemType.trim().slice(0, 80);
  }
  if (typeof o.shortIntro === 'string' && o.shortIntro.trim()) out.shortIntro = o.shortIntro.trim().slice(0, 280);
  if (typeof o.pickupAddress === 'string') out.pickupAddress = o.pickupAddress.trim().slice(0, 240);
  if (typeof o.pickupInstructions === 'string') out.pickupInstructions = o.pickupInstructions.trim().slice(0, 1000);
  const pickupLat = rentalFiniteCoord(o.pickupLat, -90, 90);
  const pickupLng = rentalFiniteCoord(o.pickupLng, -180, 180);
  if (pickupLat != null) out.pickupLat = pickupLat;
  if (pickupLng != null) out.pickupLng = pickupLng;
  if (typeof o.returnSameAsPickup === 'boolean') out.returnSameAsPickup = o.returnSameAsPickup;
  if (typeof o.returnAddress === 'string') out.returnAddress = o.returnAddress.trim().slice(0, 240);
  if (typeof o.returnInstructions === 'string') out.returnInstructions = o.returnInstructions.trim().slice(0, 1000);
  const returnLat = rentalFiniteCoord(o.returnLat, -90, 90);
  const returnLng = rentalFiniteCoord(o.returnLng, -180, 180);
  if (returnLat != null) out.returnLat = returnLat;
  if (returnLng != null) out.returnLng = returnLng;
  if (typeof o.collectionNotes === 'string') out.collectionNotes = o.collectionNotes.trim().slice(0, 1000);
  if (typeof o.idRequired === 'boolean') out.idRequired = o.idRequired;
  if (typeof o.staffAssisted === 'boolean') out.staffAssisted = o.staffAssisted;
  if (typeof o.returnStaffAssisted === 'boolean') out.returnStaffAssisted = o.returnStaffAssisted;
  if (typeof o.returnCollectionNotes === 'string') {
    out.returnCollectionNotes = o.returnCollectionNotes.trim().slice(0, 1000);
  }
  if (o.durationMode === 'hourly' || o.durationMode === 'daily' || o.durationMode === 'both') {
    out.durationMode = o.durationMode;
  }
  if (typeof o.minDurationHours === 'number') out.minDurationHours = Math.max(0, Math.round(o.minDurationHours));
  if (typeof o.maxDurationHours === 'number') out.maxDurationHours = Math.max(0, Math.round(o.maxDurationHours));
  if (typeof o.minDurationDays === 'number') out.minDurationDays = Math.max(0, Math.round(o.minDurationDays));
  if (typeof o.maxDurationDays === 'number') out.maxDurationDays = Math.max(0, Math.round(o.maxDurationDays));
  // Quotes and availability count calendar dates. A 24-hour period is not enforceable, so it is not stored.
  out.calendarDayRentals = true;
  if (typeof o.bufferMinutes === 'number' && Number.isFinite(o.bufferMinutes)) {
    out.bufferMinutes = Math.max(0, Math.min(24 * 60, Math.round(o.bufferMinutes)));
  }
  if (typeof o.bookingNoticeHours === 'number' && Number.isFinite(o.bookingNoticeHours)) {
    out.bookingNoticeHours = Math.max(0, Math.min(168, Math.round(o.bookingNoticeHours)));
  }
  if (typeof o.rentalRules === 'string') out.rentalRules = o.rentalRules.trim().slice(0, 4000);
  if (typeof o.cancellationPreset === 'string') out.cancellationPreset = o.cancellationPreset.trim().slice(0, 40);
  if (typeof o.depositDisclosure === 'string') out.depositDisclosure = o.depositDisclosure.trim().slice(0, 1000);
  if (typeof o.insuranceDisclosure === 'string') out.insuranceDisclosure = o.insuranceDisclosure.trim().slice(0, 1000);
  if (typeof o.depositRequired === 'boolean') out.depositRequired = o.depositRequired;
  if (typeof o.depositAmountMinor === 'number' && Number.isFinite(o.depositAmountMinor)) {
    out.depositAmountMinor = Math.max(0, Math.round(o.depositAmountMinor));
  } else if (o.depositAmountMinor === null) {
    out.depositAmountMinor = null;
  }
  if (typeof o.depositCurrency === 'string' && o.depositCurrency.trim()) {
    out.depositCurrency = o.depositCurrency.trim().slice(0, 3).toUpperCase();
  }
  if (
    o.depositCollectionMethod === 'cash_at_pickup' ||
    o.depositCollectionMethod === 'card_at_pickup' ||
    o.depositCollectionMethod === 'other'
  ) {
    out.depositCollectionMethod = o.depositCollectionMethod;
  } else if (o.depositCollectionMethod === null) {
    out.depositCollectionMethod = null;
  }
  if (typeof o.depositReturnNotes === 'string') out.depositReturnNotes = o.depositReturnNotes.trim().slice(0, 500);
  if (
    o.accessibilityStatus === 'not_specified' ||
    o.accessibilityStatus === 'not_applicable' ||
    o.accessibilityStatus === 'details_provided'
  ) {
    out.accessibilityStatus = o.accessibilityStatus;
  }
  if (Array.isArray(o.accessibilityFeatures)) {
    out.accessibilityFeatures = o.accessibilityFeatures
      .map((item) => String(item ?? '').trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 12);
  }
  if (typeof o.accessibilityNotes === 'string') {
    out.accessibilityNotes = o.accessibilityNotes.trim().slice(0, 1000);
  }
  if (
    o.difficulty === 'easy' ||
    o.difficulty === 'moderate' ||
    o.difficulty === 'challenging' ||
    o.difficulty === 'not_applicable'
  ) {
    out.difficulty = o.difficulty;
  } else if (o.difficulty === null) {
    out.difficulty = null;
  }
  if (typeof o.suitableFor === 'string') out.suitableFor = o.suitableFor.trim().slice(0, 500);
  if (typeof o.notSuitableFor === 'string') out.notSuitableFor = o.notSuitableFor.trim().slice(0, 500);
  if (Array.isArray(o.restrictions)) {
    out.restrictions = o.restrictions
      .map((item) => String(item ?? '').trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 16);
  }
  if (typeof o.insuranceIncluded === 'boolean') out.insuranceIncluded = o.insuranceIncluded;
  if (typeof o.insuranceCoverageNotes === 'string') {
    out.insuranceCoverageNotes = o.insuranceCoverageNotes.trim().slice(0, 1000);
  }
  if (typeof o.insuranceExclusions === 'string') {
    out.insuranceExclusions = o.insuranceExclusions.trim().slice(0, 1000);
  }
  if (typeof o.insuranceExcessNotes === 'string') {
    out.insuranceExcessNotes = o.insuranceExcessNotes.trim().slice(0, 500);
  }
  if (o.creatorComplete === true) out.creatorComplete = true;

  if (Array.isArray(o.highlights)) {
    out.highlights = o.highlights.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 12);
  }
  if (Array.isArray(o.inclusions)) {
    out.inclusions = o.inclusions.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 24);
  }
  if (o.specifications && typeof o.specifications === 'object' && !Array.isArray(o.specifications)) {
    const specs: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.specifications as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) specs[k.slice(0, 40)] = v.trim().slice(0, 160);
    }
    out.specifications = specs;
  }
  if (typeof o.skillSuitability === 'string' && o.skillSuitability.trim()) {
    out.skillSuitability = o.skillSuitability.trim().slice(0, 160);
  }
  const legacySkill = out.specifications?.skillLevel?.trim();
  if (!out.skillSuitability && legacySkill) out.skillSuitability = legacySkill.slice(0, 160);
  if (out.specifications?.skillLevel) {
    const specs = { ...out.specifications };
    delete specs.skillLevel;
    out.specifications = specs;
  }
  if (o.requirements && typeof o.requirements === 'object' && !Array.isArray(o.requirements)) {
    const req: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.requirements as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) req[k.slice(0, 40)] = v.trim().slice(0, 240);
    }
    out.requirements = req;
  }

  const shared = normalizePricing(o.sharedPricing);
  if (shared) out.sharedPricing = shared;

  if (Array.isArray(o.operatingDays)) {
    const days: RentalOperatingDay[] = [];
    for (const row of o.operatingDays) {
      if (!row || typeof row !== 'object') continue;
      const d = row as Record<string, unknown>;
      const day = d.day;
      if (typeof day !== 'string' || !WEEKDAYS.includes(day as RentalWeekday)) continue;
      days.push({
        day: day as RentalWeekday,
        open: d.open !== false,
        earliestPickupHm: typeof d.earliestPickupHm === 'string' ? d.earliestPickupHm.slice(0, 5) : '09:00',
        latestPickupHm: typeof d.latestPickupHm === 'string' ? d.latestPickupHm.slice(0, 5) : '17:00',
        earliestReturnHm: typeof d.earliestReturnHm === 'string' ? d.earliestReturnHm.slice(0, 5) : '09:00',
        latestReturnHm: typeof d.latestReturnHm === 'string' ? d.latestReturnHm.slice(0, 5) : '18:00',
      });
    }
    if (days.length > 0) out.operatingDays = days;
  }

  if (Array.isArray(o.variants)) {
    out.variants = o.variants.map(normalizeVariant).filter((v): v is RentalVariant => Boolean(v)).slice(0, 40);
  }

  if (Array.isArray(o.extras)) {
    out.extras = o.extras
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const e = row as Record<string, unknown>;
        const id = typeof e.id === 'string' && e.id.trim() ? e.id.trim() : newRentalVariantId();
        const name = typeof e.name === 'string' && e.name.trim() ? e.name.trim().slice(0, 80) : '';
        if (!name) return null;
        return {
          id,
          name,
          priceMinor:
            typeof e.priceMinor === 'number' && Number.isFinite(e.priceMinor)
              ? Math.max(0, Math.round(e.priceMinor))
              : null,
          optional: e.optional !== false,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .slice(0, 20);
  }

  return inheritRentalOptionRates(out);
}

/**
 * Copy a positive shared hour or day rate onto options that do not already have that rate.
 * An existing option price stays as saved. Never writes 0.
 */
export function inheritRentalOptionRates(rental: RentalDetails): RentalDetails {
  const sharedDay = rental.sharedPricing?.pricePerDayMinor;
  const sharedHour = rental.sharedPricing?.pricePerHourMinor;
  const day = typeof sharedDay === 'number' && sharedDay > 0 ? sharedDay : null;
  const hour = typeof sharedHour === 'number' && sharedHour > 0 ? sharedHour : null;
  if ((day == null && hour == null) || !(rental.variants && rental.variants.length > 0)) return rental;
  let changed = false;
  const variants = rental.variants.map((variant) => {
    const next = { ...(variant.pricingOverride ?? {}) };
    let rowChanged = false;
    if (day != null && rentalOptionDayPriceMinor(variant) == null) {
      next.pricePerDayMinor = day;
      rowChanged = true;
    }
    if (hour != null && rentalOptionHourPriceMinor(variant) == null) {
      next.pricePerHourMinor = hour;
      rowChanged = true;
    }
    if (!rowChanged) return variant;
    changed = true;
    return { ...variant, pricingOverride: next };
  });
  return changed ? { ...rental, variants } : rental;
}

export function rentalOptionDayPriceMinor(variant: RentalVariant): number | null {
  const day = variant.pricingOverride?.pricePerDayMinor;
  return typeof day === 'number' && Number.isFinite(day) && day > 0 ? day : null;
}

export function rentalOptionHourPriceMinor(variant: RentalVariant): number | null {
  const hour = variant.pricingOverride?.pricePerHourMinor;
  return typeof hour === 'number' && Number.isFinite(hour) && hour > 0 ? hour : null;
}

/** True when the option has every rate its listing duration mode uses. */
export function rentalOptionRatesReady(variant: RentalVariant, rental: RentalDetails): boolean {
  const mode = rental.durationMode ?? 'daily';
  if ((mode === 'hourly' || mode === 'both') && rentalOptionHourPriceMinor(variant) == null) return false;
  if ((mode === 'daily' || mode === 'both') && rentalOptionDayPriceMinor(variant) == null) return false;
  return true;
}

export function rentalMissingOptionRateMessage(rental: RentalDetails): string | null {
  const variants = rental.variants ?? [];
  if (!variants.some((variant) => !rentalOptionRatesReady(variant, rental))) return null;
  const mode = rental.durationMode ?? 'daily';
  if (mode === 'hourly') return 'Each option needs a price per hour.';
  if (mode === 'both') return 'Each option needs a price per hour and a price per day.';
  return 'Each option needs a price per day.';
}

export function rentalDurationFieldIssue(
  min: number | null | undefined,
  max: number | null | undefined,
  unit: 'hours' | 'days',
): string | null {
  if (!(typeof min === 'number' && min >= 1)) {
    return unit === 'hours' ? 'Set a minimum hourly duration.' : 'Set a minimum daily duration.';
  }
  if (!(typeof max === 'number' && max >= min)) {
    return unit === 'hours' ? 'Maximum hours must be at least the minimum.' : 'Maximum days must be at least the minimum.';
  }
  return null;
}

/** Insert a new option or replace the one with the same id. Other options stay untouched. */
export function upsertRentalVariant(variants: RentalVariant[], variant: RentalVariant): RentalVariant[] {
  const exists = variants.some((row) => row.id === variant.id);
  if (!exists) return [...variants, variant];
  return variants.map((row) => (row.id === variant.id ? variant : row));
}

export function ensureRentalHasDefaultVariant(rental: RentalDetails): RentalDetails {
  if ((rental.variants?.length ?? 0) > 0) return rental;
  return { ...rental, variants: [createDefaultRentalVariant('Standard')] };
}

export function effectiveVariantPricing(
  rental: RentalDetails,
  variant: RentalVariant
): RentalPricing {
  const shared = rental.sharedPricing ?? {};
  const over = variant.pricingOverride;
  if (!over) return shared;
  return {
    currency: over.currency ?? shared.currency,
    pricePerHourMinor:
      over.pricePerHourMinor !== undefined && over.pricePerHourMinor !== null
        ? over.pricePerHourMinor
        : shared.pricePerHourMinor,
    pricePerDayMinor:
      over.pricePerDayMinor !== undefined && over.pricePerDayMinor !== null
        ? over.pricePerDayMinor
        : shared.pricePerDayMinor,
    multiDayDiscountPercent: over.multiDayDiscountPercent ?? shared.multiDayDiscountPercent,
    multiDayDiscountMinDays: over.multiDayDiscountMinDays ?? shared.multiDayDiscountMinDays,
  };
}

export function formatMinorAsEuro(minor: number | null | undefined): string {
  if (minor == null || !Number.isFinite(minor)) return '—';
  return `€${(minor / 100).toFixed(minor % 100 === 0 ? 0 : 2)}`;
}

export function rentalVariantComplete(variant: RentalVariant, rental: RentalDetails): boolean {
  if (!variant.name.trim()) return false;
  if (!Number.isFinite(variant.quantity) || variant.quantity < 1) return false;
  return rentalOptionRatesReady(variant, rental);
}

const DAY_SHORT: Record<RentalWeekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

function hoursFingerprint(day: RentalOperatingDay): string {
  return [
    day.earliestPickupHm ?? '',
    day.latestPickupHm ?? '',
    day.earliestReturnHm ?? '',
    day.latestReturnHm ?? '',
  ].join('|');
}

export type RentalHoursWindow = {
  earliestPickupHm: string;
  latestPickupHm: string;
  earliestReturnHm: string;
  latestReturnHm: string;
};

export function rentalHoursWindow(day: RentalOperatingDay): RentalHoursWindow {
  return {
    earliestPickupHm: day.earliestPickupHm ?? '09:00',
    latestPickupHm: day.latestPickupHm ?? '17:00',
    earliestReturnHm: day.earliestReturnHm ?? '09:00',
    latestReturnHm: day.latestReturnHm ?? '18:00',
  };
}

export function rentalHoursWindowsEqual(a: RentalHoursWindow, b: RentalHoursWindow): boolean {
  return (
    a.earliestPickupHm === b.earliestPickupHm &&
    a.latestPickupHm === b.latestPickupHm &&
    a.earliestReturnHm === b.earliestReturnHm &&
    a.latestReturnHm === b.latestReturnHm
  );
}

/**
 * The window shared by the most open days. A tie keeps the earliest day in the week.
 * Reading a saved schedule does not rewrite it.
 */
export function rentalStandardHours(days: RentalOperatingDay[]): RentalHoursWindow {
  const open = days.filter((day) => day.open);
  const pool = open.length > 0 ? open : days;
  let best: { count: number; firstIndex: number; window: RentalHoursWindow } | null = null;
  const counts = new Map<string, { count: number; firstIndex: number; window: RentalHoursWindow }>();
  pool.forEach((day, index) => {
    const window = rentalHoursWindow(day);
    const key = [window.earliestPickupHm, window.latestPickupHm, window.earliestReturnHm, window.latestReturnHm].join('|');
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    counts.set(key, { count: 1, firstIndex: index, window: rentalHoursWindow(day) });
  });
  for (const row of counts.values()) {
    if (!best || row.count > best.count || (row.count === best.count && row.firstIndex < best.firstIndex)) {
      best = row;
    }
  }
  return (
    best?.window ?? {
      earliestPickupHm: '09:00',
      latestPickupHm: '17:00',
      earliestReturnHm: '09:00',
      latestReturnHm: '18:00',
    }
  );
}

/** Open days whose hours differ from the shared window. Closed days stay untouched. */
export function rentalHourExceptions(days: RentalOperatingDay[]): RentalOperatingDay[] {
  const standard = rentalStandardHours(days);
  return days.filter((day) => day.open && !rentalHoursWindowsEqual(rentalHoursWindow(day), standard));
}

/** Apply a new shared window to open days that still use it. Custom days and closed days stay as saved. */
export function applyRentalStandardHours(days: RentalOperatingDay[], next: RentalHoursWindow): RentalOperatingDay[] {
  const open = days.some((day) => day.open);
  if (!open) return days.map((day) => ({ ...day, ...next }));
  const current = rentalStandardHours(days);
  return days.map((day) => {
    if (!day.open || !rentalHoursWindowsEqual(rentalHoursWindow(day), current)) return day;
    return { ...day, ...next };
  });
}

/** Opening a day gives it the current standard hours. Closing keeps its saved times. */
export function toggleRentalOperatingDay(days: RentalOperatingDay[], dayId: RentalWeekday): RentalOperatingDay[] {
  const standard = rentalStandardHours(days);
  return days.map((day) => {
    if (day.day !== dayId) return day;
    if (day.open) return { ...day, open: false };
    return { ...day, open: true, ...standard };
  });
}

export function setRentalDayHours(
  days: RentalOperatingDay[],
  dayId: RentalWeekday,
  next: RentalHoursWindow,
): RentalOperatingDay[] {
  return days.map((day) => (day.day === dayId ? { ...day, open: true, ...next } : day));
}

export function copyRentalDayHours(
  days: RentalOperatingDay[],
  from: RentalWeekday,
  to: RentalWeekday,
): RentalOperatingDay[] {
  if (from === to) return days;
  const source = days.find((day) => day.day === from);
  if (!source) return days;
  return setRentalDayHours(days, to, rentalHoursWindow(source));
}

/** Apply one day's pickup/return window onto other selected days (opens them if needed). */
export function applyRentalDayHoursToDays(
  days: RentalOperatingDay[],
  sourceDayId: RentalWeekday,
  targetDayIds: RentalWeekday[],
): RentalOperatingDay[] {
  const source = days.find((day) => day.day === sourceDayId);
  if (!source) return days;
  const window = rentalHoursWindow(source);
  const targets = new Set(targetDayIds.filter((id) => id !== sourceDayId));
  if (targets.size === 0) return days;
  return days.map((day) => (targets.has(day.day) ? { ...day, open: true, ...window } : day));
}

export function resetRentalHourOverrides(days: RentalOperatingDay[]): RentalOperatingDay[] {
  const standard = rentalStandardHours(days);
  return days.map((day) => (day.open ? { ...day, ...standard } : day));
}

/** Compact preview lines — groups consecutive open days that share identical hours. */
export function groupRentalOperatingHours(days: RentalOperatingDay[]): string[] {
  const open = days.filter((d) => d.open);
  if (open.length === 0) return [];
  const groups: { days: RentalWeekday[]; fingerprint: string; sample: RentalOperatingDay }[] = [];
  for (const day of open) {
    const fp = hoursFingerprint(day);
    const last = groups[groups.length - 1];
    if (last && last.fingerprint === fp) {
      last.days.push(day.day);
    } else {
      groups.push({ days: [day.day], fingerprint: fp, sample: day });
    }
  }
  return groups.map((g) => {
    const dayLabel =
      g.days.length === 1
        ? DAY_SHORT[g.days[0]]
        : `${DAY_SHORT[g.days[0]]}–${DAY_SHORT[g.days[g.days.length - 1]]}`;
    const s = g.sample;
    return `${dayLabel}: pickup ${s.earliestPickupHm ?? '—'}–${s.latestPickupHm ?? '—'}, return ${s.earliestReturnHm ?? '—'}–${s.latestReturnHm ?? '—'}`;
  });
}

/**
 * Concise option subtitle: quantity + attributes that are not already in the option name.
 * Avoids "Standard · 5 units · S · Option S" duplication.
 */
export function rentalVariantMetaLine(
  variant: RentalVariant,
  attributeLabels: { key: string; label: string }[] = []
): string {
  const name = variant.name.trim().toLowerCase();
  const attrs = variant.attributes ?? {};
  const parts: string[] = [];
  const qty = Number.isFinite(variant.quantity) ? Math.max(0, Math.floor(variant.quantity)) : 0;
  parts.push(`${qty} ${qty === 1 ? 'unit' : 'units'}`);
  for (const key of attributeLabels.map((a) => a.key)) {
    const value = (attrs[key] ?? '').trim();
    if (!value) continue;
    if (name && (name === value.toLowerCase() || name.includes(value.toLowerCase()))) continue;
    parts.push(value);
  }
  return parts.join(' · ');
}

export function rentalHasDepositInfo(rental: RentalDetails): boolean {
  if (rental.depositRequired === true) return true;
  if ((rental.depositDisclosure ?? '').trim()) return true;
  if (
    rental.depositRequired == null &&
    rental.depositAmountMinor != null &&
    rental.depositAmountMinor > 0
  ) {
    return true;
  }
  return false;
}

export function rentalHasInsuranceInfo(rental: RentalDetails): boolean {
  if (rental.insuranceIncluded != null) return true;
  if ((rental.insuranceDisclosure ?? '').trim()) return true;
  if ((rental.insuranceCoverageNotes ?? '').trim()) return true;
  if ((rental.insuranceExclusions ?? '').trim()) return true;
  if ((rental.insuranceExcessNotes ?? '').trim()) return true;
  return false;
}

function lowestPositiveRate(
  rental: RentalDetails,
  pick: (pricing: RentalPricing) => number | null | undefined,
): number | null {
  let best: number | null = null;
  const variants = rental.variants?.length ? rental.variants : [createDefaultRentalVariant()];
  for (const variant of variants) {
    const minor = pick(effectiveVariantPricing(rental, variant));
    if (typeof minor === 'number' && minor > 0 && (best == null || minor < best)) best = minor;
  }
  return best;
}

/** Lowest positive option day price, in minor units. Empty option lists still read a shared day price. */
export function rentalLowestDayPriceMinor(rental: RentalDetails): number | null {
  return lowestPositiveRate(rental, (pricing) => pricing.pricePerDayMinor);
}

/** Lowest positive option hour price, in minor units. */
export function rentalLowestHourPriceMinor(rental: RentalDetails): number | null {
  return lowestPositiveRate(rental, (pricing) => pricing.pricePerHourMinor);
}

/**
 * Lowest applicable option rate for the listing duration mode.
 * Hourly listings use the hour rate. Daily and combined listings use the day rate.
 * Authoritative for listing.price.startingFrom on rental drafts (major currency units).
 */
export function rentalStartingFromMajor(rental: RentalDetails): number {
  const mode = rental.durationMode ?? 'daily';
  const best = mode === 'hourly' ? rentalLowestHourPriceMinor(rental) : rentalLowestDayPriceMinor(rental);
  if (best == null) return 0;
  return best / 100;
}

/**
 * Mark the listing as having no deposit.
 * Amount, method, and return notes stay stored so switching back does not wipe them.
 * Customer copy only shows those fields when a deposit is required.
 */
export function clearRentalDepositAmounts(_rental?: RentalDetails): Partial<RentalDetails> {
  return { depositRequired: false };
}

/**
 * True when a free-text skill line disagrees with the chosen difficulty.
 * A range such as "beginner to intermediate" does not conflict with Moderate.
 */
export function rentalSkillConflictsDifficulty(
  difficulty: RentalDetails['difficulty'],
  skill: string | null | undefined,
): boolean {
  const text = (skill ?? '').trim().toLowerCase();
  if (!text || !difficulty || difficulty === 'not_applicable') return false;
  const beginner = /\b(beginner|novice|easy)\b/.test(text);
  const advanced = /\b(advanced|expert|challenging)\b/.test(text);
  const middle = /\b(intermediate|moderate)\b/.test(text);
  if (difficulty === 'easy') return advanced && !beginner && !middle;
  if (difficulty === 'challenging') return beginner && !advanced && !middle;
  return false;
}

/** Skill line customers should see. Hides duplicates and lines that contradict difficulty. */
export function rentalCustomerSkillSuitability(rental: RentalDetails): string | null {
  const skill = (rental.skillSuitability ?? rental.specifications?.skillLevel ?? '').trim();
  if (!skill) return null;
  if (rentalSkillConflictsDifficulty(rental.difficulty, skill)) return null;
  if (rental.difficulty === 'easy' && /^easy$/i.test(skill)) return null;
  if (rental.difficulty === 'moderate' && /^moderate$/i.test(skill)) return null;
  if (rental.difficulty === 'challenging' && /^challenging$/i.test(skill)) return null;
  return skill;
}

/** Parse HH:MM to minutes from midnight; null if invalid. */
export function parseHmToMinutes(hm: string | null | undefined): number | null {
  if (!hm || typeof hm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Validate pickup/return windows on open days.
 * Latest must be after earliest for each window. Returns first issue or null.
 */
export function rentalOperatingHoursIssue(days: RentalOperatingDay[] | undefined): string | null {
  for (const d of days ?? []) {
    if (!d.open) continue;
    const ep = parseHmToMinutes(d.earliestPickupHm);
    const lp = parseHmToMinutes(d.latestPickupHm);
    const er = parseHmToMinutes(d.earliestReturnHm);
    const lr = parseHmToMinutes(d.latestReturnHm);
    const label = DAY_SHORT[d.day] ?? d.day;
    if (ep == null || lp == null) return `Set valid pickup hours for ${label}.`;
    if (er == null || lr == null) return `Set valid return hours for ${label}.`;
    if (lp <= ep) return `Pickup “until” must be after “from” on ${label}.`;
    if (lr <= er) return `Return “until” must be after “from” on ${label}.`;
  }
  return null;
}

/**
 * Billable example total for earnings UI — not a checkout quote.
 * daysOrHours × units × unitMinor, with optional multi-day discount on daily rates.
 */
export function rentalIllustrativeTotalMinor(args: {
  unitMinor: number;
  units: number;
  durationCount: number;
  mode: 'hour' | 'day';
  multiDayDiscountPercent?: number | null;
  multiDayDiscountMinDays?: number | null;
}): number {
  const { unitMinor, units, durationCount, mode } = args;
  if (!(unitMinor > 0) || !(units > 0) || !(durationCount > 0)) return 0;
  let gross = Math.round(unitMinor * units * durationCount);
  if (mode === 'day') {
    const pct = args.multiDayDiscountPercent ?? 0;
    const minDays = args.multiDayDiscountMinDays ?? 0;
    if (pct > 0 && durationCount >= minDays) {
      gross = Math.round(gross * (1 - Math.min(90, pct) / 100));
    }
  }
  return Math.max(0, gross);
}
