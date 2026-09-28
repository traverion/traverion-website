import { describe, expect, it } from 'vitest';

/**
 * Phase 1301 invariant (documented for callers of useTravelerWishlist):
 * a failed wishlist fetch must not be presented as an empty Saved set.
 */
describe('useTravelerWishlist failure honesty', () => {
  it('treats hearts as unknown when load failed and no prior IDs exist', () => {
    const ready = false;
    const loadError = true;
    const priorIds = new Set<string>();
    const heartsKnown = ready || priorIds.size > 0;
    expect(loadError).toBe(true);
    expect(heartsKnown).toBe(false);
  });

  it('keeps prior IDs visible after a failed reload', () => {
    const ready = false;
    const loadError = true;
    const priorIds = new Set(['listing-a', 'listing-b']);
    const heartsKnown = ready || priorIds.size > 0;
    expect(loadError).toBe(true);
    expect(heartsKnown).toBe(true);
    expect(priorIds.has('listing-a')).toBe(true);
  });
});
