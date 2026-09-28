import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer B: destination slug pages only count live tour/stay inventory (not experience/package ghosts).
 * Layer C: breadcrumb exposes the current destination with aria-current="page".
 * Layer C: tour/stay catalog blocks are named regions for screen readers.
 */
describe('DestinationPage traveler catalog + breadcrumb', () => {
  it('names Tours and Stays sections with aria-labelledby headings', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'DestinationPage.tsx'),
      'utf8'
    );
    expect(src).toMatch(/aria-labelledby="destination-tours-heading"/);
    expect(src).toMatch(/id="destination-tours-heading"/);
    expect(src).toMatch(/aria-labelledby="destination-stays-heading"/);
    expect(src).toMatch(/id="destination-stays-heading"/);
  });

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
