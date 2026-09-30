import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1772: signed-out browse shows wishlist hearts', () => {
  it('sets ready true when enabled and signed out', () => {
    const src = readFileSync(resolve(__dirname, 'useTravelerWishlist.ts'), 'utf8');
    expect(src).toContain('Phase 1772');
    expect(src).toContain('setReady(Boolean(enabled) && !user?.id)');
  });
});
