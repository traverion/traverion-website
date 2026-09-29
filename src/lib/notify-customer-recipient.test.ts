import { describe, expect, it } from 'vitest';
import {
  isAuthorizedTravelerWelcomeRecipient,
  isBookingTiedEmailKind,
  resolveBookingTiedRecipient,
  type BookingRowForRecipient,
} from './notify-customer-recipient';

// Phase 578: notify-customer-booking has no caller-identity check of its own
// (verify_jwt is off, no bearer-token check), so before this phase the
// recipient-resolution guard only ran for booking_confirmed_paid and
// refund_completed (Phase 562). Every other booking-tied emailKind --
// booking_request, your_details_updated, host_updated_schedule,
// pickup_confirmed, pickup_changed, booking_cancelled,
// cancellation_requested_by_supplier, cancellation_accepted,
// cancellation_declined, new_booking_message, pickup_action_required,
// experience_reminder, review_request -- sent the caller-supplied
// customerEmail verbatim, so anyone citing a real bookingId could redirect a
// legitimate-looking Traverion transactional email (several safety/trust
// relevant) to any address they chose. resolveBookingTiedRecipient is the
// authoritative fix, now used for every booking-tied kind; traveler_welcome
// is the one kind with no booking to check against and is intentionally
// exempt (a separate, lower-severity, out-of-scope gap).

const REAL_GUEST_EMAIL = 'real-guest@example.com';
const ATTACKER_EMAIL = 'attacker@evil.example';
const REAL_BOOKING_ID = 'booking-123';

const paidRow: BookingRowForRecipient = {
  payment_status: 'paid',
  guest_email: REAL_GUEST_EMAIL,
  amount_paid: 199.5,
  total_amount: 199.5,
  currency: 'usd',
};

describe('isBookingTiedEmailKind', () => {
  it('is true for every kind except traveler_welcome', () => {
    expect(isBookingTiedEmailKind('traveler_welcome')).toBe(false);
    expect(isBookingTiedEmailKind('booking_request')).toBe(true);
    expect(isBookingTiedEmailKind('booking_confirmed_paid')).toBe(true);
    expect(isBookingTiedEmailKind('refund_completed')).toBe(true);
    expect(isBookingTiedEmailKind('pickup_changed')).toBe(true);
    expect(isBookingTiedEmailKind('booking_cancelled')).toBe(true);
  });
});

