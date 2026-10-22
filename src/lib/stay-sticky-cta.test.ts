import { describe, expect, it } from 'vitest';
import {
  STAY_CONFIRM_PAYMENT_CTA,
  STAY_RESERVE_CTA,
  stayStickyBookCtaLabel,
} from './stay-sticky-cta';
import { TRAVELER_OPENING_CHECKOUT_CTA } from './booking-confirmation-copy';

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

  it('listing CTA is Reserve when quote is ok', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: true,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        minNights: 1,
      })
    ).toBe(STAY_RESERVE_CTA);
  });

  it('confirmation surface includes authoritative total on the payment CTA', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: true,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        minNights: 1,
        surface: 'confirmation',
        totalAmount: 161.6,
        currency: 'EUR',
      })
    ).toBe(`${STAY_CONFIRM_PAYMENT_CTA} · €161.60`);
  });

  it('uses Opening checkout… while Stripe opens', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        paying: true,
        quoteOk: true,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        minNights: 1,
        surface: 'confirmation',
      })
    ).toBe(TRAVELER_OPENING_CHECKOUT_CTA);
  });

  it('Phase 1520: names capacity / guests / price quote failures honestly', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: false,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        quoteError: 'Guest capacity is unavailable for this stay.',
        minNights: 1,
      })
    ).toBe('Capacity unavailable');
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: false,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        quoteError: 'This stay allows up to 4 guests.',
        minNights: 1,
      })
    ).toBe('Fix guests');
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: false,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        quoteError: 'This stay does not have a nightly price yet.',
        minNights: 1,
      })
    ).toBe('Price unavailable');
  });
});
