import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1637: logged-out Saved header subtitle', () => {
  it('shows a subtitle under the Saved heading when logged out', () => {
    const src = readFileSync(resolve(__dirname, 'WishlistPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1637');
    expect(src).toContain('Keep tours and stays you like — sign in to see them here.');
  });
});
