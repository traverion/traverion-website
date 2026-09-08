/**
 * Booking payment states as the product actually uses them.
 * Checkout-created / pending is not paid. Do not treat a Stripe session id as collected money.
 */

export const BOOKING_PAYMENT_STATES = ['pending', 'paid', 'failed', 'cancelled', 'refunded'] as const;
export type BookingPaymentState = (typeof BOOKING_PAYMENT_STATES)[number];

export type MoneyBookingRow = {
  status?: string | null;
  payment_status?: string | null;
  amount_paid?: number | string | null;
  checkout_session_id?: string | null;
  currency?: string | null;
};

export function normalizePaymentStatus(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

export function isPaidPaymentStatus(raw: string | null | undefined): boolean {
  const pay = normalizePaymentStatus(raw);
  return pay === 'paid' || pay === 'complete' || pay === 'succeeded';
}

/** Collected for Money: paid, not cancelled, not refunded, amount > 0. */
export function isCollectedBooking(b: MoneyBookingRow): boolean {
  if ((b.status ?? '').trim().toLowerCase() === 'cancelled') return false;
  const pay = normalizePaymentStatus(b.payment_status);
  if (pay === 'refunded') return false;
  if (!isPaidPaymentStatus(b.payment_status)) return false;
  const amount = Number(b.amount_paid ?? 0);
  return Number.isFinite(amount) && amount > 0;
}

export function travelerPaymentLabel(b: MoneyBookingRow): string {
  const pay = normalizePaymentStatus(b.payment_status);
  const cancelled = (b.status ?? '').trim().toLowerCase() === 'cancelled';
  if (pay === 'refunded') return 'Refunded';
  if (cancelled && isPaidPaymentStatus(pay)) return 'Refund pending';
  if (cancelled) return 'Cancelled';
  if (pay === 'failed') return 'Payment failed';
  if (isPaidPaymentStatus(pay)) return 'Paid';
  if (pay === 'pending' || b.checkout_session_id) return 'Payment pending';
  return 'Unpaid';
}

export function partnerPaymentLabel(b: MoneyBookingRow): string {
  return travelerPaymentLabel(b);
}

/** Sum collected amounts in one currency. Callers must not mix currencies without converting. */
export function sumCollectedAmount(rows: MoneyBookingRow[]): number {
  return rows.filter(isCollectedBooking).reduce((sum, b) => sum + Number(b.amount_paid ?? 0), 0);
}
