/**
 * Phase 578: pure recipient/amount re-derivation for notify-customer-booking.
 * notify-customer-booking has no caller-identity check of its own (verify_jwt
 * is off and there is no bearer-token check), so a client-submitted
 * customerEmail used to be trusted verbatim for every emailKind except
 * booking_confirmed_paid/refund_completed (the two Phase 562 covered) -- an
 * unauthenticated caller could send a fully Traverion-branded transactional
 * email, including safety- and trust-relevant kinds like pickup_changed and
 * booking_cancelled, to any address of their choosing, just by citing any
 * real bookingId. This function is the authoritative decision: given a
 * booking-tied emailKind and the already-fetched bookings row, it returns
 * the real guest_email to use instead (and, for booking_confirmed_paid, the
 * real amount/currency), or an error to return instead of sending. Extracted
 * as a pure function (no Supabase client, no Deno globals) so it can be
 * unit-tested directly instead of only through a duplicated-logic harness.
 *
 * Mirrored at supabase/functions/_shared/notify-customer-recipient.ts for the
 * Deno edge runtime, which cannot import from src/ and has no test runner of
 * its own in this repo -- covered automatically by
 * edge-function-deno-mirror-sync.test.ts (keep both copies identical,
 * comments/formatting aside).
 */

export type NotifyCustomerBookingKind =
  | 'booking_request'
  | 'booking_confirmed_paid'
  | 'your_details_updated'
  | 'host_updated_schedule'
  | 'pickup_confirmed'
  | 'pickup_changed'
  | 'booking_cancelled'
  | 'cancellation_requested_by_supplier'
  | 'cancellation_accepted'
  | 'cancellation_declined'
  | 'new_booking_message'
  | 'pickup_action_required'
  | 'traveler_welcome'
  | 'refund_completed'
  | 'experience_reminder'
  | 'review_request'
  | 'checkout_payment_reversed';

/** Every kind is tied to a real booking except traveler_welcome (fired on signup, before any booking exists). */
export function isBookingTiedEmailKind(kind: NotifyCustomerBookingKind): boolean {
  return kind !== 'traveler_welcome';
}

export type BookingRowForRecipient =
  | {
      payment_status?: string | null;
      guest_email?: string | null;
      amount_paid?: number | null;
      total_amount?: number | null;
      currency?: string | null;
    }
  | null
  | undefined;

export type RecipientResolution =
  | { ok: true; to: string; amount: number | undefined; currency: string }
  | { ok: false; error: string; status: number };

/** Phase 1134/1331: accept paid/complete/succeeded (self-contained for Deno mirror). */
function paidConfirmationMaySend(paymentStatus: string | null | undefined): boolean {
  const pay = String(paymentStatus ?? '').trim().toLowerCase();
  return pay === 'paid' || pay === 'complete' || pay === 'succeeded';
}

// Phase 585: refund_completed is only ever sent after Stripe confirms a FULL
// refund (stripe-webhook's charge.refunded handler only fires it once
// payment_status has already been flipped to 'refunded' -- a partial refund
// never flips payment_status and never sends this email), so the booking's
// original amount_paid is always the correct refunded figure for this kind.
function refundConfirmationMaySend(paymentStatus: string | null | undefined): boolean {
  return String(paymentStatus ?? '').trim().toLowerCase() === 'refunded';
}

/**
 * Call after fetching the bookings row for a booking-tied emailKind (or
 * confirming bookingId was missing / the row was not found -- pass
 * bookingRow as undefined/null either way). callerEmail/callerAmount/
 * callerCurrency are the caller-supplied starting values; the result is what
 * should actually be used, or an error to return instead of sending.
 * traveler_welcome always passes the caller's values through unchanged --
 * it has no booking to check against.
 */
export function resolveBookingTiedRecipient(params: {
  kind: NotifyCustomerBookingKind;
  bookingId: string | undefined;
  bookingRow: BookingRowForRecipient;
  callerEmail: string;
  callerAmount: number | undefined;
  callerCurrency: string;
}): RecipientResolution {
  const { kind, bookingRow } = params;
  if (!isBookingTiedEmailKind(kind)) {
    return { ok: true, to: params.callerEmail, amount: params.callerAmount, currency: params.callerCurrency };
  }
  if (!String(params.bookingId ?? '').trim()) {
    return { ok: false, error: 'bookingId required for this emailKind', status: 400 };
  }
  if (!bookingRow) {
    return { ok: false, error: 'Booking not found', status: 404 };
  }

  let amount = params.callerAmount;
  let currency = params.callerCurrency;
  // Phase 585: refund_completed used to fall through this block untouched,
  // trusting the caller-supplied amount/currency verbatim -- since
  // notify-customer-booking has no caller-identity check of its own
  // (verify_jwt off, no bearer-token check), an unauthenticated caller could
  // cite any real bookingId and send a genuine, Traverion-branded "your
  // refund is complete" email quoting a fabricated amount, even for a
  // booking that was never refunded at all. Re-derive it the same way
  // booking_confirmed_paid's amount already is, gated on the kind-specific
  // payment_status that actually proves the claim being emailed.
  if (kind === 'booking_confirmed_paid' || kind === 'refund_completed') {
    if (kind === 'booking_confirmed_paid' && !paidConfirmationMaySend(bookingRow.payment_status)) {
      return { ok: false, error: 'Booking is not paid', status: 409 };
    }
    if (kind === 'refund_completed' && !refundConfirmationMaySend(bookingRow.payment_status)) {
      return { ok: false, error: 'Booking is not refunded', status: 409 };
    }
    const dbAmount =
      typeof bookingRow.amount_paid === 'number'
        ? bookingRow.amount_paid
        : typeof bookingRow.total_amount === 'number'
          ? bookingRow.total_amount
          : undefined;
    if (typeof dbAmount === 'number' && Number.isFinite(dbAmount) && dbAmount >= 0) {
      amount = dbAmount;
    }
    if (typeof bookingRow.currency === 'string' && bookingRow.currency.trim()) {
      currency = bookingRow.currency.trim().toUpperCase();
    }
  }

  const dbGuestEmail = String(bookingRow.guest_email ?? '').trim().toLowerCase();
  if (dbGuestEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dbGuestEmail)) {
    return { ok: true, to: dbGuestEmail, amount, currency };
  }
  // The booking row exists but has no usable guest_email on file. Fail closed
  // instead of falling back to the caller-supplied address -- that fallback
  // used to be exactly how this endpoint's recipient could be spoofed.
  return { ok: false, error: 'Booking has no valid guest email on file', status: 422 };
}

/**
 * Phase 580: traveler_welcome has no booking to check against, so its
 * recipient can only be authenticated by comparing it to the actual
 * signed-in caller's own email (see notify-customer-booking/index.ts's
 * authedClient.auth.getUser() call -- the I/O side of that can't be unit
 * tested here, only this comparison).
 */
export function isAuthorizedTravelerWelcomeRecipient(
  authedEmail: string | null | undefined,
  requestedEmail: string
): boolean {
  const authed = String(authedEmail ?? '').trim().toLowerCase();
  const requested = String(requestedEmail ?? '').trim().toLowerCase();
  return authed.length > 0 && authed === requested;
}
