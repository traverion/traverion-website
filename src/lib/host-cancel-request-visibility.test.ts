import { describe, expect, it } from 'vitest';
import { openHostCancelRequestVisible } from './host-cancel-request-visibility';

describe('openHostCancelRequestVisible', () => {
  it('hides host cancel UI when booking is already cancelled', () => {
    expect(
      openHostCancelRequestVisible({ bookingStatus: 'cancelled', requestStatus: 'requested' })
    ).toBe(false);
    expect(
      openHostCancelRequestVisible({ bookingStatus: 'cancelled', requestStatus: 'resolved' })
    ).toBe(false);
  });

  it('shows host cancel UI only for live bookings with requested status', () => {
    expect(
      openHostCancelRequestVisible({ bookingStatus: 'confirmed', requestStatus: 'requested' })
    ).toBe(true);
    expect(
      openHostCancelRequestVisible({ bookingStatus: 'confirmed', requestStatus: 'resolved' })
    ).toBe(false);
  });
});
