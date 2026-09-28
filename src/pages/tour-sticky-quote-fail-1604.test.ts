import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1604: tour sticky quote-failure price copy', () => {
  it('uses Price unavailable instead of an em dash when quote fails', () => {
    const src = readFileSync(resolve(__dirname, 'TourDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1604');
    expect(src).toContain("'Price unavailable'");
    expect(src).toMatch(/quoteFailed[\s\S]*Price unavailable/);
    expect(src).toMatch(/quoteFailed[\s\S]*panelQuote\?\.error/);
  });
});
