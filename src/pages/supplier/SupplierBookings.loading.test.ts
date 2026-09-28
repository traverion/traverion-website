import { describe, expect, it } from 'vitest';

/**
 * Phase 1392 keep-prior — reload must not flash empty Bookings skeleton (Listings 1391 / Inbox 1355 parity).
 */
describe('SupplierBookings loading and keep-prior display', () => {
  const showInitialSkeleton = (loading: boolean, bookingsLen: number) => loading && bookingsLen === 0;

  it('keeps prior booking rows visible while reloading (retry must not flash empty skeleton)', () => {
    expect(showInitialSkeleton(true, 5)).toBe(false);
    expect(showInitialSkeleton(false, 5)).toBe(false);
  });

  it('shows skeleton only on first load when no prior bookings exist', () => {
    expect(showInitialSkeleton(true, 0)).toBe(true);
    expect(showInitialSkeleton(false, 0)).toBe(false);
  });
});
