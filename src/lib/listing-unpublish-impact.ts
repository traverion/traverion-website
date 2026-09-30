import { isPaidPaymentStatus } from './payment-states';
import { partnerBookingIsPastSchedule, scheduleTodayIsoForBooking } from './trip-views';

/** Upcoming paid trips for a listing — used when unpublishing. */
export function countUpcomingPaidTripsForListing(
  bookings: Array<{
    listing_id: string;
    booking_date?: string | null;
    status?: string | null;
    payment_status?: string | null;
    check_out?: string | null;
    nights?: number | null;
    special_requests?: string | null;
    purchase_snapshot?: unknown;
  }>,
  listingId: string,
  /** Fixed calendar day (tests) or omit to use each booking’s experience-local today. */
  todayIso?: string,
  nowMs: number = Date.now()
): number {
  let n = 0;
  for (const b of bookings) {
    if (b.listing_id !== listingId) continue;
    if ((b.status ?? '').toLowerCase() === 'cancelled') continue;
    if (!isPaidPaymentStatus(b.payment_status)) continue;
    const day = todayIso ?? scheduleTodayIsoForBooking(b, nowMs);
    if (partnerBookingIsPastSchedule(b, day)) continue;
    n += 1;
  }
  return n;
}

/** Phase 1734: any booking row blocks hard delete (CASCADE wipe / RESTRICT). */
export function countBookingsForListing(
  bookings: Array<{ listing_id: string }>,
  listingId: string
): number {
  let n = 0;
  for (const b of bookings) {
    if (b.listing_id === listingId) n += 1;
  }
  return n;
}

export function deleteListingBlockedByBookingsNotice(count: number): string | null {
  if (count < 1) return null;
  if (count === 1) {
    return 'This listing has 1 booking in Bookings. Remove is blocked so trips and Money history stay. Take the listing offline instead.';
  }
  return `This listing has ${count} bookings in Bookings. Remove is blocked so trips and Money history stay. Take the listing offline instead.`;
}

export function unpublishUpcomingBookingsNotice(count: number): string | null {
  if (count < 1) return null;
  if (count === 1) {
    return '1 upcoming paid booking remains on your Bookings calendar — travelers keep their trip.';
  }
  return `${count} upcoming paid bookings remain on your Bookings calendar — travelers keep their trips.`;
}

/** Shown when deactivate/delete sheets cannot verify upcoming paid trips (fail closed). */
export function unpublishUpcomingBookingsCheckFailedNotice(): string {
  return 'We could not load your Bookings calendar. Check Bookings for upcoming paid trips before removing or taking this listing offline.';
}

/** Supabase sheets: block confirm until upcoming-paid count is known or check failed. */
export function partnerListingUpcomingPaidCheckPending(params: {
  requiresCheck: boolean;
  count: number | null;
  checkFailed: boolean;
}): boolean {
  return params.requiresCheck && params.count === null && !params.checkFailed;
}
