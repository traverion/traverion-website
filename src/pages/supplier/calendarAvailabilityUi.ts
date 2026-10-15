import { normalizeBookingCutoffHours, bookingCutoffTravelerLabel } from '../../lib/tour-departure-cutoff';
import { addCalendarDays } from '../../lib/stayOccupancy';
import { materializedBookingOptions, type ListingBookingOption } from '../../types/listingExtras';
import type { TourPackage } from '../../types/tour';

export const MAX_BULK_RANGE_DAYS = 366;

export const CUTOFF_PRESETS = [
  { hours: 0, label: 'Until departure' },
  { hours: 1, label: '1 hour before' },
  { hours: 3, label: '3 hours before' },
  { hours: 12, label: '12 hours before' },
  { hours: 24, label: '24 hours before' },
] as const;

export type BulkCalendarAction = 'close' | 'reopen' | 'set_override' | 'clear';

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
  const n = normalizeBookingCutoffHours(hours);
  if (n <= 0) return 'Open until departure';
  return bookingCutoffTravelerLabel(n) ?? `${n}h before departure`;
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
  stay: boolean;
}): string {
  const n = params.dateCount;
  const dates = `${n} date${n === 1 ? '' : 's'}`;
  switch (params.action) {
    case 'close':
      return params.stay ? `Block ${dates}` : `Close ${dates}`;
    case 'reopen':
    case 'clear':
      return params.stay ? `Clear blocks on ${dates}` : `Restore schedule defaults on ${dates}`;
    case 'set_override':
      return params.stay
        ? `Set night value ${params.capacity ?? 0} on ${dates}`
        : `Set day-wide override ${params.capacity ?? 0} on ${dates}`;
    default:
      return `Update ${dates}`;
  }
}
