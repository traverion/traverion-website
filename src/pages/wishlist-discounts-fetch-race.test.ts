import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: Saved grid must not treat a prior id-set's offer map as loaded for the current
 * wishlist rows (stale discounts could flash; new rows could look like no discount).
 */
describe('Wishlist discounts fetch race honesty', () => {
  it('gates card offers on wishlist id key + load generation', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'WishlistPage.tsx'), 'utf8');
    expect(src).toMatch(/discountsLoadedForKey/);
    expect(src).toMatch(/discountsLoadGenRef/);
    expect(src).toMatch(/setDiscountsLoadedForKey\(null\)/);
    expect(src).toMatch(/discountsLoadedForKey === wishlistListingIdsKey/);
    expect(src).toMatch(/gen !== discountsLoadGenRef\.current/);
  });
});
