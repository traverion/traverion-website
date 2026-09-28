import { inventoryFamilyFromListing } from './inventory';
import { bookingIsStayNight } from './pickup-completeness';
import {
  nightsOccupiedByStay,
  stayRangeFromBooking,
  partnerStayCalendarOccupiesNight,
  type StayCheckoutOccupancyRow,
} from './stayOccupancy';

type ListingLike = Parameters<typeof inventoryFamilyFromListing>[0];
type StayShapeBooking = Parameters<typeof bookingIsStayNight>[0] &
  StayCheckoutOccupancyRow & {
    listing_id?: string | null;
    guests?: number | null;
    booking_date?: string | null;
  };

/**
 * Phase 1543: when listing metadata is missing (view-all / deleted), fall back to
 * bookingIsStayNight — never Boolean(check_out) alone (nights/snap-only stays).
 */
export function partnerAvailabilityTreatAsStay(
  listing: ListingLike | null | undefined,
  booking: StayShapeBooking
): boolean {
  if (listing) return inventoryFamilyFromListing(listing) === 'stay';
  return bookingIsStayNight(booking);
}

export function accumulatePartnerStayGuestsByDate(params: {
  bookings: StayShapeBooking[];
  listingById: Map<string, ListingLike>;
  listingIdFilter?: string | null;
  viewingAll: boolean;
}): Map<string, { guests: number; count: number }> {
  const map = new Map<string, { guests: number; count: number }>();
  for (const b of params.bookings) {
    if (!partnerStayCalendarOccupiesNight(b)) continue;
    if (!params.viewingAll && b.listing_id !== params.listingIdFilter) continue;
    if (!b.booking_date) continue;
    const item = b.listing_id ? params.listingById.get(b.listing_id) : undefined;
    const isStay = partnerAvailabilityTreatAsStay(item, b);
    const nights = isStay
      ? (() => {
          const range = stayRangeFromBooking(b);
          return range ? nightsOccupiedByStay(range.checkIn, range.checkOut) : [b.booking_date];
        })()
      : [b.booking_date];
    for (const iso of nights) {
      const cur = map.get(iso) ?? { guests: 0, count: 0 };
      cur.guests += b.guests ?? 0;
      cur.count += 1;
      map.set(iso, cur);
    }
  }
  return map;
}

export function accumulatePartnerStayCheckOutsByDate(params: {
  bookings: StayShapeBooking[];
  listingById: Map<string, ListingLike>;
  listingIdFilter?: string | null;
  viewingAll: boolean;
}): Map<string, { guests: number; count: number }> {
  const map = new Map<string, { guests: number; count: number }>();
  for (const b of params.bookings) {
    if (!partnerStayCalendarOccupiesNight(b)) continue;
    if (!params.viewingAll && b.listing_id !== params.listingIdFilter) continue;
    const item = b.listing_id ? params.listingById.get(b.listing_id) : undefined;
    if (!partnerAvailabilityTreatAsStay(item, b)) continue;
    const range = stayRangeFromBooking(b);
    if (!range) continue;
    const cur = map.get(range.checkOut) ?? { guests: 0, count: 0 };
    cur.guests += b.guests ?? 0;
    cur.count += 1;
    map.set(range.checkOut, cur);
  }
  return map;
}
