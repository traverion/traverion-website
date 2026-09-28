import { describe, expect, it } from 'vitest';
import { tourStickyBookCtaLabel, tourQuoteFailureCtaLabel } from './tour-sticky-cta';
import { tourQuoteFailureFocusTarget } from './tour-quote-failure-focus';
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
    ).toBe(TRAVELER_CONTINUE_TEST_CTA);
    expect(
      tourStickyBookCtaLabel({ hasDate: true, hasOption: true, needsDeparture: false, soldOut: true })
    ).toBe('Sold out');
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

  it('Phase 1529: quote failures name the real problem (not always Fix guests)', () => {
    expect(
      tourStickyBookCtaLabel({
        hasDate: true,
        hasOption: true,
        needsDeparture: false,
        quoteInvalid: true,
        quoteError: 'Guest count must be between 1 and 99.',
        quoteCode: 'party',
      })
    ).toBe('Fix guests');
    expect(
      tourStickyBookCtaLabel({
        hasDate: true,
        hasOption: true,
        needsDeparture: false,
        quoteInvalid: true,
        quoteError: 'This tour does not have a bookable price yet.',
        quoteCode: 'price',
      })
    ).toBe('Price unavailable');
    expect(
      tourStickyBookCtaLabel({
        hasDate: true,
        hasOption: true,
        needsDeparture: false,
        quoteInvalid: true,
        quoteError: 'Choose a date that is today or later.',
        quoteCode: 'bad_date',
      })
    ).toBe('Fix date');
    expect(tourQuoteFailureCtaLabel('Choose a booking option to continue.', 'option')).toBe(
      'Choose option'
    );
    // Phase 1530: departure message must win even if legacy code was option
    expect(
      tourQuoteFailureCtaLabel('Choose a departure time to continue.', 'option')
    ).toBe('Pick time');
    expect(tourQuoteFailureCtaLabel('Choose a departure time to continue.', 'time')).toBe(
      'Pick time'
    );
  });
});

describe('tourQuoteFailureFocusTarget', () => {
  it('Phase 1529: focuses the fixable control', () => {
    expect(tourQuoteFailureFocusTarget({ quoteCode: 'party' }).scrollId).toBe('tour-booking-panel');
    expect(tourQuoteFailureFocusTarget({ quoteCode: 'time' }).scrollId).toBe('tour-departure-times');
    expect(tourQuoteFailureFocusTarget({ quoteCode: 'bad_date' }).scrollId).toBe('tour-booking-panel');
  });
});
