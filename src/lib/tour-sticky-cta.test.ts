import { describe, expect, it } from 'vitest';
import { tourStickyBookCtaLabel } from './tour-sticky-cta';
import { TRAVELER_CONTINUE_TEST_CTA } from './booking-confirmation-copy';

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
    ).toBe(TRAVELER_CONTINUE_TEST_CTA);    expect(
      tourStickyBookCtaLabel({ hasDate: true, hasOption: true, needsDeparture: false, soldOut: true })
    ).toBe('Sold out');
    expect(
      tourStickyBookCtaLabel({ hasDate: true, hasOption: true, needsDeparture: false, quoteInvalid: true })
    ).toBe('Fix guests');
    expect(
      tourStickyBookCtaLabel({
        hasDate: true,
        hasOption: true,
        needsDeparture: false,
        capacityUnknown: true,
      })
    ).toBe('Capacity unavailable');
    expect(
      tourStickyBookCtaLabel({
        hasDate: true,
        hasOption: true,
        needsDeparture: false,
        selfBookBlocked: true,
      })
    ).toBe('Cannot book own listing');
    expect(
      tourStickyBookCtaLabel({
        hasDate: true,
        hasOption: true,
        needsDeparture: false,
        selfBookCheckFailed: true,
      })
    ).toBe('Eligibility unavailable');
  });
});
