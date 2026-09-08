import { normalizePaymentStatus } from './payment-states';

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

