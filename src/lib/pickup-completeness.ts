import { isPaidPaymentStatus } from './payment-states';
import {
  parseBookingMeetingPointOverride,
  parseBookingPickupInstructionsOverride,
} from './booking-notes';
import {
  displayMeetingPointFromPurchase,
  displayPickupInstructionsFromPurchase,
  isPurchaseSnapshot,
} from './purchase-snapshot';

/** Listing-level pickup copy is incomplete when meeting + pickup notes are too thin to operate. */
export function listingPickupCopyIncomplete(meetingPoint: string | null | undefined, pickupInstructions: string | null | undefined): boolean {
  const m = (meetingPoint ?? '').trim();
  const p = (pickupInstructions ?? '').trim();
  return m.length + p.length < 20;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Stay nights are check-in/out, not tour pickup.
 * Phase 1523: column / nights / purchased snapshot only — never notes-only check_out:
 * (planted keys must not flip tour cancel/refund to stay check-in math).
 */
export function bookingIsStayNight(b: {
  check_out?: string | null;
  special_requests?: string | null;
  nights?: number | null;
  purchase_snapshot?: unknown;
}): boolean {
  const col = (b.check_out ?? '').trim();
  if (ISO_DATE.test(col)) return true;
  const nights = Math.floor(Number(b.nights ?? 0));
  if (Number.isFinite(nights) && nights >= 1) return true;
  const snap =
    b.purchase_snapshot && typeof b.purchase_snapshot === 'object'
      ? (b.purchase_snapshot as { checkOut?: unknown }).checkOut
      : null;
  const snapOut = typeof snap === 'string' ? snap.trim() : '';
  return ISO_DATE.test(snapOut);
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
    nights?: number | null;
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
  specialRequests?: string | null;
  listingMeetingPoint?: string | null;
  listingPickupInstructions?: string | null;
  bookingOptions?: Array<{
    id: string;
    pickupPlace?: string;
    optionInfo?: string;
    travelerStartInstructions?: string;
  }> | null;
}): { meetingPoint: string; pickupInstructions: string } {
  const noteMeeting = parseBookingMeetingPointOverride(params.specialRequests);
  const noteInstructions = parseBookingPickupInstructionsOverride(params.specialRequests);
  const oid = (params.bookingOptionId ?? '').trim();
  const opts = params.bookingOptions ?? [];
  const opt = oid ? opts.find((o) => o.id === oid) : null;
  const optionMeeting = (opt?.pickupPlace ?? '').trim();
  const optionInstructions =
    (opt?.travelerStartInstructions ?? '').trim() || (opt?.optionInfo ?? '').trim();
  const listingMeeting = (params.listingMeetingPoint ?? '').trim();
  const listingInstructions = (params.listingPickupInstructions ?? '').trim();
  return {
    meetingPoint: noteMeeting || optionMeeting || listingMeeting,
    pickupInstructions: noteInstructions || optionInstructions || listingInstructions,
  };
}

/**
 * Partner ops pickup copy: note override → purchase snapshot → live listing/option.
 * When a snapshot exists, never resurrect live listing logistics (Phase 1083).
 */
export function resolvePartnerPickupCopy(params: {
  purchaseSnapshot?: unknown;
  bookingOptionId?: string | null;
  specialRequests?: string | null;
  listingMeetingPoint?: string | null;
  listingPickupInstructions?: string | null;
  bookingOptions?: Array<{
    id: string;
    pickupPlace?: string;
    optionInfo?: string;
    travelerStartInstructions?: string;
  }> | null;
}): { meetingPoint: string; pickupInstructions: string } {
  const noteMeeting = parseBookingMeetingPointOverride(params.specialRequests);
  const noteInstructions = parseBookingPickupInstructionsOverride(params.specialRequests);
  if (isPurchaseSnapshot(params.purchaseSnapshot)) {
    return {
      meetingPoint: noteMeeting || displayMeetingPointFromPurchase(params.purchaseSnapshot, null),
      pickupInstructions:
        noteInstructions || displayPickupInstructionsFromPurchase(params.purchaseSnapshot, null),
    };
  }
  return resolveBookingPickupCopy(params);
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
    purchase_snapshot?: unknown;
  },
  meetingPoint: string | null | undefined,
  pickupInstructions: string | null | undefined,
  bookingOptions?: Array<{
    id: string;
    pickupPlace?: string;
    optionInfo?: string;
    travelerStartInstructions?: string;
  }> | null
): boolean {
  const st = (b.status ?? '').trim().toLowerCase();
  if (st === 'cancelled') return false;
  if (!isPaidPaymentStatus(b.payment_status)) return false;
  const resolved = resolvePartnerPickupCopy({
    purchaseSnapshot: b.purchase_snapshot,
    bookingOptionId: b.booking_option_id,
    specialRequests: b.special_requests,
    listingMeetingPoint: meetingPoint,
    listingPickupInstructions: pickupInstructions,
    bookingOptions: isPurchaseSnapshot(b.purchase_snapshot) ? null : bookingOptions,
  });
  return bookingNeedsPickupCopy(b, resolved.meetingPoint, resolved.pickupInstructions);
}
