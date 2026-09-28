import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: destination slug pages only count live tour/stay inventory (not experience/package ghosts).
 * Layer C: breadcrumb exposes the current destination with aria-current="page".
 */
describe('DestinationPage traveler catalog + breadcrumb', () => {
  it('filters to listingIsOnTravelerCatalog and marks current destination in breadcrumb', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'DestinationPage.tsx'),
      'utf8'
    );
    expect(src).toMatch(/listingIsOnTravelerCatalog\(t\)/);
    expect(src).toMatch(/aria-current="page"/);
    expect(src).toMatch(/\{label\}/);
  });
});
