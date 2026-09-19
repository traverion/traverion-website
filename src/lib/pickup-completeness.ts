import { parseStayCheckOutFromNotes } from './stayOccupancy';
import { isPaidPaymentStatus } from './payment-states';

/** Listing-level pickup copy is incomplete when meeting + pickup notes are too thin to operate. */
export function listingPickupCopyIncomplete(meetingPoint: string | null | undefined, pickupInstructions: string | null | undefined): boolean {
  const m = (meetingPoint ?? '').trim();
  const p = (pickupInstructions ?? '').trim();
  return m.length + p.length < 20;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Stay nights are check-in/out, not tour pickup. */
export function bookingIsStayNight(b: {
  check_out?: string | null;
  special_requests?: string | null;
}): boolean {
  const col = (b.check_out ?? '').trim();
  if (ISO_DATE.test(col)) return true;
  return Boolean(parseStayCheckOutFromNotes(b.special_requests));
}

/**
 * Tour pickup attention gap shared by Today, Pickup planner, and related filters.
 * Stay nights never count. Setting a booking-level pickup_time resolves the gap
 * even if listing meeting/pickup copy is still thin.
 */
export function bookingNeedsPickupCopy(
  b: {
    check_out?: string | null;
    special_requests?: string | null;
    pickup_time?: string | null;
  },
  meetingPoint: string | null | undefined,
  pickupInstructions: string | null | undefined
): boolean {
  if (bookingIsStayNight(b)) return false;
  if ((b.pickup_time ?? '').toString().trim()) return false;
  return listingPickupCopyIncomplete(meetingPoint, pickupInstructions);
}

/** Resolve meeting/pickup copy for a booking from its option when possible. */
export function resolveBookingPickupCopy(params: {
  bookingOptionId?: string | null;
  listingMeetingPoint?: string | null;
  listingPickupInstructions?: string | null;
  bookingOptions?: Array<{ id: string; pickupPlace?: string; optionInfo?: string }> | null;
}): { meetingPoint: string; pickupInstructions: string } {
  const oid = (params.bookingOptionId ?? '').trim();
  const opts = params.bookingOptions ?? [];
  if (oid) {
    const opt = opts.find((o) => o.id === oid);
    if (opt) {
      return {
        meetingPoint: (opt.pickupPlace ?? '').trim(),
        pickupInstructions: (opt.optionInfo ?? '').trim(),
      };
    }
  }
  return {
    meetingPoint: (params.listingMeetingPoint ?? '').trim(),
    pickupInstructions: (params.listingPickupInstructions ?? '').trim(),
  };
}

/** Paid operating tour with missing pickup details — Bookings ops chip / row / detail must match Today. */
export function partnerBookingHasPickupAttention(
  b: {
    status?: string | null;
    payment_status?: string | null;
    check_out?: string | null;
    special_requests?: string | null;
    pickup_time?: string | null;
    booking_option_id?: string | null;
  },
  meetingPoint: string | null | undefined,
  pickupInstructions: string | null | undefined,
  bookingOptions?: Array<{ id: string; pickupPlace?: string; optionInfo?: string }> | null
): boolean {
  const st = (b.status ?? '').trim().toLowerCase();
  if (st === 'cancelled') return false;
  if (!isPaidPaymentStatus(b.payment_status)) return false;
  const resolved = resolveBookingPickupCopy({
    bookingOptionId: b.booking_option_id,
    listingMeetingPoint: meetingPoint,
    listingPickupInstructions: pickupInstructions,
    bookingOptions,
  });
  return bookingNeedsPickupCopy(b, resolved.meetingPoint, resolved.pickupInstructions);
}
