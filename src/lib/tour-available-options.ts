import { optionRunsOnDate } from './booking-quote';
import type { TourBookingVariant } from './booking-flow';
import { listingOptionHasSchedules, listingOptionReadySchedules } from './listing-option-schedules';

export type TourOptionAvailabilityKind = 'none' | 'one' | 'many';

export type TourOptionsOnDate = {
  available: TourBookingVariant[];
  unavailable: TourBookingVariant[];
  kind: TourOptionAvailabilityKind;
};

export function variantRunsOnDate(variant: TourBookingVariant, isoDate: string): boolean {
  if (!isoDate.trim()) return false;
  if (!variant.listingOption) return true;
  return optionRunsOnDate(variant.listingOption, isoDate) == null;
}

export function optionsOnDate(variants: readonly TourBookingVariant[], isoDate: string): TourOptionsOnDate {
  const date = isoDate.trim();
  if (!date) {
    return { available: [], unavailable: [...variants], kind: 'none' };
  }
  const available: TourBookingVariant[] = [];
  const unavailable: TourBookingVariant[] = [];
  for (const variant of variants) {
    if (variantRunsOnDate(variant, date)) available.push(variant);
    else unavailable.push(variant);
  }
  const kind: TourOptionAvailabilityKind =
    available.length === 0 ? 'none' : available.length === 1 ? 'one' : 'many';
  return { available, unavailable, kind };
}

/** Long weekday heading for the dedicated options section — not the compact calendar caption. */
export function formatTourAvailabilityHeading(isoDate: string): string {
  const date = isoDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function optionMetaParts(variant: TourBookingVariant): string[] {
  const opt = variant.listingOption;
  if (!opt) return variant.subtitle ? [variant.subtitle] : [];
  const times = listingOptionHasSchedules(opt)
    ? [...new Set(listingOptionReadySchedules(opt).map((s) => s.startTime.trim()).filter(Boolean))].sort()
    : opt.startTime.trim()
      ? [opt.startTime.trim()]
      : [];
  const timeLine =
    times.length === 1 ? `Starts ${times[0]}` : times.length > 1 ? `Starts ${times.join(', ')}` : null;
  const groupLine =
    opt.minPersons && opt.maxPersons
      ? opt.minPersons === opt.maxPersons
        ? `${opt.maxPersons} guests`
        : `${opt.minPersons}–${opt.maxPersons} guests`
      : null;
  return [
    timeLine,
    opt.duration.trim() || null,
    opt.isPrivate ? 'Private · your group only' : null,
    groupLine,
    opt.pickupPlace.trim() || null,
  ].filter((part): part is string => Boolean(part));
}
