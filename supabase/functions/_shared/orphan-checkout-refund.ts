/**
 * Mirror of src/lib/orphan-checkout-refund.ts for Deno edge runtime.
 */
export function orphanSupersededCheckoutShouldRefund(params: {
  sessionPaymentStatus?: string | null;
  eventPaymentIntentId?: string | null;
  bookingPaymentIntentId?: string | null;
  eventCheckoutSessionId?: string | null;
  bookingCheckoutSessionId?: string | null;
}): boolean {
  const sessionPay = String(params.sessionPaymentStatus ?? '')
    .trim()
    .toLowerCase();
  if (sessionPay !== 'paid') return false;

  const eventPi = String(params.eventPaymentIntentId ?? '').trim();
  if (!eventPi) return false;

  const eventCs = String(params.eventCheckoutSessionId ?? '').trim();
  const bookCs = String(params.bookingCheckoutSessionId ?? '').trim();
  if (eventCs && bookCs && eventCs === bookCs) return false;

  const bookPi = String(params.bookingPaymentIntentId ?? '').trim();
  // Without a booking-side session/PI identity this is not a superseded orphan —
  // often a foreign-environment event where the booking row is absent. Never refund.
  if (!bookCs && !bookPi) return false;
  if (bookPi && eventPi === bookPi) return false;

  return true;
}
