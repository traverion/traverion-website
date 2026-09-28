import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1607: Saved wishlist tag pills', () => {
  it('WishlistPage enables showTagPills with TAG_LABELS', () => {
    const src = readFileSync(resolve(__dirname, 'WishlistPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1607');
    expect(src).toContain('tagLabels={TAG_LABELS}');
    expect(src).toMatch(/showTagPills\s*\n/);
    expect(src).not.toContain('tagLabels={{}}');
  });
});
