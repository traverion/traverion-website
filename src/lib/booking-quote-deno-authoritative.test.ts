/**
 * Direct regression coverage for supabase/functions/_shared/booking-quote.ts's
 * quoteListingBooking() -- the ACTUAL function create-booking-checkout-session
 * and promote-paid-from-checkout call to compute the amount charged via Stripe.
 *
 * This is deliberately NOT src/lib/booking-quote.ts's quoteBooking/quoteStayNights:
 * those are a differently-shaped sibling used only by frontend pages for price
 * display (BookingPage.tsx, StayDetails.tsx, etc.) and were already fully
 * Vitest-covered, but they never run on the server-authoritative payment path.
 * quoteListingBooking -- the function that actually determines real money --
 * had zero automated coverage anywhere: it isn't reachable from src/lib tests
 * (it doesn't exist there), Deno has no test runner wired up in this repo
 * (confirmed: no *.test.ts anywhere under supabase/functions), and the two
 * "Deno copy of src/lib/X.ts -- keep algorithms in sync" header files
 * (booking-hold.ts, booking-quote.ts) use a different header phrasing than the
 * "Mirror of src/lib/X.ts for Deno edge runtime" pattern the Phase 568
 * edge-function-deno-mirror-sync.test.ts specifically discovers, so they were
 * silently excluded from that safety net too.
 *
 * The Deno _shared files here have zero Deno-only globals (no `Deno.` refs)
 * and only one pure relative import, so Vitest can load and execute them
 * directly -- proven by importing them below.
 */
import { describe, expect, it } from 'vitest';
import { quoteListingBooking } from '../../supabase/functions/_shared/booking-quote.ts';
import type { DiscountRow, ListingQuoteRow } from '../../supabase/functions/_shared/booking-quote.ts';

const TODAY = '2026-06-01';

function stayListing(overrides: Partial<ListingQuoteRow> = {}, stayOverrides: Record<string, unknown> = {}): ListingQuoteRow {
  return {
    status: 'published',
    price_starting_from: 0,
    price_currency: 'EUR',
    listing_extras: {
      inventoryFamily: 'stay',
      stay: { nightlyPriceUsd: 120, cleaningFeeUsd: 30, minNights: 2, maxGuests: 4, ...stayOverrides },
    },
    group_size: null,
    ...overrides,
  };
}

function tourListingNoOptions(overrides: Partial<ListingQuoteRow> = {}): ListingQuoteRow {
  return {
    status: 'published',
    price_starting_from: 50,
    price_currency: 'USD',
    listing_extras: {},
    group_size: null,
    ...overrides,
  };
}

function tourListingWithOption(option: Record<string, unknown>, overrides: Partial<ListingQuoteRow> = {}): ListingQuoteRow {
  return {
    status: 'published',
    price_starting_from: 0,
    price_currency: 'USD',
    listing_extras: { bookingOptions: [option] },
    group_size: null,
    ...overrides,
  };
}

