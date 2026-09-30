/**
 * Stripe charge.refunded fires for partial and full refunds.
 * Only a full refund should flip Traverion payment_status to refunded
 * and release occupancy.
 */

export function isStripeChargeFullyRefunded(charge: {
  amount?: number | null;
  amount_refunded?: number | null;
  refunded?: boolean | null;
}): boolean {
  if (charge.refunded === true) return true;
  const amount = charge.amount;
  const refunded = charge.amount_refunded;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return false;
  if (typeof refunded !== 'number' || !Number.isFinite(refunded)) return false;
  return refunded >= amount;
}

/**
 * Phase 1735: remaining charge after partial refunds, in major currency units
 * (matches bookings.amount_paid). Null when Stripe amounts are unusable.
 */
export function remainingPaidMajorFromCharge(charge: {
  amount?: number | null;
  amount_refunded?: number | null;
}): number | null {
  const amount = charge.amount;
  const refunded = charge.amount_refunded;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  if (typeof refunded !== 'number' || !Number.isFinite(refunded) || refunded < 0) return null;
  const remainingMinor = Math.max(0, amount - refunded);
  return remainingMinor / 100;
}

/**
 * Full refund arrived before paid promotion — mark the unpaid hold failed so a
 * late checkout.session.completed / payment_intent.succeeded cannot confirm it.
 */
export function refundBeforePaidShouldMarkFailed(params: {
  bookingPaymentStatus?: string | null;
  fullyRefunded: boolean;
}): boolean {
  if (!params.fullyRefunded) return false;
  const pay = String(params.bookingPaymentStatus ?? '')
    .trim()
    .toLowerCase();
  return pay === 'pending' || pay === 'failed';
}

/**
 * Phase 1758: charge.refunded meta booking_id must not mutate a booking whose
 * live payment_intent_id is a different PI (Pay-now rotate / orphan refund).
 * Empty booking PI still allows attach (pre-paid hold).
 */
export function chargeRefundMetaBookingMatchesPaymentIntent(params: {
  eventPaymentIntentId?: string | null;
  bookingPaymentIntentId?: string | null;
}): boolean {
  const eventPi = String(params.eventPaymentIntentId ?? '').trim();
  if (!eventPi) return false;
  const bookPi = String(params.bookingPaymentIntentId ?? '').trim();
  if (!bookPi) return true;
  return bookPi === eventPi;
}

/** Refuse paid promotion when the Checkout PaymentIntent's charge is fully refunded. */
export function paidPromotionShouldRefuseFullyRefundedCharge(
  charge:
    | {
        amount?: number | null;
        amount_refunded?: number | null;
        refunded?: boolean | null;
      }
    | null
    | undefined
): boolean {
  if (!charge) return false;
  return isStripeChargeFullyRefunded(charge);
}
