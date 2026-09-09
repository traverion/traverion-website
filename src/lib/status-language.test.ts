import { describe, expect, it } from 'vitest';
import { bookingLifecycleLabel, cancellationRequestLabel } from './status-language';

describe('status language', () => {
  it('keeps booking and payment labels distinct', () => {
    expect(bookingLifecycleLabel('confirmed', 'paid')).toBe('Confirmed');
    expect(bookingLifecycleLabel('pending', 'pending')).toBe('Pending payment');
    expect(bookingLifecycleLabel('cancelled', 'paid')).toBe('Cancelled');
    expect(bookingLifecycleLabel('confirmed', 'refunded')).toBe('Cancelled');
    expect(bookingLifecycleLabel('confirmed', 'refunded')).not.toBe('Confirmed');
    expect(bookingLifecycleLabel('confirmed', 'refunded')).not.toBe('Pending payment');
    expect(cancellationRequestLabel('expired')).toBe('Review window passed');
  });
});
