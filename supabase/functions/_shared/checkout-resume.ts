/**
 * Mirror of src/lib/checkout-resume.ts for Deno edge runtime.
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
 * Pay now resume must freeze stay nights to the claimed booking.
 * Client checkoutDate must not extend/shorten inventory or Stripe total vs
 * column → nights → purchase_snapshot.checkOut (1524 / Phase 1539).
 * Body is only a fallback when the booking cannot resolve a check-out.
 */
export function resumeStayCheckoutDate(params: {
  bodyCheckoutDate?: string | null;
  bookingCheckOut?: string | null;
  bookingDate?: string | null;
  bookingNights?: number | null;
  specialRequests?: string | null;
  /** Phase 1539: honor purchase_snapshot.checkOut when column/nights are null. */
  purchaseSnapshot?: unknown;
  resolveFromBooking: (booking: {
    booking_date: string | null;
    check_out?: string | null;
    nights?: number | null;
    special_requests?: string | null;
    purchase_snapshot?: unknown;
  }) => { checkIn: string; checkOut: string } | null;
}): string | null {
  const range = params.resolveFromBooking({
    booking_date: params.bookingDate ?? null,
    check_out: params.bookingCheckOut ?? null,
    nights: params.bookingNights ?? null,
    special_requests: params.specialRequests ?? null,
    purchase_snapshot: params.purchaseSnapshot,
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

/**
 * Phase 1536: resume option = column → purchase_snapshot.optionId — never notes.
 */
export function resumeStoredOptionId(params: {
  bookingOptionId?: string | null;
  purchaseSnapshot?: unknown;
}): string | null {
  const col = String(params.bookingOptionId ?? '').trim();
  if (col) return col;
  const snap = params.purchaseSnapshot;
  if (snap && typeof snap === 'object') {
    const id = (snap as { optionId?: unknown }).optionId;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
}
