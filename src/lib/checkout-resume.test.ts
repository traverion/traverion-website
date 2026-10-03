import { describe, expect, it } from 'vitest';
import {
  checkoutPaymentStatusCanResume,
  checkoutSessionPaymentIntentId,
  eventCheckoutSessionIdForPaymentIntentFailure,
  resumeStayCheckoutDate,
  resumeListingIdMismatch,
  resumeStoredOptionId,
  staleCheckoutFailureShouldApply,
  stripeWebhookCanMarkPaidFrom,
  checkoutResumeLostRaceToPaid,
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

  it('detects a Pay-now race lost to concurrent paid promotion', () => {
    expect(checkoutResumeLostRaceToPaid('paid')).toBe(true);
    expect(checkoutResumeLostRaceToPaid('refunded')).toBe(true);
    expect(checkoutResumeLostRaceToPaid('pending')).toBe(false);
    expect(checkoutResumeLostRaceToPaid('failed')).toBe(false);
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

  it('Phase 1855: correlates PI failure to current session so first decline applies', () => {
    expect(checkoutSessionPaymentIntentId({ payment_intent: 'pi_fail' })).toBe('pi_fail');
    expect(checkoutSessionPaymentIntentId({ payment_intent: { id: 'pi_fail' } })).toBe('pi_fail');
    const correlated = eventCheckoutSessionIdForPaymentIntentFailure({
      bookingCheckoutSessionId: 'cs_current',
      eventPaymentIntentId: 'pi_fail',
      sessionPaymentIntentId: 'pi_fail',
    });
    expect(correlated).toBe('cs_current');
    expect(
      staleCheckoutFailureShouldApply({
        eventCheckoutSessionId: correlated,
        eventPaymentIntentId: 'pi_fail',
        bookingCheckoutSessionId: 'cs_current',
        bookingPaymentIntentId: null,
      })
    ).toBe(true);
    expect(
      eventCheckoutSessionIdForPaymentIntentFailure({
        bookingCheckoutSessionId: 'cs_new',
        eventPaymentIntentId: 'pi_old',
        sessionPaymentIntentId: 'pi_new',
      })
    ).toBeNull();
  });
});

describe('resumeStayCheckoutDate', () => {
  it('ignores client checkoutDate when the booking already has check-out', () => {
    expect(
      resumeStayCheckoutDate({
        bodyCheckoutDate: '2026-11-05',
        bookingCheckOut: '2026-11-04',
        bookingDate: '2026-11-01',
        bookingNights: 3,
        resolveFromBooking: stayRangeFromBooking,
      })
    ).toBe('2026-11-04');
  });

  it('ignores a shorter client checkoutDate that would underpay vs claimed nights', () => {
    expect(
      resumeStayCheckoutDate({
        bodyCheckoutDate: '2026-11-02',
        bookingCheckOut: '2026-11-04',
        bookingDate: '2026-11-01',
        bookingNights: 3,
        resolveFromBooking: stayRangeFromBooking,
      })
    ).toBe('2026-11-04');
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

  it('uses body checkoutDate only when the booking cannot resolve check-out', () => {
    expect(
      resumeStayCheckoutDate({
        bodyCheckoutDate: '2026-11-05',
        bookingCheckOut: null,
        bookingDate: null,
        bookingNights: null,
        resolveFromBooking: () => null,
      })
    ).toBe('2026-11-05');
  });

  it('Phase 1539: snapshot-only stay freezes check-out (ignores shorter body)', () => {
    expect(
      resumeStayCheckoutDate({
        bodyCheckoutDate: '2026-12-02',
        bookingCheckOut: null,
        bookingDate: '2026-12-01',
        bookingNights: null,
        purchaseSnapshot: { checkOut: '2026-12-05' },
        resolveFromBooking: stayRangeFromBooking,
      })
    ).toBe('2026-12-05');
  });

  it('Phase 1539: notes-only plant does not override missing column/nights/snap', () => {
    expect(
      resumeStayCheckoutDate({
        bodyCheckoutDate: '2026-12-03',
        bookingCheckOut: null,
        bookingDate: '2026-12-01',
        bookingNights: null,
        specialRequests: 'check_out: 2026-12-10',
        purchaseSnapshot: null,
        resolveFromBooking: stayRangeFromBooking,
      })
    ).toBe('2026-12-02');
  });
});

describe('resumeListingIdMismatch', () => {
  it('rejects when client listingId disagrees with the booking row', () => {
    expect(
      resumeListingIdMismatch({
        bodyListingId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        bookingListingId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      })
    ).toBe(true);
  });

  it('allows resume when listing ids match or body omits listingId', () => {
    expect(
      resumeListingIdMismatch({
        bodyListingId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        bookingListingId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      })
    ).toBe(false);
    expect(
      resumeListingIdMismatch({
        bodyListingId: '',
        bookingListingId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      })
    ).toBe(false);
  });
});

describe('resumeStoredOptionId', () => {
  it('Phase 1536: prefers column then snapshot; ignores notes-only plant', () => {
    expect(
      resumeStoredOptionId({
        bookingOptionId: 'col-opt',
        purchaseSnapshot: { optionId: 'snap-opt' },
      })
    ).toBe('col-opt');
    expect(
      resumeStoredOptionId({
        bookingOptionId: null,
        purchaseSnapshot: { optionId: 'snap-opt' },
      })
    ).toBe('snap-opt');
    expect(
      resumeStoredOptionId({
        bookingOptionId: '',
        purchaseSnapshot: null,
      })
    ).toBeNull();
  });
});
