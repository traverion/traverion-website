import { describe, expect, it } from 'vitest';
import { paymentIntentSucceededShouldPromote } from './checkout-pi-succeeded';

describe('paymentIntentSucceededShouldPromote', () => {
  it('returns true when status is succeeded and booking_id is present', () => {
    expect(
      paymentIntentSucceededShouldPromote({ status: 'succeeded', bookingId: 'booking-1' })
    ).toBe(true);
  });

  it('returns false when PaymentIntent is not succeeded', () => {
    expect(
      paymentIntentSucceededShouldPromote({ status: 'processing', bookingId: 'booking-1' })
    ).toBe(false);
    expect(paymentIntentSucceededShouldPromote({ status: null, bookingId: 'booking-1' })).toBe(
      false
    );
  });

  it('returns false when booking_id metadata is missing', () => {
    expect(paymentIntentSucceededShouldPromote({ status: 'succeeded', bookingId: null })).toBe(
      false
    );
    expect(paymentIntentSucceededShouldPromote({ status: 'succeeded', bookingId: '  ' })).toBe(
      false
    );
  });
});
