import { describe, expect, it } from 'vitest';
import {
  cancelledCheckoutCaptureShouldRefund,
  cancelledUnpaidBookingBlocksCheckoutPaid,
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
