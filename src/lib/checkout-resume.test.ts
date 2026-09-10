import { describe, expect, it } from 'vitest';
import {
  checkoutPaymentStatusCanResume,
  resumeStayCheckoutDate,
  staleCheckoutFailureShouldApply,
  stripeWebhookCanMarkPaidFrom,
} from './checkout-resume';
import { stayRangeFromBooking } from './stayOccupancy';

describe('checkout resume after hold expiry', () => {
  it('allows pending and failed unpaid holds to resume/pay', () => {
    expect(checkoutPaymentStatusCanResume('pending')).toBe(true);
    expect(checkoutPaymentStatusCanResume('failed')).toBe(true);
    expect(checkoutPaymentStatusCanResume(null)).toBe(true);
    expect(checkoutPaymentStatusCanResume('paid')).toBe(false);
    expect(checkoutPaymentStatusCanResume('refunded')).toBe(false);
  });

  it('webhook may promote the same statuses to paid', () => {
    expect(stripeWebhookCanMarkPaidFrom('failed')).toBe(true);
    expect(stripeWebhookCanMarkPaidFrom('pending')).toBe(true);
    expect(stripeWebhookCanMarkPaidFrom('paid')).toBe(false);
  });
});

describe('staleCheckoutFailureShouldApply', () => {
  it('ignores an old Checkout expire while a newer session is current', () => {
    expect(
      staleCheckoutFailureShouldApply({
        eventCheckoutSessionId: 'cs_old',
        bookingCheckoutSessionId: 'cs_new',
      })
    ).toBe(false);
    expect(
      staleCheckoutFailureShouldApply({
        eventCheckoutSessionId: 'cs_new',
        bookingCheckoutSessionId: 'cs_new',
      })
    ).toBe(true);
  });

  it('ignores a stale checkout.session.completed after Pay now rotated sessions', () => {
    expect(
      staleCheckoutFailureShouldApply({
        eventCheckoutSessionId: 'cs_old',
        bookingCheckoutSessionId: 'cs_new',
        bookingPaymentIntentId: null,
      })
    ).toBe(false);
  });

  it('ignores an old PI failure while a newer Checkout session is open', () => {
    expect(
      staleCheckoutFailureShouldApply({
        eventPaymentIntentId: 'pi_old',
        bookingCheckoutSessionId: 'cs_new',
        bookingPaymentIntentId: null,
      })
    ).toBe(false);
    expect(
      staleCheckoutFailureShouldApply({
        eventPaymentIntentId: 'pi_old',
        bookingCheckoutSessionId: 'cs_new',
        bookingPaymentIntentId: 'pi_old',
      })
    ).toBe(true);
  });
});

describe('resumeStayCheckoutDate', () => {
  it('prefers the client checkoutDate when present', () => {
    expect(
      resumeStayCheckoutDate({
        bodyCheckoutDate: '2026-11-05',
        bookingCheckOut: '2026-11-04',
        bookingDate: '2026-11-01',
        bookingNights: 3,
        resolveFromBooking: stayRangeFromBooking,
      })
    ).toBe('2026-11-05');
  });

  it('restores multi-night check-out from the booking on Trips Pay now', () => {
    expect(
      resumeStayCheckoutDate({
        bodyCheckoutDate: '',
        bookingCheckOut: '2026-11-04',
        bookingDate: '2026-11-01',
        bookingNights: 3,
        resolveFromBooking: stayRangeFromBooking,
      })
    ).toBe('2026-11-04');
    expect(
      resumeStayCheckoutDate({
        bodyCheckoutDate: null,
        bookingCheckOut: null,
        bookingDate: '2026-11-01',
        bookingNights: 3,
        resolveFromBooking: stayRangeFromBooking,
      })
    ).toBe('2026-11-04');
  });
});
