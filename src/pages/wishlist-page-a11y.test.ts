import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: Saved (wishlist) page exposes a named region from its h1 (MyBookings Trips parity).
 */
describe('WishlistPage landmarks', () => {
  it('labels the saved listings region from the page h1', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'WishlistPage.tsx'),
      'utf8'
    );
    expect(src).toMatch(/id=\{WISHLIST_HEADING_ID\}/);
    expect(src).toMatch(/<section aria-labelledby=\{WISHLIST_HEADING_ID\}>/);
  });
});
