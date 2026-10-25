import { bookingIsRental, bookingIsStayNight } from './pickup-completeness';
import { stayRangeFromBooking } from './stayOccupancy';
import { parseRentalPurchaseSnapshot } from './rental-booking-domain';

/**
 * Phase 1544 / 1578: admin support date line uses stayRangeFromBooking (1524/1564),
 * not check_out column alone — nights-only / snapshot-only / stale short column
 * stays show the exclusive purchased range (Money CSV / Trips parity).
 * Rentals use pickup→return from purchase_snapshot (not stay nights).
 */
export function adminBookingDateLine(b: {
  booking_date?: string | null;
  check_out?: string | null;
  nights?: number | null;
  special_requests?: string | null;
  purchase_snapshot?: unknown;
}): string {
  if (bookingIsRental(b)) {
    const rental = parseRentalPurchaseSnapshot(b.purchase_snapshot);
    if (rental?.pickupAt && rental.returnAt) {
      const pick = new Date(rental.pickupAt);
      const ret = new Date(rental.returnAt);
      if (!Number.isNaN(pick.getTime()) && !Number.isNaN(ret.getTime())) {
        return `${pick.toISOString().slice(0, 10)} → ${ret.toISOString().slice(0, 10)}`;
      }
    }
  }
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
