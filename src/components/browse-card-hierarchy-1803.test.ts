import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1803: browse card title + price hierarchy', () => {
  it('uses shared card title token and strengthens price size', () => {
    const src = readFileSync(resolve(__dirname, 'PublicListingBrowseCard.tsx'), 'utf8');
    expect(src).toContain('Phase 1803');
    expect(src).toContain('tv-card-title');
    // Titles stay on the shared hierarchy token (not a compact-only one-off).
    expect(src).toMatch(/className=\{`tv-card-title/);
    expect(src).toContain('text-[1.0625rem] sm:text-lg');
  });
});
