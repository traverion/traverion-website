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
