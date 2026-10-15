import {
  MAX_BOOKING_CUTOFF_HOURS,
  normalizeBookingCutoffHours,
} from '../../lib/tour-departure-cutoff';
import { addCalendarDays } from '../../lib/stayOccupancy';
import { tourSellingDeparturesOnDate } from '../../lib/listing-option-schedules';
import {
  findSlotOverride,
  resolveSlotCapacity,
  resolveSlotCutoffHours,
  SLOT_OVERRIDE_CAPACITY_MAX,
} from '../../lib/listing-slot-overrides';
import { materializedBookingOptions, type ListingBookingOption } from '../../types/listingExtras';
import type { TourPackage } from '../../types/tour';

export const MAX_BULK_RANGE_DAYS = 366;

/** @deprecated Presets removed — use cutoffHourSelectOptions / AvailabilityCutoffField. */
export const CUTOFF_PRESETS = [
  { hours: 0, label: 'Until departure' },
  { hours: 1, label: '1 hour before' },
  { hours: 3, label: '3 hours before' },
  { hours: 12, label: '12 hours before' },
  { hours: 24, label: '24 hours before' },
] as const;

export type BulkCalendarAction = 'close' | 'reopen' | 'change_capacity' | 'change_cutoff';

export function bookingCutoffSelectLabel(hours: number): string {
  const n = normalizeBookingCutoffHours(hours);
  if (n <= 0) return 'Until departure';
  if (n === 1) return '1 hour before departure';
  return `${n} hours before departure`;
}

export function cutoffHourSelectOptions(maxHours: number = MAX_BOOKING_CUTOFF_HOURS): {
  value: string;
  label: string;
}[] {
  const max = Math.max(0, Math.min(MAX_BOOKING_CUTOFF_HOURS, Math.floor(maxHours)));
  const out: { value: string; label: string }[] = [];
  for (let h = 0; h <= max; h++) {
    out.push({ value: String(h), label: bookingCutoffSelectLabel(h) });
  }
  return out;
}

export function parseBulkAction(raw: string): BulkCalendarAction {
  if (
    raw === 'close' ||
    raw === 'reopen' ||
    raw === 'change_capacity' ||
    raw === 'change_cutoff'
  ) {
    return raw;
  }
  return 'close';
}

/** Resolve current capacity values for an option across dates (schedule + slot overrides). */
export function resolveOptionCapacitiesAcrossDates(params: {
  listing: TourPackage;
  optionId: string;
  dates: string[];
}): {
  departureCount: number;
  capacities: number[];
  mixed: boolean;
  displayValue: number | null;
} {
  const optionId = params.optionId.trim();
  if (!optionId) return { departureCount: 0, capacities: [], mixed: false, displayValue: null };
  const opts = materializedBookingOptions(params.listing.listingExtras?.bookingOptions);
  const capacities: number[] = [];
  for (const iso of params.dates) {
    for (const d of tourSellingDeparturesOnDate(opts, iso)) {
      if (d.optionId !== optionId) continue;
      const hm = (d.startTime || '').trim().slice(0, 5);
      const ov = findSlotOverride(params.listing.listingExtras?.slotOverrides, iso, hm);
      capacities.push(
        resolveSlotCapacity({
          scheduleCapacity: Math.max(0, Math.floor(d.maxSpotsPerSlot)),
          override: ov,
        })
      );
    }
  }
  if (capacities.length === 0) {
    return { departureCount: 0, capacities: [], mixed: false, displayValue: null };
  }
  const unique = [...new Set(capacities)];
  return {
    departureCount: capacities.length,
    capacities,
    mixed: unique.length > 1,
    displayValue: unique.length === 1 ? unique[0]! : null,
  };
}

export function resolveOptionCutoffsAcrossDates(params: {
  listing: TourPackage;
  optionId: string;
  dates: string[];
}): {
  departureCount: number;
  cutoffs: number[];
  mixed: boolean;
  displayValue: number | null;
} {
  const optionId = params.optionId.trim();
  if (!optionId) return { departureCount: 0, cutoffs: [], mixed: false, displayValue: null };
  const opts = materializedBookingOptions(params.listing.listingExtras?.bookingOptions);
  const cutoffs: number[] = [];
  const baseline = resolveOptionCutoffHours(params.listing, optionId);
  for (const iso of params.dates) {
    for (const d of tourSellingDeparturesOnDate(opts, iso)) {
      if (d.optionId !== optionId) continue;
      const hm = (d.startTime || '').trim().slice(0, 5);
      const ov = findSlotOverride(params.listing.listingExtras?.slotOverrides, iso, hm);
      cutoffs.push(resolveSlotCutoffHours({ baselineCutoffHours: baseline, override: ov }));
    }
  }
  if (cutoffs.length === 0) {
    return { departureCount: 0, cutoffs: [], mixed: false, displayValue: null };
  }
  const unique = [...new Set(cutoffs)];
  return {
    departureCount: cutoffs.length,
    cutoffs,
    mixed: unique.length > 1,
    displayValue: unique.length === 1 ? unique[0]! : null,
  };
}

