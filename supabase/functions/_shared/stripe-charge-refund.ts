/**
 * Mirror of src/lib/stripe-charge-refund.ts for Deno edge runtime.
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

export function paidPromotionShouldRefuseFullyRefundedCharge(
  charge: {
    amount?: number | null;
    amount_refunded?: number | null;
    refunded?: boolean | null;
  } | null
    | undefined
): boolean {
  if (!charge) return false;
  return isStripeChargeFullyRefunded(charge);
}
