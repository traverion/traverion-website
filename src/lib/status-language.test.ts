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
});
