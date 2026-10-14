import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1615: listing creation mobile step rail', () => {
  it('renders a horizontal step strip driven by items instead of a hard-coded 5-column grid', () => {
    const progress = readFileSync(resolve(__dirname, 'ListingCreationMobileProgress.tsx'), 'utf8');
    const strip = readFileSync(resolve(__dirname, 'ListingCreationMobileStepStrip.tsx'), 'utf8');
    expect(progress).toContain('ListingCreationMobileStepStrip');
    expect(progress).toContain('items');
    expect(strip).toContain('items.map');
    expect(progress).not.toContain('grid-cols-5');
    expect(strip).not.toContain('grid-cols-5');
  });
});
