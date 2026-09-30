import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1803: browse card title + price hierarchy', () => {
  it('always uses font-display for listing titles and strengthens price size', () => {
    const src = readFileSync(resolve(__dirname, 'PublicListingBrowseCard.tsx'), 'utf8');
    expect(src).toContain('Phase 1803');
    expect(src).toMatch(/font-display font-semibold/);
    // Default size must not drop font-display (pre-1803 compact-only bug).
    expect(src).not.toMatch(
      /size === 'compact'\s*\?\s*'font-display[\s\S]*?:\s*'text-\[15px\] sm:text-base font-semibold'/
    );
    expect(src).toContain('text-[1.0625rem] sm:text-lg');
  });
});