describe('quoteListingBooking (authoritative Deno pricing -- direct execution)', () => {
  describe('stay nights', () => {
    it('computes total as nights * nightly + cleaning', () => {
      const res = quoteListingBooking({
        listing: stayListing(),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 2,
        checkoutDate: '2026-06-13',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.totalAmount).toBe(3 * 120 + 30);
        expect(res.currency).toBe('EUR');
        expect(res.optionLabel).toBe('3 nights');
      }
    });

    it('rejects checkout equal to checkin (zero nights) -- must not fall through to tour capacity math', () => {
      const res = quoteListingBooking({
        listing: stayListing(),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 2,
        checkoutDate: '2026-06-10',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/check-out must be after check-in/i);
    });

    it('rejects checkout before checkin', () => {
      const res = quoteListingBooking({
        listing: stayListing(),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 2,
        checkoutDate: '2026-06-05',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/check-out must be after check-in/i);
    });

    it('rejects a check-in date in the past', () => {
      const res = quoteListingBooking({
        listing: stayListing(),
        discounts: [],
        bookingDate: '2026-05-01',
        guests: 2,
        checkoutDate: '2026-05-05',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/today or later/i);
    });

    it('enforces the listing minimum-nights rule', () => {
      const res = quoteListingBooking({
        listing: stayListing(),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 2,
        checkoutDate: '2026-06-11', // 1 night, minNights is 2
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/minimum stay/i);
    });

    it('enforces the listing maximum-guests rule', () => {
      const res = quoteListingBooking({
        listing: stayListing(),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 5, // maxGuests is 4
        checkoutDate: '2026-06-13',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/up to 4 guests/i);
    });

    it('rejects a stay listing with no nightly price configured', () => {
      const res = quoteListingBooking({
        listing: stayListing({}, { nightlyPriceUsd: 0 }),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 2,
        checkoutDate: '2026-06-13',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/nightly price/i);
    });

    it('defaults cleaning fee to 0 when unset', () => {
      const res = quoteListingBooking({
        listing: stayListing({}, { cleaningFeeUsd: undefined }),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 2,
        checkoutDate: '2026-06-13',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.totalAmount).toBe(3 * 120);
    });

    it('rejects an unpublished stay listing before ever looking at dates', () => {
      const res = quoteListingBooking({
        listing: stayListing({ status: 'draft' }),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 2,
        checkoutDate: '2026-06-13',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/not available to book/i);
    });

    // Phase 583: migration 003 gave listings.status no NOT NULL
    // constraint (its CHECK does not restrict NULL either), so any
    // authenticated supplier could set status: null directly via the
    // REST API -- bypassing the migration-082 publish-verification
    // trigger (which only fires on new.status = 'published') -- and this
    // exact function, the one Stripe checkout actually uses to compute
    // the charge, used to treat a falsy status as bookable. Proved this
    // against the unmodified function before fixing it: both cases
    // returned ok: true. Must be rejected exactly like an explicit draft.
    it('rejects a stay listing with status: null exactly like draft (migration-082 verification bypass)', () => {
      const res = quoteListingBooking({
        listing: stayListing({ status: null as unknown as string }),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 2,
        checkoutDate: '2026-06-13',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/not available to book/i);
    });

    it('rejects a stay listing with status: "" (empty string) exactly like draft', () => {
      const res = quoteListingBooking({
        listing: stayListing({ status: '' }),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 2,
        checkoutDate: '2026-06-13',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/not available to book/i);
    });
  });

  describe('tour, no booking options configured', () => {
    it('charges price_starting_from * guests', () => {
      const res = quoteListingBooking({
        listing: tourListingNoOptions(),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 3,
        todayIso: TODAY,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.totalAmount).toBe(150);
        expect(res.currency).toBe('USD');
      }
    });

    it('rejects a guest count outside the default 1-12 group-size bounds', () => {
      const res = quoteListingBooking({
        listing: tourListingNoOptions(),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 13,
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/no more than 12 guests/i);
    });

    it('rejects a listing with no bookable price', () => {
      const res = quoteListingBooking({
        listing: tourListingNoOptions({ price_starting_from: 0 }),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 1,
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/bookable price/i);
    });
  });

  describe('tour with a standard booking option + discounts', () => {
    const option = {
      id: 'opt-1',
      name: 'City Walk',
      priceUsd: 100,
      minPersons: 1,
      maxPersons: 10,
      weekdays: [true, true, true, true, true, true, true],
      availabilityDateFrom: '',
      availabilityDateTo: '',
    };

    it('applies the best (lowest-price) discount among applicable rows', () => {
      const discounts: DiscountRow[] = [
        { type: 'percent', value: 10, valid_from: null, valid_until: null, booking_option_id: null },
        { type: 'flat', value: 5, valid_from: null, valid_until: null, booking_option_id: null }, // 100-5=95, cheaper than 90
      ];
      const res = quoteListingBooking({
        listing: tourListingWithOption(option),
        discounts,
        bookingDate: '2026-06-10',
        guests: 2,
        bookingOptionId: 'opt-1',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.unitPrice).toBe(90); // percent discount (10%) wins: 100*0.9=90 < flat 95
        expect(res.totalAmount).toBe(180);
      }
    });

    it('does not apply a discount scoped to a different booking option', () => {
      const discounts: DiscountRow[] = [
        { type: 'percent', value: 50, valid_from: null, valid_until: null, booking_option_id: 'some-other-option' },
      ];
      const res = quoteListingBooking({
        listing: tourListingWithOption(option),
        discounts,
        bookingDate: '2026-06-10',
        guests: 1,
        bookingOptionId: 'opt-1',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.totalAmount).toBe(100);
    });

    it('rejects a discount that has expired (valid_until in the past)', () => {
      const discounts: DiscountRow[] = [
        { type: 'percent', value: 90, valid_from: null, valid_until: '2026-01-01', booking_option_id: null },
      ];
      const res = quoteListingBooking({
        listing: tourListingWithOption(option),
        discounts,
        bookingDate: '2026-06-10',
        guests: 1,
        bookingOptionId: 'opt-1',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.totalAmount).toBe(100); // full price -- discount window already closed
    });

    it('rejects an unknown bookingOptionId rather than silently falling back', () => {
      const res = quoteListingBooking({
        listing: tourListingWithOption(option),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 1,
        bookingOptionId: 'does-not-exist',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/not available/i);
    });

    it('enforces per-option minPersons/maxPersons over the listing default bounds', () => {
      const narrowOption = { ...option, minPersons: 4, maxPersons: 6 };
      const res = quoteListingBooking({
        listing: tourListingWithOption(narrowOption),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 2,
        bookingOptionId: 'opt-1',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/at least 4 guests/i);
    });
  });

  describe('tour, private flat-group pricing', () => {
    const privateOption = {
      id: 'opt-priv',
      name: 'Private Charter',
      priceUsd: 500,
      minPersons: 1,
      maxPersons: 8,
      weekdays: [true, true, true, true, true, true, true],
      availabilityDateFrom: '',
      availabilityDateTo: '',
      isPrivate: true,
      privatePricing: 'flat_group',
      privateGroupPriceUsd: 600,
    };

    it('charges the flat group price regardless of guest count, not price * guests', () => {
      const res = quoteListingBooking({
        listing: tourListingWithOption(privateOption),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 5,
        bookingOptionId: 'opt-priv',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.totalAmount).toBe(600);
        expect(res.unitPrice).toBe(120); // 600 / 5, for display only -- totalAmount is what Stripe charges
      }
    });

    it('still enforces minPersons/maxPersons on a flat-group option', () => {
      const res = quoteListingBooking({
        listing: tourListingWithOption(privateOption),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 9,
        bookingOptionId: 'opt-priv',
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/no more than 8 guests/i);
    });
  });

  describe('tour, age-dependent participant pricing', () => {
    const ageOption = {
      id: 'opt-age',
      name: 'Family Tour',
      priceUsd: 0,
      minPersons: 1,
      maxPersons: 10,
      weekdays: [true, true, true, true, true, true, true],
      availabilityDateFrom: '',
      availabilityDateTo: '',
      pricingMode: 'age_dependent',
      priceCategories: [
        { id: 'adult', label: 'Adult', kind: 'adult', priceUsd: 80, notPermitted: false, requiresAdult: false, countsTowardCapacity: true },
        { id: 'child', label: 'Child', kind: 'child', priceUsd: 40, notPermitted: false, requiresAdult: true, countsTowardCapacity: true },
      ],
    };

    it('sums quantities across categories using each category price', () => {
      const res = quoteListingBooking({
        listing: tourListingWithOption(ageOption),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 3,
        bookingOptionId: 'opt-age',
        participantMix: { adult: 2, child: 1 },
        todayIso: TODAY,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.totalAmount).toBe(2 * 80 + 1 * 40);
        expect(res.guests).toBe(3);
      }
    });

    it('rejects a child participant with no accompanying adult', () => {
      const res = quoteListingBooking({
        listing: tourListingWithOption(ageOption),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 1,
        bookingOptionId: 'opt-age',
        participantMix: { child: 1 },
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/accompanied by an adult/i);
    });

    it('rejects an empty participant mix', () => {
      const res = quoteListingBooking({
        listing: tourListingWithOption(ageOption),
        discounts: [],
        bookingDate: '2026-06-10',
        guests: 0,
        bookingOptionId: 'opt-age',
        participantMix: {},
        todayIso: TODAY,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/at least one participant/i);
    });
  });
});
