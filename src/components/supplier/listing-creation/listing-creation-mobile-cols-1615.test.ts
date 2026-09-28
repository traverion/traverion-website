import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1615: listing creation mobile step rail columns', () => {
  it('sizes the progress grid from items.length instead of hard-coded 5', () => {
    const src = readFileSync(resolve(__dirname, 'ListingCreationMobileProgress.tsx'), 'utf8');
    expect(src).toContain('Phase 1615');
    expect(src).toContain('gridTemplateColumns');
    expect(src).toContain('items.length');
    expect(src).not.toContain('grid-cols-5');
  });
});
