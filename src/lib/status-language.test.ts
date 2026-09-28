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

  // Phase 1312: lifecycle chip must not say Payment pending after inventory hold ends.
  it('labels expired unpaid holds as Hold expired when hold fields are provided', () => {
    const now = Date.now();
    expect(
      bookingLifecycleLabel('pending', 'pending', {
        created_at: new Date(now - 60 * 60 * 1000).toISOString(),
        hold_expires_at: new Date(now - 10 * 60 * 1000).toISOString(),
      })
    ).toBe('Hold expired');
    expect(
      bookingLifecycleLabel('pending', 'pending', {
        created_at: new Date(now - 5 * 60 * 1000).toISOString(),
        hold_expires_at: new Date(now + 20 * 60 * 1000).toISOString(),
      })
    ).toBe('Payment pending');
  });
});
