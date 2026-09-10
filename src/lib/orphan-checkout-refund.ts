/**
 * After Pay now rotates Checkout, a late checkout.session.completed for the
 * superseded session must not confirm the booking — but if Stripe already
 * captured that session's PaymentIntent, Traverion should refund it so the
 * traveler is not double-charged when they pay the current session.
 */
export function orphanSupersededCheckoutShouldRefund(params: {
  sessionPaymentStatus?: string | null;
  eventPaymentIntentId?: string | null;
  bookingPaymentIntentId?: string | null;
}): boolean {
  const sessionPay = String(params.sessionPaymentStatus ?? '')
    .trim()
    .toLowerCase();
  if (sessionPay !== 'paid') return false;

  const eventPi = String(params.eventPaymentIntentId ?? '').trim();
  if (!eventPi) return false;

  const bookPi = String(params.bookingPaymentIntentId ?? '').trim();
  if (bookPi && eventPi === bookPi) return false;

  return true;
}
