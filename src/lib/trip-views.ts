import { normalizePaymentStatus, isRefundDueBooking } from './payment-states';
import { bookingOccupiesInventory } from './booking-hold';
import { checkoutPaymentStatusCanResume } from './checkout-resume';

export type TripListView = 'upcoming' | 'past' | 'cancelled';

export function bookingIsCancelledTrip(b: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  const st = (b.status ?? '').trim().toLowerCase();
  const pay = normalizePaymentStatus(b.payment_status);
  return st === 'cancelled' || pay === 'refunded';
}

/** Failed Stripe checkout is not a booked trip for partners / occupancy. */
export function bookingIsFailedCheckout(b: { payment_status?: string | null }): boolean {
  return normalizePaymentStatus(b.payment_status) === 'failed';
}

/** Partner Unpaid filter: pending checkout only. Refunded was paid; cancelled is closed. */
export function partnerBookingIsUnpaidCheckout(b: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  if (bookingIsCancelledTrip(b) || bookingIsFailedCheckout(b)) return false;
  return normalizePaymentStatus(b.payment_status) === 'pending';
}

/** Partner live trips: paid, pending hold, cancelled, refunded — not abandoned Stripe checkouts.
 * Pending unpaid holds stay in Bookings (Unpaid filter) so partners can release them, but they are
 * not operating/Today work.
 */
export function partnerBookingIsLiveTrip(b: { payment_status?: string | null }): boolean {
  return !bookingIsFailedCheckout(b);
}

/** Partner operating work: paid trips that still need today/upcoming/pickup handling — not unpaid holds. */
export function partnerBookingIsOperatingTrip(b: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  if (partnerBookingIsUnpaidCheckout(b)) return false;
  return partnerBookingIsLiveTrip(b) && !bookingIsCancelledTrip(b);
}

/** Partner Bookings cancel UI: paid request-cancel or release unpaid hold. */
export function partnerBookingShowsCancelAction(b: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  return partnerBookingIsOperatingTrip(b) || partnerBookingIsUnpaidCheckout(b);
}

/** Traveler trip still needs pay, stay, pickup, or cancel — not refunded or cancelled. */
export function travelerTripIsLive(b: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  if (bookingIsCancelledTrip(b)) return false;
  // Recoverable Pay now holds stay live for the traveler even when partners ignore unpaid.
  if (travelerBookingNeedsPayNow(b)) return true;
  if (bookingIsFailedCheckout(b)) return false;
  return partnerBookingIsLiveTrip(b) && !bookingIsCancelledTrip(b);
}

/** Traveler can resume Stripe for an unpaid hold (live pending or expired→failed). */
export function travelerBookingNeedsPayNow(b: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  if (bookingIsCancelledTrip(b)) return false;
  const st = (b.status ?? '').trim().toLowerCase();
  if (st !== 'pending') return false;
  return checkoutPaymentStatusCanResume(b.payment_status);
}

/** Unacknowledged operating trips only — not cancelled, refunded, or failed checkouts. */
export function partnerBookingNeedsLook(b: {
  acknowledged_at?: string | null;
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  if (b.acknowledged_at) return false;
  return partnerBookingIsOperatingTrip(b);
}

/** Partner Today: occupying operating trips on this local date — not refunded or cancelled. */
export function partnerBookingIsTodaySchedule(
  b: {
    status?: string | null;
    payment_status?: string | null;
    booking_date?: string | null;
    hold_expires_at?: string | null;
    created_at?: string | null;
  },
  todayIso: string,
  nowMs?: number
): boolean {
  if (!partnerBookingIsOperatingTrip(b)) return false;
  if (!bookingOccupiesInventory(b, nowMs)) return false;
  return (b.booking_date ?? '').trim() === todayIso;
}

/** Partner Today upcoming strip: occupying operating trips after today. */
export function partnerBookingIsUpcomingSchedule(
  b: {
    status?: string | null;
    payment_status?: string | null;
    booking_date?: string | null;
    hold_expires_at?: string | null;
    created_at?: string | null;
  },
  todayIso: string,
  nowMs?: number
): boolean {
  if (!partnerBookingIsOperatingTrip(b)) return false;
  if (!bookingOccupiesInventory(b, nowMs)) return false;
  const date = (b.booking_date ?? '').trim();
  return Boolean(date) && date > todayIso;
}

/** Upcoming and Past are for active trips + traveler-recoverable failed holds. Refunded → Cancelled. */
export function bookingMatchesTripView(
  b: { status?: string | null; payment_status?: string | null; booking_date?: string | null },
  view: TripListView,
  todayIso: string
): boolean {
  const cancelled = bookingIsCancelledTrip(b);
  if (view === 'cancelled') return cancelled;
  if (cancelled) return false;
  if (bookingIsFailedCheckout(b) && !travelerBookingNeedsPayNow(b)) return false;
  const date = (b.booking_date ?? '').trim();
  if (view === 'past') return Boolean(date) && date < todayIso;
  return !date || date >= todayIso;
}

/** Cancelled tab: Refund due first, then newest booking date. */
export function sortTravelerCancelledTrips<
  T extends { status?: string | null; payment_status?: string | null; booking_date?: string | null; refund_choice?: string | null },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aDue = isRefundDueBooking(a) ? 0 : 1;
    const bDue = isRefundDueBooking(b) ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    return (b.booking_date ?? '').localeCompare(a.booking_date ?? '');
  });
}
