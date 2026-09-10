/**
 * Resume checkout / webhook paid promotion must accept pending holds and
 * failed holds that were expired mid-Pay-now (or abandoned), so Stripe money
 * can still confirm the booking.
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

/**
 * After Stripe creates a new Checkout, the booking write must not demote a row
 * that a concurrent webhook already marked paid/refunded.
 */
export function checkoutResumeLostRaceToPaid(paymentStatus: string | null | undefined): boolean {
  const pay = String(paymentStatus ?? '')
    .trim()
    .toLowerCase();
  return pay === 'paid' || pay === 'refunded';
}

/**
 * After Pay now opens a new Checkout, late events from an older session/PI
 * must not flip the booking (expire/fail → failed, or completed → paid).
 */
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
 * Pay now resume must reuse the stay check-out stored on the booking when the
 * client only sends bookingId (Trips does not resend nights).
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
