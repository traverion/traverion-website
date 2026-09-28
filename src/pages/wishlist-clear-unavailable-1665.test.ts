import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1665: Wishlist can clear unavailable saves', () => {
  it('tracks unavailable ids and offers Clear unavailable', () => {
    const src = readFileSync(resolve(__dirname, 'WishlistPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1665');
    expect(src).toContain('unavailableIds');
    expect(src).toContain('Clear unavailable');
    expect(src).toContain('handleClearUnavailable');
  });
});
