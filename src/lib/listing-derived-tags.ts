/**
 * Derive marketplace filter tags from structured listing data.
 * Manual tag pickers are removed from the supplier editor — only reliable signals.
 */
import type { ListingBookingOption } from '../types/listingExtras';
import { optionChargeModel } from './listing-option-charge-model';
import { listingOptionReadySchedules, listingOptionHasSchedules } from './listing-option-schedules';

const SMALL_GROUP_MAX = 12;

export type DerivedListingTagId =
  | 'pickup-available'
  | 'small-group'
  | 'free-cancellation'
  | 'mobile-ticket';

export function deriveListingTags(input: {
  bookingOptions?: ListingBookingOption[] | null;
  cancellationPreset?: string | null;
  /** Existing tags to preserve only when still structurally supported (none for manual-only). */
  previousTags?: string[] | null;
}): string[] {
  const tags = new Set<DerivedListingTagId>();
  const opts = (input.bookingOptions ?? []).filter(Boolean);

  if (opts.some((o) => o.fulfillment === 'pickup' || (o.pickupPlace ?? '').trim().length > 0)) {
    // Prefer explicit pickup fulfillment; pickupPlace alone is weak — only when fulfillment is pickup
    // or most options are pickup-oriented.
    if (opts.some((o) => o.fulfillment === 'pickup')) {
      tags.add('pickup-available');
    }
  }

  const capacitySignals = opts.flatMap((o) => {
    if (listingOptionHasSchedules(o)) {
      return listingOptionReadySchedules(o).map((s) => s.maxPersons || s.maxSpotsPerSlot);
    }
    return [o.maxPersons || o.maxSpotsPerSlot];
  }).filter((n) => Number.isFinite(n) && n > 0);

  if (
    capacitySignals.length > 0 &&
    capacitySignals.every((n) => n <= SMALL_GROUP_MAX) &&
    opts.some((o) => optionChargeModel(o) === 'per_person')
  ) {
    tags.add('small-group');
  }

  const preset = (input.cancellationPreset ?? '').trim();
  if (preset === 'free_24h' || preset === 'free_48h' || preset === 'free_7d') {
    tags.add('free-cancellation');
  }

  // All Traverion bookings are mobile-confirmable once published — safe default for filter UX.
  if (opts.length > 0) {
    tags.add('mobile-ticket');
  }

  return [...tags];
}
