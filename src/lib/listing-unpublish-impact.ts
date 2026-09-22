import { isPaidPaymentStatus } from './payment-states';
import { partnerBookingIsPastSchedule } from './trip-views';

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
  }>,
  listingId: string,
  todayIso: string
): number {
  let n = 0;
  for (const b of bookings) {
    if (b.listing_id !== listingId) continue;
    if ((b.status ?? '').toLowerCase() === 'cancelled') continue;
    if (!isPaidPaymentStatus(b.payment_status)) continue;
    if (partnerBookingIsPastSchedule(b, todayIso)) continue;
    n += 1;
  }
  return n;
}

export function unpublishUpcomingBookingsNotice(count: number): string | null {
  if (count < 1) return null;
  if (count === 1) {
    return '1 upcoming paid booking remains on your Bookings calendar — travelers keep their trip.';
  }
  return `${count} upcoming paid bookings remain on your Bookings calendar — travelers keep their trips.`;
}
