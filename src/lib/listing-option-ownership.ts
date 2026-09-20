import type { ListingBookingOption } from '../types/listingExtras';
import { materializedBookingOptions } from '../types/listingExtras';

/**
 * Listing duration is a traveler-facing headline derived from bookable options.
 * Option duration remains the operational source of truth.
 */
export function headlineDurationFromBookingOptions(
  options: Array<Pick<ListingBookingOption, 'duration'>>,
  fallback = ''
): string {
  const values = options.map((o) => (o.duration ?? '').trim()).filter(Boolean);
  if (values.length === 0) return fallback.trim();
  const first = values[0];
  const allSame = values.every((v) => v.toLowerCase() === first.toLowerCase());
  return allSame ? first : first;
}

export function listingDurationForPersist(input: {
  inventoryFamily: string;
  listingDuration: string;
  bookingOptions: ListingBookingOption[];
}): string {
  if (input.inventoryFamily === 'stay') return input.listingDuration.trim() || 'Per night';
  const active = materializedBookingOptions(input.bookingOptions);
  return headlineDurationFromBookingOptions(active, input.listingDuration);
}
