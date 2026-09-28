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

/**
 * Mirror of src/lib/checkout-resume.ts — freeze stay nights to the booking on
 * Pay now resume; client checkoutDate must not diverge from check_out.
 */
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
  const range = params.resolveFromBooking({
    booking_date: params.bookingDate ?? null,
    check_out: params.bookingCheckOut ?? null,
    nights: params.bookingNights ?? null,
    special_requests: params.specialRequests ?? null,
  });
  const fromBooking = range?.checkOut?.trim() ?? '';
  if (ISO_DATE.test(fromBooking)) return fromBooking;
  const fromBody = String(params.bodyCheckoutDate ?? '').trim();
  return ISO_DATE.test(fromBody) ? fromBody : null;
}

/** Reject Pay-now resume when client listingId disagrees with the booking row. */
export function resumeListingIdMismatch(params: {
  bodyListingId?: string | null;
  bookingListingId?: string | null;
}): boolean {
  const body = String(params.bodyListingId ?? '').trim();
  const row = String(params.bookingListingId ?? '').trim();
  if (!body || !row) return false;
  return body !== row;
}
