import {
  formatBookingCutoffLength,
  normalizeBookingCutoffHours,
} from './tour-departure-cutoff';

export type BookingCutoffUnit = 'minutes' | 'hours' | 'days';

export const BOOKING_CUTOFF_UNITS: { value: BookingCutoffUnit; label: string }[] = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
];

const MINUTE_AMOUNTS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const HOUR_AMOUNTS = Array.from({ length: 24 }, (_, i) => i + 1);
const DAY_AMOUNTS = [1, 2, 3, 4, 5, 6, 7];

export function bookingCutoffAmounts(unit: BookingCutoffUnit): number[] {
  if (unit === 'minutes') return MINUTE_AMOUNTS;
  if (unit === 'days') return DAY_AMOUNTS;
  return HOUR_AMOUNTS;
}

/** Hours stored on the option. Minutes stay fractional; days are 24-hour blocks. */
export function hoursFromCutoffSelection(unit: BookingCutoffUnit, amount: number): number {
  if (unit === 'minutes') return normalizeBookingCutoffHours(amount / 60);
  if (unit === 'days') return normalizeBookingCutoffHours(amount * 24);
  return normalizeBookingCutoffHours(amount);
}

export type CutoffSelection =
  | { kind: 'preset'; unit: BookingCutoffUnit; amount: number }
  | { kind: 'legacy'; unit: BookingCutoffUnit; amount: number; hours: number };

/**
 * Map a stored hour count onto the new controls.
 * A value outside the lists stays selectable instead of being rewritten.
 */
export function cutoffSelectionFromHours(hours: number): CutoffSelection | null {
  const n = normalizeBookingCutoffHours(hours);
  if (n <= 0) return null;
  const minutes = Math.round(n * 60);
  if (minutes >= 5 && minutes <= 60 && minutes % 5 === 0 && minutes < 60) {
    return { kind: 'preset', unit: 'minutes', amount: minutes };
  }
  if (minutes % 60 === 0) {
    const wholeHours = minutes / 60;
    if (wholeHours % 24 === 0) {
      const days = wholeHours / 24;
      if (days >= 1 && days <= 7) return { kind: 'preset', unit: 'days', amount: days };
    }
    if (wholeHours >= 1 && wholeHours <= 24) return { kind: 'preset', unit: 'hours', amount: wholeHours };
    return { kind: 'legacy', unit: 'hours', amount: wholeHours, hours: n };
  }
  if (minutes < 60) return { kind: 'legacy', unit: 'minutes', amount: minutes, hours: n };
  return { kind: 'legacy', unit: 'hours', amount: minutes / 60, hours: n };
}

export function cutoffAmountOptions(
  unit: BookingCutoffUnit,
  hours: number
): { value: string; label: string }[] {
  const presets = bookingCutoffAmounts(unit).map((amount) => ({
    value: String(amount),
    label: String(amount),
  }));
  const selection = cutoffSelectionFromHours(hours);
  if (!selection || selection.kind !== 'legacy' || selection.unit !== unit) return presets;
  const saved = formatBookingCutoffLength(selection.hours);
  return [{ value: String(selection.amount), label: `${saved} (saved)` }, ...presets];
}

/** Option cutoff wins. An empty option cutoff uses the listing default. */
export function effectiveBookingCutoffHours(optionHours: unknown, listingHours: unknown): number {
  const option = normalizeBookingCutoffHours(optionHours);
  if (option > 0) return option;
  return normalizeBookingCutoffHours(listingHours);
}

export function bookingCutoffExplanation(hours: number): string {
  const length = formatBookingCutoffLength(hours);
  if (!length) return 'Bookings stay open until departure.';
  return `Bookings close ${length} before departure.`;
}
