/**
 * Stay Instant Book: client quoteStayNights and edge quoteListingBooking must agree
 * on discounted totals (regression for UI €161.60 vs Stripe €188).
 *
 * Root cause of the live mismatch: production edge quoteStayListing omitted
 * resolveStayLodgingWithOffers, so Stripe charged undiscounted lodging + cleaning.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quoteStayNights } from './booking-quote';
import { quoteListingBooking } from '../../supabase/functions/_shared/booking-quote';

const stayExtras = {
  inventoryFamily: 'stay' as const,
  stay: {
    nightlyPriceUsd: 88,
    cleaningFeeUsd: 12,
    maxGuests: 4,
    minNights: 1,
    availabilityMode: 'open' as const,
    seasons: [
      {
        id: '67a5c899-a93c-420a-b3e3-4497a0ca52cd',
        end: '2027-01-30',
        name: 'Arctic Aurora Apartment',
        start: '2026-10-22',
        checkIn: '10:30',
        enabled: true,
        checkOut: '11:00',
        minNights: 1,
        cleaningFee: 12,
        nightlyPrice: 88,
      },
    ],
  },
};

const offer15 = {
  id: 'e94d7192-3b96-4954-b10b-17ef9d2ca824',
  type: 'percent',
  value: 15,
  valid_from: '2026-10-21',
  valid_until: '2026-10-31',
  booking_option_id: null as string | null,
  book_from: null,
  book_until: null,
  activity_from: null,
  activity_until: null,
  paused: false,
  deleted_at: null,
  booking_limit: null,
};

describe('Stay checkout quote parity — Arctic Aurora discount', () => {
  it('client quoteStayNights applies 15% offer → €161.60 for 26–28 Oct', () => {
    const q = quoteStayNights({
      tour: {
        status: 'published',
        price: { startingFrom: 88, currency: 'EUR' },
        listingExtras: stayExtras,
      },
      checkIn: '2026-10-26',
      checkOut: '2026-10-28',
      guests: 2,
      party: { adults: 2, children: 0, infants: 0 },
      discounts: [offer15 as never],
      todayIso: '2026-10-22',
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.nights).toBe(2);
    expect(q.cleaningFee).toBe(12);
    expect(q.discount).toBe(26.4);
    expect(q.totalAmount).toBe(161.6);
    expect(Math.round(q.totalAmount * 100)).toBe(16160);
    expect(q.appliedDiscountId).toBe(offer15.id);
  });

  it('edge quoteListingBooking applies the same offer → €161.60 (not undiscounted €188)', () => {
    const q = quoteListingBooking({
      listing: {
        status: 'published',
        price_starting_from: 88,
        price_currency: 'EUR',
        listing_extras: stayExtras,
        group_size: null,
      },
      discounts: [offer15],
      bookingDate: '2026-10-26',
      checkoutDate: '2026-10-28',
      guests: 2,
      stayParty: { adults: 2, children: 0, infants: 0 },
      todayIso: '2026-10-22',
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.totalAmount).toBe(161.6);
    expect(q.cleaningFee).toBe(12);
    expect(q.appliedDiscountId).toBe(offer15.id);
    expect(q.totalAmount).not.toBe(188);
  });

  it('undiscounted stay is 2×88 + 12 = €188 when offer is outside period', () => {
    const expired = { ...offer15, valid_from: '2026-09-01', valid_until: '2026-09-30' };
    const q = quoteStayNights({
      tour: {
        status: 'published',
        price: { startingFrom: 88, currency: 'EUR' },
        listingExtras: stayExtras,
      },
      checkIn: '2026-10-26',
      checkOut: '2026-10-28',
      guests: 2,
      party: { adults: 2, children: 0, infants: 0 },
      discounts: [expired as never],
      todayIso: '2026-10-22',
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.discount).toBe(0);
    expect(q.totalAmount).toBe(188);
  });

  it('no discount rows → full lodging + cleaning', () => {
    const q = quoteStayNights({
      tour: {
        status: 'published',
        price: { startingFrom: 88, currency: 'EUR' },
        listingExtras: stayExtras,
      },
      checkIn: '2026-10-26',
      checkOut: '2026-10-29',
      guests: 2,
      party: { adults: 2, children: 0, infants: 0 },
      discounts: [],
      todayIso: '2026-10-22',
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.nights).toBe(3);
    expect(q.totalAmount).toBe(276); // 3×88 + 12
  });

  it('edge checkout creates Stripe amount from quote.totalAmount (server-authoritative)', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/create-booking-checkout-session/index.ts'),
      'utf8'
    );
    const shared = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/booking-quote.ts'),
      'utf8'
    );
    expect(edge).toContain('const totalAmount = quote.totalAmount');
    expect(edge).toContain('const amountMinor = Math.round(totalAmount * 100)');
    expect(edge).toContain('unit_amount: amountMinor');
    expect(edge).toContain('quoted_total: String(totalAmount)');
    expect(edge).toContain('listing_discounts');
    expect(edge).toContain('expectedTotal');
    expect(edge).toContain('quote_changed');
    expect(shared).toContain('resolveStayLodgingWithOffers');
  });

  it('edge quoteStayListing passes baseCleaningFee for listing-level cleaning parity', () => {
    const edgeQuote = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/booking-quote.ts'),
      'utf8'
    );
    expect(edgeQuote).toMatch(/baseCleaningFee[\s\S]{0,80}cleaningFeeUsd|cleaningFeeUsd[\s\S]{0,120}baseCleaningFee/);
  });
});
