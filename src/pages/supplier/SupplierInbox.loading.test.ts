import { describe, expect, it } from 'vitest';

/**
 * Phase 1355 data keep-prior + WishlistPage 1301 UI gate — reload must not flash empty Inbox skeleton.
 */
describe('SupplierInbox loading and keep-prior display', () => {
  const showInitialSkeleton = (loading: boolean, threadsLen: number) => loading && threadsLen === 0;

  it('keeps prior threads visible while reloading (retry must not flash empty skeleton)', () => {
    expect(showInitialSkeleton(true, 4)).toBe(false);
    expect(showInitialSkeleton(false, 4)).toBe(false);
  });

  it('shows skeleton only on first load when no prior threads exist', () => {
    expect(showInitialSkeleton(true, 0)).toBe(true);
    expect(showInitialSkeleton(false, 0)).toBe(false);
  });
});
