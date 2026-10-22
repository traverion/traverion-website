import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('TourAvailableOptions quote honesty (Phase 1560 / tour details polish)', () => {
  const options = readFileSync(join(here, '../components/tour-detail/TourAvailableOptions.tsx'), 'utf8');
  const details = readFileSync(join(here, '../pages/TourDetails.tsx'), 'utf8');
  const cardPrice = readFileSync(join(here, 'tour-option-card-price.ts'), 'utf8');

  it('option cards use selection-aligned pricing helper (not cheapest child From)', () => {
    expect(options).toContain('optionCardPriceForSelection');
    expect(cardPrice).toContain('quoteBooking');
    expect(cardPrice).toContain('optionHeadlineUnitPrice');
  });

  it('hides price on selected option when hideCatalogPrice', () => {
    expect(options).toContain('Phase 1560');
    expect(options).toMatch(/hideCatalogPrice[\s\S]*Price unavailable/);
  });

  it('TourDetails passes hideSelectedCatalogPrice from failed panelQuote', () => {
    expect(details).toMatch(
      /hideSelectedCatalogPrice=\{Boolean\(\s*selectedBookingVariant && panelQuote && !panelQuote\.ok/
    );
  });

  it('TourDetails passes tour + participant context into option cards', () => {
    expect(details).toMatch(/<TourAvailableOptions[\s\S]*tour=\{tour\}/);
    expect(details).toMatch(/participantMix=\{participantMix\}/);
    expect(details).toMatch(/guests=\{guests\}/);
  });
});

describe('TourDetails desktop panel quoted hero (Phase 1561)', () => {
  const details = readFileSync(join(here, '../pages/TourDetails.tsx'), 'utf8');

  it('shows panelQuote total as hero when quote ok', () => {
    expect(details).toContain('Phase 1561');
    expect(details).toMatch(
      /selectedBookingVariant && panelQuote\?\.ok[\s\S]*quotedOfferPrice\(panelQuote\)/
    );
  });
});
