import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1664: Footer Company includes Saved', () => {
  it('links Saved to wishlist beside Trips', () => {
    const src = readFileSync(resolve(__dirname, 'Footer.tsx'), 'utf8');
    expect(src).toContain('Phase 1664');
    expect(src).toContain("nav('wishlist')");
    expect(src).toMatch(/Saved/);
  });
});
