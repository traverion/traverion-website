/**
 * Pure workflow contracts used by traveler catalog, booking, pickup, and regression tests.
 */

export function isListingVisibleToTravelers(status: string | null | undefined): boolean {
  if (status == null || status === '') return true;
  return status === 'published';
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
