import { describe, expect, it } from 'vitest';
import { stayStickyBookCtaLabel } from './stay-sticky-cta';
import { TRAVELER_CONTINUE_TEST_CTA, TRAVELER_OPENING_CHECKOUT_CTA } from './booking-confirmation-copy';

describe('stayStickyBookCtaLabel', () => {
  it('names unavailable dates instead of Continue', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: true,
        quoteOk: true,
        checkIn: '2026-10-01',
        checkOut: '2026-10-03',
        minNights: 1,
      })
    ).toBe('Dates unavailable');
  });

  it('names occupancy load failure instead of Continue', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: true,
        leadGuestReady: true,
        checkIn: '2026-10-01',
        checkOut: '2026-10-03',
        minNights: 1,
        occupancyUnavailable: true,
      })
    ).toBe('Availability unavailable');
  });

  it('asks for check-out before implying ready', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: false,
        checkIn: '2026-10-01',
        checkOut: '',
        minNights: 2,
      })
    ).toBe('Pick check-out');
  });

  it('surfaces minimum-stay failures honestly', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: false,
        checkIn: '2026-10-01',
        checkOut: '2026-10-02',
        quoteError: 'Minimum stay is 2 nights.',
        minNights: 2,
      })
    ).toBe('Need 2+ nights');
  });

  it('only says Continue · test mode when quote is ok and lead guest is ready', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: true,
        leadGuestReady: true,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        minNights: 1,
      })
    ).toBe(TRAVELER_CONTINUE_TEST_CTA);
  });

  it('asks for guest name before Continue when quote is ok', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: true,
        leadGuestReady: false,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        minNights: 1,
      })
    ).toBe('Add guest name');
  });

  it('uses Opening checkout… while Stripe opens', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        paying: true,
        quoteOk: true,
        leadGuestReady: true,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        minNights: 1,
      })
    ).toBe(TRAVELER_OPENING_CHECKOUT_CTA);
  });

  it('names generic quote failures as Fix dates', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: false,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        quoteError: 'Those nights are already booked.',
        minNights: 1,
      })
    ).toBe('Fix dates');
  });
});
