import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookingPageQuoteFailureFocusTarget } from './tour-quote-failure-focus';
import { tourStickyBookCtaLabel } from './tour-sticky-cta';

const here = dirname(fileURLToPath(import.meta.url));

describe('bookingPageQuoteFailureFocusTarget', () => {
  it('Phase 1545: maps party and date failures to booking-flow controls', () => {
    expect(
      bookingPageQuoteFailureFocusTarget({ quoteCode: 'party', quoteError: 'guest count' }).scrollId
    ).toBe('booking-flow-guests');
    expect(
      bookingPageQuoteFailureFocusTarget({ quoteCode: 'bad_date', quoteError: 'cutoff' }).scrollId
    ).toBe('booking-flow-date-input');
  });
});

describe('BookingPage quote-failure honesty (Phase 1545)', () => {
  const src = readFileSync(join(here, '../pages/BookingPage.tsx'), 'utf8');

  it('imports sticky CTA + booking-page focus helpers', () => {
    expect(src).toContain("from '../lib/tour-sticky-cta'");
    expect(src).toContain('bookingPageQuoteFailureFocusTarget');
    expect(src).toContain('tourStickyBookCtaLabel');
  });

  it('does not invent catalog totals when quote fails', () => {
    expect(src).toMatch(/quoteFailed[\s\S]*total = quoted \? quoted\.totalAmount : quoteFailed \? null/);
    expect(src).toContain('totalLabel');
  });

  it('sticky CTA uses tourStickyBookCtaLabel for honest failure labels', () => {
    expect(
      tourStickyBookCtaLabel({
        hasDate: true,
        hasOption: true,
        needsDeparture: false,
        quoteInvalid: true,
        quoteCode: 'bad_date',
        quoteError: 'cutoff',
      })
    ).toBe('Fix date');
  });
});
