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

/** Concurrent webhook paid/refunded the booking while Pay now created a new session. */
export function checkoutResumeLostRaceToPaid(paymentStatus: string | null | undefined): boolean {
  const pay = String(paymentStatus ?? '')
    .trim()
    .toLowerCase();
  return pay === 'paid' || pay === 'refunded';
}

/** Late expire/fail/completed from a superseded session/PI must not apply. */
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mirror of src/lib/checkout-resume.ts — stay Pay now without client checkoutDate. */
export function resumeStayCheckoutDate(params: {
  bodyCheckoutDate?: string | null;
  bookingCheckOut?: string | null;
  bookingDate?: string | null;
  bookingNights?: number | null;
  specialRequests?: string | null;
  resolveFromBooking: (booking: {
    booking_date: string | null;
    check_out?: string | null;
    nights?: number | null;
    special_requests?: string | null;
  }) => { checkIn: string; checkOut: string } | null;
}): string | null {
  const fromBody = String(params.bodyCheckoutDate ?? '').trim();
  if (ISO_DATE.test(fromBody)) return fromBody;
  const range = params.resolveFromBooking({
    booking_date: params.bookingDate ?? null,
    check_out: params.bookingCheckOut ?? null,
    nights: params.bookingNights ?? null,
    special_requests: params.specialRequests ?? null,
  });
  const out = range?.checkOut?.trim() ?? '';
  return ISO_DATE.test(out) ? out : null;
}
