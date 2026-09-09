/**
 * Mirror of src/lib/checkout-resume.ts for Deno edge runtime.
 */
export function checkoutPaymentStatusCanResume(paymentStatus: string | null | undefined): boolean {
  const pay = String(paymentStatus ?? 'pending')
    .trim()
    .toLowerCase();
  return pay === 'pending' || pay === 'failed';
}

export function stripeWebhookCanMarkPaidFrom(paymentStatus: string | null | undefined): boolean {
  return checkoutPaymentStatusCanResume(paymentStatus);
}

export function staleCheckoutFailureShouldApply(params: {
  eventCheckoutSessionId?: string | null;
  eventPaymentIntentId?: string | null;
  bookingCheckoutSessionId?: string | null;
  bookingPaymentIntentId?: string | null;
}): boolean {
  const eventCs = String(params.eventCheckoutSessionId ?? '').trim();
  const eventPi = String(params.eventPaymentIntentId ?? '').trim();
  const bookCs = String(params.bookingCheckoutSessionId ?? '').trim();
  const bookPi = String(params.bookingPaymentIntentId ?? '').trim();

  if (bookCs) {
    if (eventCs) return eventCs === bookCs;
    if (eventPi) return Boolean(bookPi) && eventPi === bookPi;
    return false;
  }

  if (bookPi && eventPi) return eventPi === bookPi;
  return true;
}
