import { normalizePaymentStatus } from './payment-states';
import { bookingOccupiesInventory } from './booking-hold';

export type TripListView = 'upcoming' | 'past' | 'cancelled';

export function bookingIsCancelledTrip(b: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  const st = (b.status ?? '').trim().toLowerCase();
  const pay = normalizePaymentStatus(b.payment_status);
  return st === 'cancelled' || pay === 'refunded';
}

/** Failed Stripe checkout is not a booked trip. */
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

/** Partner live trips: paid, pending hold, cancelled, refunded — not abandoned Stripe checkouts. */
export function partnerBookingIsLiveTrip(b: { payment_status?: string | null }): boolean {
  return !bookingIsFailedCheckout(b);
}

/** Partner operating work: a real booking that still needs today/upcoming/pickup handling. */
export function partnerBookingIsOperatingTrip(b: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  return partnerBookingIsLiveTrip(b) && !bookingIsCancelledTrip(b);
}

/** Traveler trip still needs pay, stay, pickup, or cancel — not refunded, cancelled, or failed. */
export function travelerTripIsLive(b: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  return partnerBookingIsOperatingTrip(b);
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

/** Upcoming and Past are for active trips only. Refunded money belongs with Cancelled. */
export function bookingMatchesTripView(
  b: { status?: string | null; payment_status?: string | null; booking_date?: string | null },
  view: TripListView,
  todayIso: string
): boolean {
  const cancelled = bookingIsCancelledTrip(b);
  if (view === 'cancelled') return cancelled;
  if (cancelled) return false;
  if (bookingIsFailedCheckout(b)) return false;
  const date = (b.booking_date ?? '').trim();
  if (view === 'past') return Boolean(date) && date < todayIso;
  return !date || date >= todayIso;
}