export function countDeparturesForOption(params: {
  listing: TourPackage;
  optionId: string;
  dates: string[];
}): number {
  const optionId = params.optionId.trim();
  if (!optionId) return 0;
  const opts = materializedBookingOptions(params.listing.listingExtras?.bookingOptions);
  let n = 0;
  for (const iso of params.dates) {
    for (const d of tourSellingDeparturesOnDate(opts, iso)) {
      if (d.optionId === optionId) n += 1;
    }
  }
  return n;
}

export { SLOT_OVERRIDE_CAPACITY_MAX };

/** Inclusive ISO dates from `fromIso` to `toIso`, optionally filtered by Mon=0…Sun=6 weekdays. */
export function enumerateIsoDates(
  fromIso: string,
  toIso: string,
  weekdaysMon0?: boolean[] | null
): string[] {
  const out: string[] = [];
  if (!fromIso || !toIso || fromIso > toIso) return out;
  let cur = fromIso;
  while (cur <= toIso && out.length < MAX_BULK_RANGE_DAYS) {
    if (!weekdaysMon0 || weekdaysMon0.length !== 7) {
      out.push(cur);
    } else {
      const d = new Date(`${cur}T12:00:00Z`);
      const mon0 = (d.getUTCDay() + 6) % 7;
      if (weekdaysMon0[mon0]) out.push(cur);
    }
    cur = addCalendarDays(cur, 1);
  }
  return out;
}

export function resolveOptionCutoffHours(
  listing: TourPackage | null,
  optionId: string
): number {
  if (!listing) return 0;
  const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
  const opt = opts.find((o) => o.id === optionId);
  const optionCutoff = normalizeBookingCutoffHours(opt?.bookingCutoffHoursBeforeStart);
  if (optionCutoff > 0) return optionCutoff;
  return normalizeBookingCutoffHours(listing.listingExtras?.bookingCutoffHoursBeforeStart);
}

export function cutoffDisplayLabel(hours: number): string {
  return bookingCutoffSelectLabel(hours);
}

export function patchOptionCutoff(
  options: ListingBookingOption[],
  optionId: string,
  hours: number
): ListingBookingOption[] {
  const n = normalizeBookingCutoffHours(hours);
  return options.map((o) => {
    if (o.id !== optionId) return o;
    if (n <= 0) {
      const next = { ...o };
      delete next.bookingCutoffHoursBeforeStart;
      return next;
    }
    return { ...o, bookingCutoffHoursBeforeStart: n };
  });
}

export function patchScheduleOrOptionSpots(
  options: ListingBookingOption[],
  optionId: string,
  scheduleId: string,
  spots: number
): ListingBookingOption[] {
  const nextSpots = Math.min(99, Math.max(1, Math.floor(spots)));
  return options.map((o) => {
    if (o.id !== optionId) return o;
    const schedules = Array.isArray(o.schedules) ? o.schedules : null;
    if (schedules && schedules.length > 0) {
      return {
        ...o,
        schedules: schedules.map((s) =>
          s && s.id === scheduleId ? { ...s, maxSpotsPerSlot: nextSpots } : s
        ),
      };
    }
    return { ...o, maxSpotsPerSlot: nextSpots };
  });
}

export function bulkActionSummary(params: {
  action: BulkCalendarAction;
  dateCount: number;
  capacity?: number;
  cutoffHours?: number;
  stay: boolean;
  optionName?: string;
  departureCount?: number;
}): string {
  const n = params.dateCount;
  const dates = `${n} date${n === 1 ? '' : 's'}`;
  const optionBit = params.optionName?.trim() ? ` · ${params.optionName.trim()}` : '';
  switch (params.action) {
    case 'close':
      return params.stay ? `Block ${dates}` : `Close bookings on ${dates}`;
    case 'reopen':
      return params.stay ? `Clear blocks on ${dates}` : `Open bookings on ${dates}`;
    case 'change_capacity':
      return `Set capacity ${params.capacity ?? 0} on ${dates}${optionBit}`;
    case 'change_cutoff':
      return `Set ${bookingCutoffSelectLabel(params.cutoffHours ?? 0)} on ${dates}${optionBit}`;
    default:
      return `Update ${dates}`;
  }
}
