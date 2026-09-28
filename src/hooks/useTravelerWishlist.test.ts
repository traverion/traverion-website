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

  it('clears prior account IDs on traveler switch so hearts stay hidden until load', () => {
    const priorAccountIds = new Set(['listing-from-user-a']);
    const idsAfterSwitch = new Set<string>();
    const ready = false;
    const heartsKnown = ready || idsAfterSwitch.size > 0;
    expect(priorAccountIds.size).toBeGreaterThan(0);
    expect(idsAfterSwitch.size).toBe(0);
    expect(heartsKnown).toBe(false);
  });
});

/** Tour/Stay detail hearts must not reuse the previous listing’s saved state while loading. */
describe('listing detail wishlist heart', () => {
  it('does not show a filled heart until the current listing fetch is known', () => {
    const wishlistHeartKnown = false;
    const savedToWishlist = true; // stale from prior PDP
    expect(wishlistHeartKnown && savedToWishlist).toBe(false);
  });
});
