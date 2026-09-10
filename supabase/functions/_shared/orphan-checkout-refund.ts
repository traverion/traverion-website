/**
 * Mirror of src/lib/orphan-checkout-refund.ts for Deno edge runtime.
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
