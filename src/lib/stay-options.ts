/**
 * Accommodation options and seasonal schedules stored on a stay.
 * One option with quantity 1 is projected onto the legacy stay fields checkout already prices.
 * More than one option, or quantity above 1, is saved and is not bookable: inventory is still one unit per listing.
 */

import {
  normalizeStayBedMix,
  normalizeStaySleepingAreas,
  stayBedCount,
  stayBedSummary,
  stayMixFromAreas,
  staySleepCapacity,
  type StayBedMix,
  type StaySleepingArea,
} from './stay-beds';
import type { StayUnitDraft } from './stay-accommodation';
import {
  normalizeStaySeasons,
  type StayAvailabilityMode,
  type StaySeasonWindow,
} from './stay-season-quote';

export const STAY_OPTIONS_MAX = 12;
export const STAY_SCHEDULES_MAX = 12;

export type StayAccommodationOption = {
  id: string;
  name: string;
  description: string;
  propertyType: string;
  maxGuests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  bedMix: StayBedMix;
  sleepingAreas: StaySleepingArea[];
  /** Minutes before the schedule check-in when booking closes. Null until the supplier sets it. 0 means until check-in. */
  cutoffMinutes: number | null;
  /** Used when no bed types are set, so an older "1 bed" listing is not wiped. */
  beds: number | null;
  quantity: number;
  nightlyPrice: number | null;
  cleaningFee: number | null;
  minNights: number;
  availabilityMode: StayAvailabilityMode;
  schedules: StaySeasonWindow[];
  archived: boolean;
};

export type StayOptionLegacySource = {
  title?: string;
  propertyType?: string;
  maxGuests?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  beds?: number | null;
  bedMix?: StayBedMix;
  nightlyPrice?: number | null;
  cleaningFee?: number | null;
  minNights?: number | null;
  availabilityMode?: StayAvailabilityMode;
  seasons?: StaySeasonWindow[];
  units?: StayUnitDraft[];
};

const LEGACY_OPTION_ID = 'stay-primary';

function count(raw: unknown, min: number, max: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < min || n > max) return null;
  return n;
}

function money(raw: unknown, min: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min) return null;
  return Math.round(raw * 100) / 100;
}

