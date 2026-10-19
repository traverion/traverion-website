import { describe, expect, it } from 'vitest';
import { bookingLifecycleLabel, cancellationRequestLabel } from './status-language';

describe('status language', () => {
  it('keeps booking and payment labels distinct where they differ', () => {
    expect(bookingLifecycleLabel('confirmed', 'paid')).toBe('Confirmed');
    expect(bookingLifecycleLabel('pending', 'pending')).toBe('Payment pending');
    expect(bookingLifecycleLabel('cancelled', 'paid')).toBe('Cancelled');
    expect(bookingLifecycleLabel('confirmed', 'refunded')).toBe('Cancelled');
    expect(bookingLifecycleLabel('confirmed', 'refunded')).not.toBe('Confirmed');
    expect(bookingLifecycleLabel('confirmed', 'refunded')).not.toBe('Payment pending');
    expect(cancellationRequestLabel('expired')).toBe('Review window passed');
  });

  it('labels expired unpaid Instant Book sessions as Checkout expired', () => {
    const now = Date.now();
    expect(
      bookingLifecycleLabel('pending', 'pending', {
        created_at: new Date(now - 60 * 60 * 1000).toISOString(),
        hold_expires_at: new Date(now - 10 * 60 * 1000).toISOString(),
      })
    ).toBe('Checkout expired');
    expect(
      bookingLifecycleLabel('pending', 'pending', {
        created_at: new Date(now - 5 * 60 * 1000).toISOString(),
        hold_expires_at: new Date(now + 20 * 60 * 1000).toISOString(),
      })
    ).toBe('Payment pending');
  });
});
