import { describe, expect, it } from 'vitest';
import {
  STAY_CONFIRM_PAYMENT_CTA,
  STAY_REVIEW_BOOKING_CTA,
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

  it('asks to review booking before Stripe when quote is ok and lead guest is ready', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: true,
        leadGuestReady: true,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        minNights: 1,
      })
    ).toBe(STAY_REVIEW_BOOKING_CTA);
  });

  it('confirm CTA on review step', () => {
    expect(
      stayStickyBookCtaLabel({
        selectionOccupied: false,
        quoteOk: true,
        leadGuestReady: true,
        checkIn: '2026-10-01',
        checkOut: '2026-10-04',
        minNights: 1,
        step: 'review',
      })
    ).toBe(STAY_CONFIRM_PAYMENT_CTA);
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

  it('names generic date/booked quote failures as Fix dates', () => {
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