export function newStayOptionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `stay-opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyStayOption(id: string, propertyType: string): StayAccommodationOption {
  return {
    id,
    name: '',
    description: '',
    propertyType: propertyType.trim().slice(0, 40) || 'Apartment',
    maxGuests: null,
    bedrooms: null,
    bathrooms: null,
    bedMix: {},
    sleepingAreas: [],
    cutoffMinutes: null,
    beds: null,
    quantity: 1,
    nightlyPrice: null,
    cleaningFee: null,
    minNights: 1,
    availabilityMode: 'open',
    schedules: [],
    archived: false,
  };
}

export function normalizeStayOption(raw: unknown): StayAccommodationOption | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim().slice(0, 80) : '';
  if (!id) return null;
  const schedules = normalizeStaySeasons(o.schedules ?? o.seasons).slice(0, STAY_SCHEDULES_MAX);
  const quantity = count(o.quantity, 1, 500) ?? 1;
  const minNights = count(o.minNights, 1, 365) ?? 1;
  return {
    id,
    name: typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '',
    description: typeof o.description === 'string' ? o.description.trim().slice(0, 240) : '',
    propertyType: typeof o.propertyType === 'string' && o.propertyType.trim() ? o.propertyType.trim().slice(0, 40) : 'Apartment',
    maxGuests: count(o.maxGuests, 1, 50),
    bedrooms: count(o.bedrooms, 0, 30),
    bathrooms: typeof o.bathrooms === 'number' && o.bathrooms >= 0 && o.bathrooms <= 20 ? Math.round(o.bathrooms * 2) / 2 : null,
    sleepingAreas: normalizeStaySleepingAreas(o.sleepingAreas),
    bedMix:
      stayBedCount(stayMixFromAreas(normalizeStaySleepingAreas(o.sleepingAreas))) > 0
        ? stayMixFromAreas(normalizeStaySleepingAreas(o.sleepingAreas))
        : (normalizeStayBedMix(o.bedMix) ?? {}),
    cutoffMinutes:
      typeof o.cutoffMinutes === 'number' && o.cutoffMinutes >= 0
        ? Math.min(56 * 24 * 60, Math.floor(o.cutoffMinutes))
        : null,
    beds: count(o.beds, 0, 50),
    quantity,
    nightlyPrice: money(o.nightlyPrice ?? o.nightlyPriceUsd, 1),
    cleaningFee: money(o.cleaningFee ?? o.cleaningFeeUsd, 0),
    minNights,
    availabilityMode: o.availabilityMode === 'scheduled' ? 'scheduled' : 'open',
    schedules,
    archived: o.archived === true,
  };
}

export function normalizeStayOptions(raw: unknown): StayAccommodationOption[] {
  if (!Array.isArray(raw)) return [];
  const out: StayAccommodationOption[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const option = normalizeStayOption(row);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    out.push(option);
    if (out.length >= STAY_OPTIONS_MAX) break;
  }
  return out;
}

function optionFromUnit(unit: StayUnitDraft, propertyType: string, seasons: StaySeasonWindow[], mode: StayAvailabilityMode): StayAccommodationOption {
  return {
    id: unit.id,
    name: unit.name,
    description: unit.description,
    propertyType,
    maxGuests: unit.maxGuests,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    bedMix: {},
    sleepingAreas: [],
    cutoffMinutes: null,
    beds: unit.beds,
    quantity: unit.quantity,
    nightlyPrice: unit.nightlyPriceUsd,
    cleaningFee: null,
    minNights: unit.minNights,
    availabilityMode: mode,
    schedules: seasons,
    archived: unit.archived,
  };
}

/** Rebuild options from older stay records that only stored one price and one season list. */
export function ensureStayOptions(source: StayOptionLegacySource & { options?: unknown }): StayAccommodationOption[] {
  const stored = normalizeStayOptions(source.options);
  if (stored.length > 0) return stored;
  const units = source.units ?? [];
  if (units.length > 0) {
    const seasons = source.seasons ?? [];
    const mode = source.availabilityMode === 'scheduled' || seasons.some((s) => s.enabled) ? 'scheduled' : 'open';
    return units.slice(0, STAY_OPTIONS_MAX).map((unit, index) =>
      optionFromUnit(unit, source.propertyType?.trim() || 'Apartment', index === 0 ? seasons : [], mode)
    );
  }
  const hasLegacy =
    (source.nightlyPrice != null && source.nightlyPrice > 0) ||
    (source.maxGuests != null && source.maxGuests >= 1) ||
    (source.seasons?.length ?? 0) > 0 ||
    (source.beds != null && source.beds > 0) ||
    stayBedCount(source.bedMix) > 0;
  if (!hasLegacy) return [];
  return [
    {
      ...emptyStayOption(LEGACY_OPTION_ID, source.propertyType?.trim() || 'Apartment'),
      name: (source.title ?? '').trim().slice(0, 80),
      description: '',
      propertyType: source.propertyType?.trim().slice(0, 40) || 'Apartment',
      maxGuests: Number.isFinite(source.maxGuests) ? (source.maxGuests as number) : null,
      bedrooms: Number.isFinite(source.bedrooms) ? (source.bedrooms as number) : null,
      bathrooms: Number.isFinite(source.bathrooms) ? (source.bathrooms as number) : null,
      bedMix: source.bedMix ?? {},
      sleepingAreas: [],
      cutoffMinutes: null,
      beds: Number.isFinite(source.beds) ? (source.beds as number) : null,
      nightlyPrice: Number.isFinite(source.nightlyPrice) && (source.nightlyPrice as number) > 0 ? (source.nightlyPrice as number) : null,
      cleaningFee: Number.isFinite(source.cleaningFee) && (source.cleaningFee as number) >= 0 ? (source.cleaningFee as number) : null,
      minNights: source.minNights && source.minNights >= 1 ? Math.floor(source.minNights) : 1,
      availabilityMode: source.availabilityMode === 'scheduled' ? 'scheduled' : 'open',
      schedules: source.seasons ?? [],
    },
  ];
}

export function activeStayOptions(options: readonly StayAccommodationOption[]): StayAccommodationOption[] {
  return options.filter((option) => !option.archived);
}

/** True when checkout cannot reserve each option separately. */
export function stayOptionsNeedSeparateInventory(options: readonly StayAccommodationOption[]): boolean {
  const active = activeStayOptions(options);
  return active.length > 1 || active.some((option) => option.quantity > 1);
}

export function staySleepingLabel(option: StayAccommodationOption): string {
  const mix = stayBedSummary(option.bedMix);
  if (mix) {
    const sleeps = staySleepCapacity(option.bedMix);
    return `${mix} · sleeps ${sleeps}`;
  }
  if (option.beds != null && option.beds > 0) {
    return option.beds === 1 ? '1 bed, type not set' : `${option.beds} beds, types not set`;
  }
  return 'Sleeping not set';
}

export function stayOptionConfigured(option: StayAccommodationOption): boolean {
  return (
    !option.archived &&
    option.name.trim().length > 0 &&
    option.maxGuests != null &&
    option.maxGuests >= 1 &&
    (stayBedCount(option.bedMix) > 0 || (option.beds != null && option.beds > 0))
  );
}

export function stayOptionStatus(option: StayAccommodationOption, inventoryBlocked: boolean): string {
  if (option.archived) return 'Archived';
  if (!stayOptionConfigured(option)) return 'Incomplete';
  if (inventoryBlocked) return 'Not bookable yet';
  if (stayStartingNightly(option) == null) return 'Add availability';
  return 'Configured';
}

/** Null when schedules do not set this clock. Empty string when active schedules disagree. */
export function stayScheduleClock(
  schedules: readonly StaySeasonWindow[],
  key: 'checkIn' | 'checkOut'
): string | null {
  const enabled = schedules.filter((schedule) => schedule.enabled);
  if (enabled.length === 0) return null;
  const times = enabled.map((schedule) => (schedule[key] ?? '').trim());
  if (times.every((time) => time === '')) return null;
  if (times.every((time) => time === times[0] && /^\d{2}:\d{2}$/.test(time))) return times[0];
  return '';
}

export function stayScheduleConflicts(schedules: readonly StaySeasonWindow[]): string[] {
  const enabled = schedules.filter((schedule) => schedule.enabled);
  const lines: string[] = [];
  for (let i = 0; i < enabled.length; i += 1) {
    for (let j = i + 1; j < enabled.length; j += 1) {
      const a = enabled[i];
      const b = enabled[j];
      if (a.start <= b.end && b.start <= a.end) {
        const aName = a.name.trim() || a.start;
        const bName = b.name.trim() || b.start;
        lines.push(`${aName} and ${bName} cover the same nights. Deactivate one before both can stay active.`);
      }
    }
  }
  return lines;
}

export function stayStartingNightly(option: StayAccommodationOption): number | null {
  const prices = [
    option.nightlyPrice,
    ...option.schedules.filter((schedule) => schedule.enabled && schedule.nightlyPrice && schedule.nightlyPrice > 0).map((schedule) => schedule.nightlyPrice),
  ].filter((price): price is number => price != null && price > 0);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

export type StayOptionProjection = {
  stayAccommodationMode: 'single' | 'multi';
  stayUnits: StayUnitDraft[];
  stayPropertyType: string;
  stayMaxGuests: string;
  stayBedrooms: string;
  stayBeds: string;
  stayBathrooms: string;
  stayBedMix: StayBedMix;
  stayNightly: string;
  stayCleaningFee: string;
  stayMinNights: string;
  stayAvailabilityMode: StayAvailabilityMode;
  staySeasons: StaySeasonWindow[];
  /** Null leaves the current property times unchanged. */
  stayCheckIn: string | null;
  stayCheckOut: string | null;
  stayCutoffMinutes: number | null;
};

function unitFromOption(option: StayAccommodationOption): StayUnitDraft {
  return {
    id: option.id,
    name: option.name,
    description: option.description,
    maxGuests: option.maxGuests,
    bedrooms: option.bedrooms,
    beds: stayBedCount(option.bedMix) > 0 ? stayBedCount(option.bedMix) : option.beds,
    bathrooms: option.bathrooms,
    amenities: [],
    nightlyPriceUsd: option.nightlyPrice,
    quantity: option.quantity,
    minNights: option.minNights,
    archived: option.archived,
  };
}

/** Copy the bookable option onto the fields checkout already reads. Several options stay in the draft. */
export function projectStayOptions(options: readonly StayAccommodationOption[], propertyType: string): StayOptionProjection {
  const active = activeStayOptions(options);
  const separate = stayOptionsNeedSeparateInventory(options);
  const primary = active[0];
  const beds = primary ? (stayBedCount(primary.bedMix) > 0 ? stayBedCount(primary.bedMix) : primary.beds) : null;
  const enabled = primary?.schedules.filter((schedule) => schedule.enabled) ?? [];
  const scheduled = primary?.availabilityMode === 'scheduled';
  const cleaningFees = enabled.map((schedule) => schedule.cleaningFee).filter((fee): fee is number => fee != null);
  const sharedCleaning =
    cleaningFees.length > 0 && cleaningFees.every((fee) => fee === cleaningFees[0]) ? cleaningFees[0] : primary?.cleaningFee ?? null;
  return {
    stayAccommodationMode: separate ? 'multi' : 'single',
    stayUnits: options.map(unitFromOption),
    stayPropertyType: !separate && primary?.propertyType ? primary.propertyType : propertyType,
    stayMaxGuests: primary?.maxGuests != null ? String(primary.maxGuests) : '',
    stayBedrooms: primary?.bedrooms != null ? String(primary.bedrooms) : '',
    stayBeds: beds != null ? String(beds) : '',
    stayBathrooms: primary?.bathrooms != null ? String(primary.bathrooms) : '',
    stayBedMix: primary?.bedMix ?? {},
    stayNightly: primary && stayStartingNightly(primary) != null ? String(stayStartingNightly(primary)) : '',
    stayCleaningFee: sharedCleaning != null ? String(sharedCleaning) : '',
    stayMinNights: primary ? String(primary.minNights) : '1',
    stayAvailabilityMode: scheduled ? 'scheduled' : 'open',
    staySeasons: !separate && primary ? primary.schedules : [],
    stayCheckIn: primary ? stayScheduleClock(primary.schedules, 'checkIn') : null,
    stayCheckOut: primary ? stayScheduleClock(primary.schedules, 'checkOut') : null,
    stayCutoffMinutes: !separate && primary ? primary.cutoffMinutes : null,
  };
}
