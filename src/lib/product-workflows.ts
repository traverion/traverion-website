/**
 * Pure workflow contracts used by traveler catalog, booking, pickup, and regression tests.
 */

export function isListingVisibleToTravelers(status: string | null | undefined): boolean {
  if (status == null || status === '') return true;
  return status === 'published';
}

/**
 * Whether a public tour/stay detail page should render an individual
 * listing's full content for a traveler visitor, vs. showing "not found" /
 * "unavailable". A listing's inventory family (is this a tour vs a stay,
 * and is that product family live at all) is a different dimension from
 * its publish status (draft/pending/rejected/published) -- a listing can
 * match the right family while still being unpublished, so family alone
 * is not enough to gate what a visitor sees. Both TourDetails and
 * StayDetails fetch a single listing by id with no status filter (listings
 * SELECT RLS is intentionally public read-all, by id, for the "anyone can
 * browse a published listing without signing in" experience, and the
 * shared fetchListingById is also used by supplier-side pages that must
 * be able to load the supplier's own draft) -- so this status check is
 * the only thing that keeps an unpublished listing's full content
 * (title, description, photos, itinerary, pricing, meeting point) from
 * being publicly viewable to anyone who has or guesses its id, even
 * though the booking action itself was already independently gated by
 * isListingVisibleToTravelers both client-side (this same function) and
 * server-side (create-booking-checkout-session's own status check).
 */
export function listingDetailVisibleToTraveler(params: {
  familyMatches: boolean;
  status: string | null | undefined;
}): boolean {
  return params.familyMatches && isListingVisibleToTravelers(params.status);
}

export function bookingBelongsToExperience(args: {
  bookingListingId: string;
  listingId: string;
  bookingGuestUserId?: string | null;
  expectedGuestUserId?: string | null;
  listingSupplierId?: string | null;
  expectedSupplierId?: string | null;
}): boolean {
  if (args.bookingListingId !== args.listingId) return false;
  if (
    args.expectedGuestUserId &&
    args.bookingGuestUserId &&
    args.bookingGuestUserId !== args.expectedGuestUserId
  ) {
    return false;
  }
  if (
    args.listingSupplierId &&
    args.expectedSupplierId &&
    args.listingSupplierId !== args.expectedSupplierId
  ) {
    return false;
  }
  return true;
}

export const SUPPLIER_BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled'] as const;
export type SupplierBookingStatus = (typeof SUPPLIER_BOOKING_STATUSES)[number];

export function isSupplierBookingStatus(value: string): value is SupplierBookingStatus {
  return (SUPPLIER_BOOKING_STATUSES as readonly string[]).includes(value);
}

export function pickupAssignmentComplete(
  pickupTime: string | null | undefined,
  listingNeedsPickup: boolean
): boolean {
  if (!listingNeedsPickup) return true;
  return Boolean(pickupTime && String(pickupTime).trim());
}

/** Last wizard index in the 4-step listing editor (photos). */
export const LISTING_WIZARD_PHOTO_STEP = 3;
export const LISTING_WIZARD_STEP_COUNT = 4;
