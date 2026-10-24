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

export function defaultRentalOperatingDays(): RentalOperatingDay[] {
  return WEEKDAYS.map((day) => ({
    day,
    open: day !== 'sun',
    earliestPickupHm: '09:00',
    latestPickupHm: '17:00',
    earliestReturnHm: '09:00',
    latestReturnHm: '18:00',
  }));
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
  if (typeof o.pickupLat === 'number' && Number.isFinite(o.pickupLat)) out.pickupLat = o.pickupLat;
  if (typeof o.pickupLng === 'number' && Number.isFinite(o.pickupLng)) out.pickupLng = o.pickupLng;
  if (typeof o.returnSameAsPickup === 'boolean') out.returnSameAsPickup = o.returnSameAsPickup;
  if (typeof o.returnAddress === 'string') out.returnAddress = o.returnAddress.trim().slice(0, 240);
  if (typeof o.returnInstructions === 'string') out.returnInstructions = o.returnInstructions.trim().slice(0, 1000);
  if (typeof o.collectionNotes === 'string') out.collectionNotes = o.collectionNotes.trim().slice(0, 1000);
  if (typeof o.idRequired === 'boolean') out.idRequired = o.idRequired;
  if (typeof o.staffAssisted === 'boolean') out.staffAssisted = o.staffAssisted;
  if (o.durationMode === 'hourly' || o.durationMode === 'daily' || o.durationMode === 'both') {
    out.durationMode = o.durationMode;
  }
  if (typeof o.minDurationHours === 'number') out.minDurationHours = Math.max(0, Math.round(o.minDurationHours));
  if (typeof o.maxDurationHours === 'number') out.maxDurationHours = Math.max(0, Math.round(o.maxDurationHours));
  if (typeof o.minDurationDays === 'number') out.minDurationDays = Math.max(0, Math.round(o.minDurationDays));
  if (typeof o.maxDurationDays === 'number') out.maxDurationDays = Math.max(0, Math.round(o.maxDurationDays));
  if (typeof o.calendarDayRentals === 'boolean') out.calendarDayRentals = o.calendarDayRentals;
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
  // Authoritative: no deposit → neutralize amount/method (keep free-text disclosure notes).
  if (out.depositRequired === false) {
    out.depositAmountMinor = null;
    out.depositCollectionMethod = null;
    out.depositCurrency = undefined;
    out.depositReturnNotes = undefined;
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

  return out;
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
  const pricing = effectiveVariantPricing(rental, variant);
  const mode = rental.durationMode ?? 'daily';
  if (mode === 'hourly' || mode === 'both') {
    if (!(pricing.pricePerHourMinor != null && pricing.pricePerHourMinor > 0)) return false;
  }
  if (mode === 'daily' || mode === 'both') {
    if (!(pricing.pricePerDayMinor != null && pricing.pricePerDayMinor > 0)) return false;
  }
  return true;
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
  if (rental.depositAmountMinor != null && rental.depositAmountMinor > 0) return true;
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

/**
 * Lowest positive per-unit rate across variants for the primary duration unit.
 * Authoritative for listing.price.startingFrom on rental drafts (major currency units).
 */
export function rentalStartingFromMajor(rental: RentalDetails): number {
  const mode = rental.durationMode ?? 'daily';
  const preferHour = mode === 'hourly';
  let best: number | null = null;
  const variants = rental.variants?.length ? rental.variants : [createDefaultRentalVariant()];
  for (const v of variants) {
    const p = effectiveVariantPricing(rental, v);
    const minor = preferHour
      ? p.pricePerHourMinor
      : p.pricePerDayMinor ?? (mode === 'both' ? p.pricePerHourMinor : null);
    if (minor != null && minor > 0 && (best == null || minor < best)) best = minor;
  }
  if (best == null) return 0;
  return best / 100;
}

/** Clear deposit amount/method when supplier selects no deposit. Keeps optional free-text notes. */
export function clearRentalDepositAmounts(_rental?: RentalDetails): Partial<RentalDetails> {
  return {
    depositRequired: false,
    depositAmountMinor: null,
    depositCollectionMethod: null,
    depositCurrency: undefined,
    depositReturnNotes: undefined,
  };
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