describe('resolveBookingTiedRecipient (Phase 578 arbitrary-recipient fix)', () => {
  const otherBookingTiedKinds = [
    'booking_request',
    'your_details_updated',
    'host_updated_schedule',
    'pickup_confirmed',
    'pickup_changed',
    'booking_cancelled',
    'cancellation_requested_by_supplier',
    'cancellation_accepted',
    'cancellation_declined',
    'new_booking_message',
    'pickup_action_required',
    'experience_reminder',
    'review_request',
    'checkout_payment_reversed',
  ] as const;

  it.each(otherBookingTiedKinds)(
    'closes the arbitrary-recipient gap for %s: real bookingId + attacker customerEmail -> the real guest_email, not the attacker address',
    (kind) => {
      const result = resolveBookingTiedRecipient({
        kind,
        bookingId: REAL_BOOKING_ID,
        bookingRow: { guest_email: REAL_GUEST_EMAIL },
        callerEmail: ATTACKER_EMAIL,
        callerAmount: undefined,
        callerCurrency: 'EUR',
      });
      expect(result).toEqual({ ok: true, to: REAL_GUEST_EMAIL, amount: undefined, currency: 'EUR' });
    }
  );

  it('rejects a booking-tied kind with no bookingId at all (400)', () => {
    const result = resolveBookingTiedRecipient({
      kind: 'booking_cancelled',
      bookingId: undefined,
      bookingRow: undefined,
      callerEmail: ATTACKER_EMAIL,
      callerAmount: undefined,
      callerCurrency: 'EUR',
    });
    expect(result).toEqual({ ok: false, error: 'bookingId required for this emailKind', status: 400 });
  });

  it('fails closed (404) when the cited bookingId does not exist', () => {
    const result = resolveBookingTiedRecipient({
      kind: 'pickup_changed',
      bookingId: 'does-not-exist',
      bookingRow: null,
      callerEmail: ATTACKER_EMAIL,
      callerAmount: undefined,
      callerCurrency: 'EUR',
    });
    expect(result).toEqual({ ok: false, error: 'Booking not found', status: 404 });
  });

  it('fails closed (422), not open, when the real booking has no usable guest_email on file', () => {
    const result = resolveBookingTiedRecipient({
      kind: 'refund_completed',
      bookingId: REAL_BOOKING_ID,
      // payment_status: 'refunded' so this exercises the guest_email
      // fail-closed check specifically, past the Phase 585 refunded-status
      // gate (covered on its own above).
      bookingRow: { guest_email: null, payment_status: 'refunded' },
      callerEmail: ATTACKER_EMAIL,
      callerAmount: 50,
      callerCurrency: 'EUR',
    });
    expect(result).toEqual({ ok: false, error: 'Booking has no valid guest email on file', status: 422 });
  });

  it('booking_confirmed_paid: rejects an unpaid booking even with a valid guest_email', () => {
    const result = resolveBookingTiedRecipient({
      kind: 'booking_confirmed_paid',
      bookingId: REAL_BOOKING_ID,
      bookingRow: { guest_email: REAL_GUEST_EMAIL, payment_status: 'pending' },
      callerEmail: REAL_GUEST_EMAIL,
      callerAmount: undefined,
      callerCurrency: 'EUR',
    });
    expect(result).toEqual({ ok: false, error: 'Booking is not paid', status: 409 });
  });

  it('booking_confirmed_paid happy path: re-derives recipient, amount, and currency from the real booking', () => {
    const result = resolveBookingTiedRecipient({
      kind: 'booking_confirmed_paid',
      bookingId: REAL_BOOKING_ID,
      bookingRow: paidRow,
      callerEmail: REAL_GUEST_EMAIL,
      callerAmount: undefined,
      callerCurrency: 'EUR',
    });
    expect(result).toEqual({ ok: true, to: REAL_GUEST_EMAIL, amount: 199.5, currency: 'USD' });
  });

  it('Phase 1134: booking_confirmed_paid accepts complete/succeeded payment_status', () => {
    for (const payment_status of ['complete', 'succeeded'] as const) {
      const result = resolveBookingTiedRecipient({
        kind: 'booking_confirmed_paid',
        bookingId: REAL_BOOKING_ID,
        bookingRow: { ...paidRow, payment_status },
        callerEmail: REAL_GUEST_EMAIL,
        callerAmount: undefined,
        callerCurrency: 'EUR',
      });
      expect(result).toEqual({ ok: true, to: REAL_GUEST_EMAIL, amount: 199.5, currency: 'USD' });
    }
  });

  // Phase 585: refund_completed is the one other kind notify-customer-booking
  // trusts a caller-supplied amount for. It is only ever triggered
  // server-side (stripe-webhook, after Stripe confirms a FULL refund), and
  // its amount is always equal to the booking's original amount_paid --
  // there is no partial-refund case for this emailKind (a partial refund
  // does not flip payment_status to 'refunded' and never sends this email).
  // Since notify-customer-booking has no caller-identity check at all
  // (verify_jwt off, no bearer-token check), an unauthenticated caller could
  // previously cite any real bookingId and any amount/currency of their
  // choosing to send a real, Traverion-branded "your refund is complete"
  // email quoting a fabricated figure -- and could do so even for a booking
  // that was never refunded at all.
  it('refund_completed: rejects a booking that was never refunded, even with a valid guest_email', () => {
    const result = resolveBookingTiedRecipient({
      kind: 'refund_completed',
      bookingId: REAL_BOOKING_ID,
      bookingRow: paidRow, // payment_status: 'paid', never refunded
      callerEmail: ATTACKER_EMAIL,
      callerAmount: 99999,
      callerCurrency: 'USD',
    });
    expect(result).toEqual({ ok: false, error: 'Booking is not refunded', status: 409 });
  });

  it('refund_completed happy path: re-derives recipient, amount, and currency from the real booking, not the caller-supplied figure', () => {
    const refundedRow: BookingRowForRecipient = {
      payment_status: 'refunded',
      guest_email: REAL_GUEST_EMAIL,
      amount_paid: 199.5,
      total_amount: 199.5,
      currency: 'usd',
    };
    const result = resolveBookingTiedRecipient({
      kind: 'refund_completed',
      bookingId: REAL_BOOKING_ID,
      bookingRow: refundedRow,
      callerEmail: ATTACKER_EMAIL,
      callerAmount: 99999,
      callerCurrency: 'GBP',
    });
    expect(result).toEqual({ ok: true, to: REAL_GUEST_EMAIL, amount: 199.5, currency: 'USD' });
  });

  it('non-booking_confirmed_paid/refund_completed kinds never re-derive amount/currency, only the recipient', () => {
    const result = resolveBookingTiedRecipient({
      kind: 'booking_cancelled',
      bookingId: REAL_BOOKING_ID,
      bookingRow: paidRow,
      callerEmail: ATTACKER_EMAIL,
      callerAmount: 1,
      callerCurrency: 'GBP',
    });
    expect(result).toEqual({ ok: true, to: REAL_GUEST_EMAIL, amount: 1, currency: 'GBP' });
  });

  it('traveler_welcome is exempt: caller values pass through untouched even with no booking', () => {
    const result = resolveBookingTiedRecipient({
      kind: 'traveler_welcome',
      bookingId: undefined,
      bookingRow: undefined,
      callerEmail: ATTACKER_EMAIL,
      callerAmount: undefined,
      callerCurrency: 'EUR',
    });
    expect(result).toEqual({ ok: true, to: ATTACKER_EMAIL, amount: undefined, currency: 'EUR' });
  });
});

describe('isAuthorizedTravelerWelcomeRecipient (Phase 580 fix)', () => {
  // traveler_welcome has no booking to check against (fired on signup), so
  // Phase 578 left it exempt from the booking-tied recipient guard. Before
  // this phase, that meant anyone could trigger a "Welcome to Traverion"
  // email to any address, unauthenticated -- this closes it by requiring the
  // caller's own signed-in email to match the requested recipient.
  it('authorizes when the signed-in email matches the requested recipient (case-insensitive, trimmed)', () => {
    expect(isAuthorizedTravelerWelcomeRecipient('Real.Guest@Example.com', 'real.guest@example.com')).toBe(true);
    expect(isAuthorizedTravelerWelcomeRecipient('  real.guest@example.com  ', 'real.guest@example.com')).toBe(true);
  });

  it('rejects when the signed-in email does not match the requested recipient (the exploit this closes)', () => {
    expect(isAuthorizedTravelerWelcomeRecipient('real-guest@example.com', ATTACKER_EMAIL)).toBe(false);
  });

  it('rejects when there is no signed-in email at all', () => {
    expect(isAuthorizedTravelerWelcomeRecipient(undefined, ATTACKER_EMAIL)).toBe(false);
    expect(isAuthorizedTravelerWelcomeRecipient(null, ATTACKER_EMAIL)).toBe(false);
    expect(isAuthorizedTravelerWelcomeRecipient('', ATTACKER_EMAIL)).toBe(false);
  });
});
