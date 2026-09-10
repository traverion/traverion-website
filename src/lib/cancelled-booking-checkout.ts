/**
 * Unpaid cancel leaves Stripe Checkout open. A late checkout.session.completed
 * must not resurrect the booking to confirmed+paid.
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
