/**
 * Stripe checkout.session.completed must not confirm a booking for less than the
 * Checkout session quote. Prefer session metadata.quoted_total (what was charged)
 * over bookings.total_amount so a Pay-now re-quote cannot reject a still-current
 * session that paid the amount Stripe actually collected.
 * Overpayment is accepted. Missing quotes (legacy) do not block confirmation.
 */
export function checkoutPaidAmountAcceptable(params: {
  amountPaid: number | null | undefined;
  bookingTotalAmount?: number | null;
  quotedTotalMeta?: string | null;
}): boolean {
  const paid = Number(params.amountPaid);
  if (!Number.isFinite(paid) || paid <= 0) return false;

  const meta = Number(String(params.quotedTotalMeta ?? '').trim());
  if (Number.isFinite(meta) && meta > 0) {
    return paid + 0.011 >= meta;
  }

  const fromBooking = Number(params.bookingTotalAmount);
  if (Number.isFinite(fromBooking) && fromBooking > 0) {
    return paid + 0.011 >= fromBooking;
  }

  return true;
}

/** Session currency must match the booking quote currency when both are present. */
export function checkoutPaidCurrencyMatches(params: {
  sessionCurrency?: string | null;
  bookingCurrency?: string | null;
}): boolean {
  const session = String(params.sessionCurrency ?? '')
    .trim()
    .toUpperCase();
  const booking = String(params.bookingCurrency ?? '')
    .trim()
    .toUpperCase();
  if (!session || !booking) return true;
  return session === booking;
}

/**
 * When amount/currency checks reject checkout.session.completed, refund the
 * captured PaymentIntent instead of leaving money trapped on an unpaid booking.
 */
export function rejectedCheckoutCaptureShouldRefund(params: {
  sessionPaymentStatus?: string | null;
  paymentIntentId?: string | null;
}): boolean {
  const sessionPay = String(params.sessionPaymentStatus ?? '')
    .trim()
    .toLowerCase();
  if (sessionPay !== 'paid') return false;
  return Boolean(String(params.paymentIntentId ?? '').trim());
}

/**
 * Paid UPDATE matched 0 rows (cancel / session rotation race) while Checkout
 * still captured — refund unless the booking already settled this payment.
 */
export function unpromotedCheckoutCaptureShouldRefund(params: {
  sessionPaymentStatus?: string | null;
  paymentIntentId?: string | null;
  bookingPaymentStatus?: string | null;
}): boolean {
  const pay = String(params.bookingPaymentStatus ?? '')
    .trim()
    .toLowerCase();
  if (pay === 'paid' || pay === 'refunded') return false;
  return rejectedCheckoutCaptureShouldRefund({
    sessionPaymentStatus: params.sessionPaymentStatus,
    paymentIntentId: params.paymentIntentId,
  });
}
