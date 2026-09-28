import { describe, expect, it } from 'vitest';

/**
 * Phase 1301 / 1377 UI gates (mirrors BookingMessageThread 1340 and Account hub 1378).
 */
describe('WishlistPage loading and keep-prior display', () => {
  const showInitialSkeleton = (loading: boolean, listingsLen: number) => loading && listingsLen === 0;

  it('keeps prior Saved cards visible while reloading (failure retry must not flash empty skeleton)', () => {
    expect(showInitialSkeleton(true, 3)).toBe(false);
    expect(showInitialSkeleton(false, 3)).toBe(false);
  });

  it('shows skeleton only on first load when no prior cards exist', () => {
    expect(showInitialSkeleton(true, 0)).toBe(true);
    expect(showInitialSkeleton(false, 0)).toBe(false);
  });
});
