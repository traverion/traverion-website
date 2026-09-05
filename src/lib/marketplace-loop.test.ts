import { describe, expect, it } from 'vitest';
import { marketplaceLoopAssertions, runMarketplaceLoop, sampleNorthernLightsExperience } from './marketplace-loop';
import { getListingPublishBlockers } from './listingPublishGate';
import { buildMonthCells, nextBookedCount, previousBookedCount, remainingCapacity } from './availability-ops';
import { quoteBooking } from './booking-quote';
import { isListingVisibleToTravelers } from './product-workflows';

describe('marketplace loop', () => {
  it('runs supplier draft → publish → traveler quote → booking → supplier view', () => {
    const result = runMarketplaceLoop();
    expect(marketplaceLoopAssertions(result)).toEqual([]);
    expect(result.quotedTotal).toBe(298);
    expect(result.booking?.listing_id).toBe(sampleNorthernLightsExperience().id);
    expect(result.booking?.guests).toBe(2);
    expect(result.booking?.currency).toBe('EUR');
  });

  it('rejects a manipulated cheaper client total', () => {
    const result = runMarketplaceLoop({ clientTotalAttempt: 1 });
    expect(result.underpayRejected).toBe(true);
    expect(result.quotedTotal).toBe(298);
  });

  it('does not let travelers see or book a draft', () => {
    const draft = sampleNorthernLightsExperience({ status: 'draft' });
    expect(isListingVisibleToTravelers(draft.status)).toBe(false);
    const q = quoteBooking({
      tour: draft,
      discounts: [],
      bookingDate: '2026-09-12',
      guests: 2,
      bookingOptionId: 'opt-aurora',
      todayIso: '2026-09-05',
    });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.code).toBe('unpublished');
  });

  it('accepts a complete listing for publish', () => {
    expect(getListingPublishBlockers(sampleNorthernLightsExperience({ status: 'published' }))).toEqual([]);
  });
});

describe('availability ops', () => {
  it('increments booked by guests, not by one booking', () => {
    expect(nextBookedCount(2, 4)).toBe(6);
    expect(previousBookedCount(6, 4)).toBe(2);
    expect(remainingCapacity(8, 6)).toBe(2);
  });

  it('builds a Monday-first month grid', () => {
    const cells = buildMonthCells(2026, 8);
    expect(cells).toHaveLength(42);
    expect(cells[0].weekdayMon0).toBe(0);
    expect(cells.some((c) => c.iso === '2026-09-01' && c.inMonth)).toBe(true);
  });
});
