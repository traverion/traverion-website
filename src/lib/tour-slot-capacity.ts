import type { ListingBookingOption } from '../types/listingExtras';

/** Max spots for a departure slot from an applied booking option row. */
export function tourSlotMaxSpotsFromOption(option: ListingBookingOption | null | undefined): number | null {
  if (!option) return null;
  const spots = option.maxSpotsPerSlot;
  if (typeof spots === 'number' && Number.isFinite(spots) && spots >= 1) {
    return Math.min(99, Math.floor(spots));
  }
  const maxPersons = option.maxPersons;
  if (typeof maxPersons === 'number' && Number.isFinite(maxPersons) && maxPersons >= 1) {
    return Math.min(99, Math.floor(maxPersons));
  }
  return null;
}
