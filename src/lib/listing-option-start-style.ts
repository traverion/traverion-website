/**
 * Derive listing-level experienceStartStyle from option fulfillments.
 * Listing column remains for catalog/publish SQL; suppliers no longer set it manually.
 */

import type { ListingBookingOption } from '../types/listingExtras';
import type { TourPackage } from '../types/tour';

export type DerivedExperienceStartStyle = NonNullable<TourPackage['experienceStartStyle']>;

export function deriveExperienceStartStyleFromOptions(
  options: ListingBookingOption[] | null | undefined
): DerivedExperienceStartStyle {
  const modes = (options ?? [])
    .map((o) => o.fulfillment)
    .filter((f): f is 'pickup' | 'meeting_point' => f === 'pickup' || f === 'meeting_point');
  if (modes.length === 0) return 'unspecified';
  const allPickup = modes.every((m) => m === 'pickup');
  const allMeeting = modes.every((m) => m === 'meeting_point');
  if (allPickup) return 'operator_pickup';
  if (allMeeting) return 'fixed_meeting_place';
  return 'either_available';
}

/** Ready options that can drive start-style (fulfillment must be set). */
export function optionsWithFulfillment<T extends ListingBookingOption>(options: T[]): T[] {
  return options.filter((o) => o.fulfillment === 'pickup' || o.fulfillment === 'meeting_point');
}
