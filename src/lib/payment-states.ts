/**
 * Booking payment states as the product actually uses them.
 * Checkout-created / pending is not paid. Do not treat a Stripe session id as collected money.
 */

import { partnerUnpaidCheckoutHoldsInventory } from './booking-hold';

export const BOOKING_PAYMENT_STATES = ['pending', 'paid', 'failed', 'cancelled', 'refunded'] as const;
export type BookingPaymentState = (typeof BOOKING_PAYMENT_STATES)[number];

export type MoneyBookingRow = {
  status?: string | null;
  payment_status?: string | null;
  amount_paid?: number | string | null;
  checkout_session_id?: string | null;
  currency?: string | null;
  refund_choice?: string | null;
  hold_expires_at?: string | null;
  created_at?: string | null;
};

export function normalizePaymentStatus(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

export function isPaidPaymentStatus(raw: string | null | undefined): boolean {
  const pay = normalizePaymentStatus(raw);
  return pay === 'paid' || pay === 'complete' || pay === 'succeeded';
}

/** Money was collected at some point — including refunded. Failed and pending never were. */
export function bookingPaymentWasCollected(raw: string | null | undefined): boolean {
  const pay = normalizePaymentStatus(raw);
  return isPaidPaymentStatus(pay) || pay === 'refunded';
}

/**
 * Collected for Money: currently paid and still supplier revenue.
 * Refunded and Refund-due cancels are out. Late traveler cancels with
 * refund_choice = no_refund stay in — Stripe keeps the charge and earnings are not reversed.
 */
export function isCollectedBooking(b: MoneyBookingRow): boolean {
  const status = (b.status ?? '').trim().toLowerCase();
  const pay = normalizePaymentStatus(b.payment_status);
  if (pay === 'refunded') return false;
  if (!isPaidPaymentStatus(b.payment_status)) return false;
  const amount = Number(b.amount_paid ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (status === 'cancelled') {
    // Phase 1725: host keeps no_refund paid cancels in Collected / Available.
    return (b.refund_choice ?? '').trim().toLowerCase() === 'no_refund';
  }
  return true;
}

export type MoneyBookingRowWithDispute = MoneyBookingRow & {
  dispute_status?: string | null;
};

export function travelerPaymentLabel(b: MoneyBookingRowWithDispute): string {
  const pay = normalizePaymentStatus(b.payment_status);
  const cancelled = (b.status ?? '').trim().toLowerCase() === 'cancelled';
  const dispute = (b.dispute_status ?? '').trim().toLowerCase();
  if (pay === 'refunded') return 'Refunded';
  // Dispute is not a refund — surface honestly when open/lost.
  if (dispute === 'open' || dispute === 'needs_response' || dispute === 'under_review') {
    return 'Payment disputed';
  }
  if (dispute === 'lost') return 'Chargeback lost';
  if (cancelled && isPaidPaymentStatus(pay)) {
    const choice = (b.refund_choice ?? '').trim().toLowerCase();
    if (choice === 'no_refund') return 'No refund';
    return 'Refund due';
  }
  if (cancelled) return 'Cancelled';
  if (pay === 'failed') return 'Payment failed';
  if (isPaidPaymentStatus(pay)) return 'Paid';
  if (pay === 'pending' || b.checkout_session_id) {
    // Phase 1311: mirror partner hold truth — expired holds are not still “pending payment”.
    if (pay === 'pending' && !partnerUnpaidCheckoutHoldsInventory(b)) {
      return 'Hold expired';
    }
    return 'Payment pending';
  }
  return 'Unpaid';
}

export function partnerPaymentLabel(b: MoneyBookingRow): string {
  const base = travelerPaymentLabel(b);
  if (base === 'Payment pending' && partnerUnpaidCheckoutHoldsInventory(b)) return 'Checkout hold';
  return base;
}

/**
 * Partner Bookings detail: caption for the collected-amount row.
 * Must not say “Paid” when the trip is Refund due / Refunded / No refund.
 */
export function partnerCollectedAmountCaption(b: MoneyBookingRow): string {
  const label = partnerPaymentLabel(b);
  if (label === 'Refunded' || label === 'Refund due' || label === 'No refund') return label;
  return 'Paid';
}

/** Traveler/partner copy when a refund is owed but auto-refund is off. */
export const REFUND_DUE_MANUAL_COPY =
  'A refund is due. Traverion does not send Stripe refunds automatically. This stays Refund due until a refund is issued in Stripe.';

/** Cancelled + still paid (not no_refund) — money collected but refund not issued in Stripe. */
export function isRefundDueBooking(b: MoneyBookingRow): boolean {
  return travelerPaymentLabel(b) === 'Refund due';
}

/** Sum of amount_paid on Refund due rows (same currency assumed by caller). */
export function sumRefundDueAmount(rows: MoneyBookingRow[]): number {
  return rows.filter(isRefundDueBooking).reduce((sum, b) => {
    const n = Number(b.amount_paid ?? 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Sum collected amounts in one currency. Callers must not mix currencies without converting. */
export function sumCollectedAmount(rows: MoneyBookingRow[]): number {
  return rows.filter(isCollectedBooking).reduce((sum, b) => sum + Number(b.amount_paid ?? 0), 0);
}
