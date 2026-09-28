import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1675: About Travelers includes Saved', () => {
  it('links Saved to wishlist beside Your trips', () => {
    const src = readFileSync(resolve(__dirname, 'About.tsx'), 'utf8');
    expect(src).toContain('Phase 1675');
    expect(src).toContain("onNavigate('wishlist')");
    expect(src).toContain('Saved');
  });
});
