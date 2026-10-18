/** Draft accommodation shape. Multi-unit stays are not bookable until inventory can reserve each unit type. */

export type StayAccommodationMode = 'single' | 'multi';

export type StayUnitDraft = {
  id: string;
  name: string;
  description: string;
  maxGuests: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  amenities: string[];
  nightlyPriceUsd: number | null;
  quantity: number;
  minNights: number;
  archived: boolean;
};

export const STAY_SINGLE_PROPERTY_TYPES = [
  'Apartment',
  'House',
  'Cabin',
  'Room',
  'Cottage',
  'Villa',
  'Other',
] as const;

export const STAY_MULTI_ONLY_PROPERTY_TYPES = [
  'Hotel',
  'Resort',
  'Guesthouse',
  'Apartment complex',
] as const;

export const STAY_MULTI_NOT_BOOKABLE =
  'Several room types can be saved as a draft. Booking more than one accommodation is not available yet, so this property cannot be published.';

export const STAY_MULTI_QUOTE_ERROR = 'This property is not available to book yet.';

const MAX_UNITS = 30;

export function stayAccommodationMode(raw: unknown): StayAccommodationMode {
  return raw === 'multi' ? 'multi' : 'single';
}

export function stayPropertyTypesForMode(mode: StayAccommodationMode): readonly string[] {
  if (mode === 'multi') return [...STAY_MULTI_ONLY_PROPERTY_TYPES, ...STAY_SINGLE_PROPERTY_TYPES];
  return STAY_SINGLE_PROPERTY_TYPES;
}

function optionalCount(raw: unknown, min: number, max: number, step?: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = step === 0.5 ? Math.round(raw * 2) / 2 : Math.floor(raw);
  if (n < min || n > max) return null;
  return n;
}

export function normalizeStayUnit(raw: unknown): StayUnitDraft | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim().slice(0, 80) : '';
  if (!id) return null;
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
  const description = typeof o.description === 'string' ? o.description.trim().slice(0, 400) : '';
  const amenities = Array.isArray(o.amenities)
    ? o.amenities.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 24)
    : [];
  const nightly = optionalCount(o.nightlyPriceUsd, 1, 1_000_000);
  const quantityRaw = optionalCount(o.quantity, 1, 500);
  const minNightsRaw = optionalCount(o.minNights, 1, 365);
  return {
    id,
    name,
    description,
    maxGuests: optionalCount(o.maxGuests, 1, 50),
    bedrooms: optionalCount(o.bedrooms, 0, 30),
    beds: optionalCount(o.beds, 0, 50),
    bathrooms: optionalCount(o.bathrooms, 0, 20, 0.5),
    amenities,
    nightlyPriceUsd: nightly,
    quantity: quantityRaw ?? 1,
    minNights: minNightsRaw ?? 1,
    archived: o.archived === true,
  };
}

export function normalizeStayUnits(raw: unknown): StayUnitDraft[] {
  if (!Array.isArray(raw)) return [];
  const out: StayUnitDraft[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const unit = normalizeStayUnit(row);
    if (!unit || seen.has(unit.id)) continue;
    seen.add(unit.id);
    out.push(unit);
    if (out.length >= MAX_UNITS) break;
  }
  return out;
}

export function activeStayUnits(units: readonly StayUnitDraft[]): StayUnitDraft[] {
  return units.filter((unit) => !unit.archived);
}

export function stayUnitReady(unit: StayUnitDraft): boolean {
  return (
    !unit.archived &&
    unit.name.trim().length > 0 &&
    unit.maxGuests != null &&
    unit.maxGuests >= 1 &&
    unit.nightlyPriceUsd != null &&
    unit.nightlyPriceUsd > 0 &&
    unit.quantity >= 1
  );
}

export function stayUnitsReady(units: readonly StayUnitDraft[]): boolean {
  return activeStayUnits(units).some(stayUnitReady);
}

export function emptyStayUnit(id: string): StayUnitDraft {
  return {
    id,
    name: '',
    description: '',
    maxGuests: null,
    bedrooms: null,
    beds: null,
    bathrooms: null,
    amenities: [],
    nightlyPriceUsd: null,
    quantity: 1,
    minNights: 1,
    archived: false,
  };
}
