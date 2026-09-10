import { describe, expect, it } from 'vitest';
import {
  cancelledCheckoutCaptureShouldRefund,
  cancelledUnpaidBookingBlocksCheckoutPaid,
  unpaidCancelShouldExpireCheckout,
} from './cancelled-booking-checkout';

describe('cancelledUnpaidBookingBlocksCheckoutPaid', () => {
  it('blocks pending/failed cancelled bookings', () => {
    expect(
      cancelledUnpaidBookingBlocksCheckoutPaid({
        bookingStatus: 'cancelled',
        bookingPaymentStatus: 'pending',
      })
    ).toBe(true);
    expect(
      cancelledUnpaidBookingBlocksCheckoutPaid({
        bookingStatus: 'cancelled',
        bookingPaymentStatus: 'failed',
      })
    ).toBe(true);
  });

  it('does not block live or already-settled rows', () => {
    expect(
      cancelledUnpaidBookingBlocksCheckoutPaid({
        bookingStatus: 'pending',
        bookingPaymentStatus: 'pending',
      })
    ).toBe(false);
    expect(
      cancelledUnpaidBookingBlocksCheckoutPaid({
        bookingStatus: 'cancelled',
        bookingPaymentStatus: 'paid',
      })
    ).toBe(false);
    expect(
      cancelledUnpaidBookingBlocksCheckoutPaid({
        bookingStatus: 'cancelled',
        bookingPaymentStatus: 'refunded',
      })
    ).toBe(false);
  });
});

describe('unpaidCancelShouldExpireCheckout', () => {
  it('expires when cancelled unpaid and a Checkout session exists', () => {
    expect(
      unpaidCancelShouldExpireCheckout({
        bookingStatus: 'cancelled',
        bookingPaymentStatus: 'pending',
        checkoutSessionId: 'cs_test_1',
      })
    ).toBe(true);
  });

  it('skips when there is no session or booking is settled', () => {
    expect(
      unpaidCancelShouldExpireCheckout({
        bookingStatus: 'cancelled',
        bookingPaymentStatus: 'pending',
        checkoutSessionId: null,
      })
    ).toBe(false);
    expect(
      unpaidCancelShouldExpireCheckout({
        bookingStatus: 'cancelled',
        bookingPaymentStatus: 'paid',
        checkoutSessionId: 'cs_test_1',
      })
    ).toBe(false);
  });
});

describe('cancelledCheckoutCaptureShouldRefund', () => {
  it('refunds paid sessions with a PI', () => {
    expect(
      cancelledCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'paid',
        paymentIntentId: 'pi_x',
      })
    ).toBe(true);
  });

  it('skips unpaid or missing PI', () => {
    expect(
      cancelledCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'unpaid',
        paymentIntentId: 'pi_x',
      })
    ).toBe(false);
    expect(
      cancelledCheckoutCaptureShouldRefund({
        sessionPaymentStatus: 'paid',
        paymentIntentId: null,
      })
    ).toBe(false);
  });
});
