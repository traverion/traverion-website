import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('TourDetails sticky quote honesty (Phase 1547)', () => {
  const src = readFileSync(join(here, '../pages/TourDetails.tsx'), 'utf8');

  it('shows — when option selected and panelQuote failed', () => {
    expect(src).toContain('Phase 1547');
    expect(src).toMatch(
      /selectedBookingVariant && panelQuote && !panelQuote\.ok[\s\S]*\? '—'/
    );
  });
});

describe('TourDetails desktop PriceHero honesty (Phase 1550)', () => {
  const src = readFileSync(join(here, '../pages/TourDetails.tsx'), 'utf8');

  it('hides catalog PriceHero when option selected and panelQuote failed', () => {
    expect(src).toMatch(
      /selectedBookingVariant && panelQuote && !panelQuote\.ok[\s\S]*tabular-nums text-ink">—</
    );
  });
});
