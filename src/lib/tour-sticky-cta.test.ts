import { describe, expect, it } from 'vitest';
import { tourStickyBookCtaLabel } from './tour-sticky-cta';

describe('tourStickyBookCtaLabel', () => {
  it('names the missing booking step', () => {
    expect(
      tourStickyBookCtaLabel({ hasDate: false, hasOption: false, needsDeparture: false })
    ).toBe('Pick a date');
    expect(
      tourStickyBookCtaLabel({ hasDate: true, hasOption: false, needsDeparture: false, variantsOpen: true })
    ).toBe('Choose option');
    expect(
      tourStickyBookCtaLabel({ hasDate: true, hasOption: true, needsDeparture: true })
    ).toBe('Pick time');
    expect(
      tourStickyBookCtaLabel({ hasDate: true, hasOption: true, needsDeparture: false })
    ).toBe('Continue · TEST');
  });
});
