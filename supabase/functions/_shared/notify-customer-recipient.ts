/**
 * Mirror of src/lib/notify-customer-recipient.ts for Deno edge runtime.
 *
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
  | 'review_request';

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

function paidConfirmationMaySend(paymentStatus: string | null | undefined): boolean {
  return String(paymentStatus ?? '').trim().toLowerCase() === 'paid';
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
  if (kind === 'booking_confirmed_paid') {
    if (!paidConfirmationMaySend(bookingRow.payment_status)) {
      return { ok: false, error: 'Booking is not paid', status: 409 };
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
