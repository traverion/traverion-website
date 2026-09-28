import { bookingIsStayNight } from './pickup-completeness';
import { stayRangeFromBooking } from './stayOccupancy';

/**
 * Phase 1544: admin support date line uses stayRangeFromBooking (1524),
 * not check_out column alone — nights-only / snapshot-only stays show full range.
 */
export function adminBookingDateLine(b: {
  booking_date?: string | null;
  check_out?: string | null;
  nights?: number | null;
  special_requests?: string | null;
  purchase_snapshot?: unknown;
}): string {
  if (bookingIsStayNight(b)) {
    const stay = stayRangeFromBooking({
      booking_date: b.booking_date ?? null,
      check_out: b.check_out ?? null,
      nights: b.nights ?? null,
      special_requests: b.special_requests ?? null,
      purchase_snapshot: b.purchase_snapshot,
    });
    if (stay) return `${stay.checkIn} → ${stay.checkOut}`;
  }
  return b.booking_date ?? 'Date TBC';
}
