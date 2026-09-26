import { optionRunsOnDate } from './booking-quote';
import type { TourBookingVariant } from './booking-flow';
import { listingOptionHasSchedules, listingOptionReadySchedules } from './listing-option-schedules';
import { optionFulfillmentPlaceMeta } from './tour-pickup-meeting';

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
  const timedShapes = listingOptionHasSchedules(opt) ? listingOptionReadySchedules(opt) : [opt];
  const times = [...new Set(timedShapes.map((s) => s.startTime.trim()).filter(Boolean))].sort();
  const timeLine =
    times.length === 1 ? `Starts ${times[0]}` : times.length > 1 ? `Starts ${times.join(', ')}` : null;
  const minPersons = Math.min(...timedShapes.map((s) => s.minPersons));
  const maxPersons = Math.max(...timedShapes.map((s) => s.maxPersons));
  const groupLine =
    Number.isFinite(minPersons) && Number.isFinite(maxPersons)
      ? minPersons === maxPersons
        ? `${maxPersons} guests`
        : `${minPersons}–${maxPersons} guests`
      : null;
  return [
    timeLine,
    opt.duration.trim() || null,
    opt.isPrivate ? 'Private · your group only' : null,
    groupLine,
    optionFulfillmentPlaceMeta(opt.fulfillment, opt.pickupPlace),
  ].filter((part): part is string => Boolean(part));
}
