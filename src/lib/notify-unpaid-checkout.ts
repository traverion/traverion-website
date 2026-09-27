/**
 * Phase 1129: unpaid-checkout cancel copy must follow payment_status, not a
 * caller-supplied unpaidCheckout flag (guest/supplier JWTs can forge messaging).
 * Mirrors travelerSelfCancelIsUnpaidCheckout / bookingPaymentWasCollected.
 */

import { bookingPaymentWasCollected } from './payment-states';

export function notifyUnpaidCheckoutFromPaymentStatus(
  paymentStatus: string | null | undefined
): boolean {
  return !bookingPaymentWasCollected(paymentStatus);
}
