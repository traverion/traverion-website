/**
 * Unpaid cancel historically left Stripe Checkout open. Prefer expiring the
 * session on cancel; webhook still blocks/refunds late captures (Phase 134).
 */
export function cancelledUnpaidBookingBlocksCheckoutPaid(params: {
  bookingStatus?: string | null;
  bookingPaymentStatus?: string | null;
}): boolean {
  const status = String(params.bookingStatus ?? '')
    .trim()
    .toLowerCase();
  if (status !== 'cancelled') return false;
  const pay = String(params.bookingPaymentStatus ?? 'pending')
    .trim()
    .toLowerCase();
  return pay === 'pending' || pay === 'failed';
}

/** True when unpaid cancel should ask Stripe to expire the open Checkout. */
export function unpaidCancelShouldExpireCheckout(params: {
  bookingStatus?: string | null;
  bookingPaymentStatus?: string | null;
  checkoutSessionId?: string | null;
}): boolean {
  if (
    !cancelledUnpaidBookingBlocksCheckoutPaid({
      bookingStatus: params.bookingStatus,
      bookingPaymentStatus: params.bookingPaymentStatus,
    })
  ) {
    return false;
  }
  return Boolean(String(params.checkoutSessionId ?? '').trim());
}

/** If Checkout already captured after unpaid cancel, refund that PI. */
export function cancelledCheckoutCaptureShouldRefund(params: {
  sessionPaymentStatus?: string | null;
  paymentIntentId?: string | null;
}): boolean {
  const sessionPay = String(params.sessionPaymentStatus ?? '')
    .trim()
    .toLowerCase();
  if (sessionPay !== 'paid') return false;
  return Boolean(String(params.paymentIntentId ?? '').trim());
}
