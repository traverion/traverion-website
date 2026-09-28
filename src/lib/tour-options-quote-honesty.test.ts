import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('TourAvailableOptions quote honesty (Phase 1560)', () => {
  const options = readFileSync(join(here, '../components/tour-detail/TourAvailableOptions.tsx'), 'utf8');
  const details = readFileSync(join(here, '../pages/TourDetails.tsx'), 'utf8');

  it('hides catalog price on selected option when hideCatalogPrice', () => {
    expect(options).toContain('Phase 1560');
    expect(options).toMatch(/hideCatalogPrice[\s\S]*\? '—'/);
  });

  it('TourDetails passes hideSelectedCatalogPrice from failed panelQuote', () => {
    expect(details).toMatch(
      /hideSelectedCatalogPrice=\{Boolean\(\s*selectedBookingVariant && panelQuote && !panelQuote\.ok/
    );
  });

  it('sticky does not stall on Checking offers when panelQuote already failed', () => {
    expect(details).toContain('Phase 1560');
    expect(details).toMatch(
      /discountsByListing == null && !\(selectedBookingVariant && panelQuote\)/
    );
  });
});
