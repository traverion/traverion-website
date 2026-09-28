import { describe, expect, it } from 'vitest';

/**
 * Phase 1391 keep-prior — reload must not flash empty Listings skeleton (Inbox 1355 / Wishlist 1301 parity).
 */
describe('SupplierListings loading and keep-prior display', () => {
  const showInitialSkeleton = (loading: boolean, listingsLen: number) => loading && listingsLen === 0;

  it('keeps prior listing rows visible while reloading (retry must not flash empty skeleton)', () => {
    expect(showInitialSkeleton(true, 3)).toBe(false);
    expect(showInitialSkeleton(false, 3)).toBe(false);
  });

  it('shows skeleton only on first load when no prior listings exist', () => {
    expect(showInitialSkeleton(true, 0)).toBe(true);
    expect(showInitialSkeleton(false, 0)).toBe(false);
  });
});
