import { describe, expect, it } from 'vitest';
import { resolveStayLodgingWithOffers } from './stay-offer-pricing';

describe('resolveStayLodgingWithOffers', () => {
  it('discounts only nights inside the Discount period', () => {
    const result = resolveStayLodgingWithOffers({
      nightDates: ['2026-07-01', '2026-07-02', '2026-07-03'],
      baseNightlyPrices: [100, 100, 100],
      lengthOfStayDiscount: 0,
      lengthOfStayLabel: null,
      discounts: [
        {
          id: 'offer-a',
          type: 'percent',
          value: 20,
          valid_from: '2026-07-02',
          valid_until: '2026-07-02',
        },
      ],
    });
    // One night at 20% off → 20 savings on 300 base
    expect(result.discount).toBe(20);
    expect(result.appliedDiscountId).toBe('offer-a');
    expect(result.lodging).toBe(300);
  });

  it('does not stack timed Offers with weekly length discounts — picks the better total', () => {
    const weeklyWins = resolveStayLodgingWithOffers({
      nightDates: ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07'],
      baseNightlyPrices: [100, 100, 100, 100, 100, 100, 100],
      lengthOfStayDiscount: 140, // 20% weekly on 700
      lengthOfStayLabel: 'Weekly discount (20% off the nightly rate)',
      discounts: [
        {
          id: 'offer-b',
          type: 'percent',
          value: 10,
          valid_from: '2026-07-01',
          valid_until: '2026-07-07',
        },
      ],
    });
    expect(weeklyWins.appliedDiscountId).toBeNull();
    expect(weeklyWins.discount).toBe(140);

    const offerWins = resolveStayLodgingWithOffers({
      nightDates: ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07'],
      baseNightlyPrices: [100, 100, 100, 100, 100, 100, 100],
      lengthOfStayDiscount: 70, // 10% weekly
      lengthOfStayLabel: 'Weekly discount (10% off the nightly rate)',
      discounts: [
        {
          id: 'offer-c',
          type: 'percent',
          value: 25,
          valid_from: '2026-07-01',
          valid_until: '2026-07-07',
        },
      ],
    });
    expect(offerWins.appliedDiscountId).toBe('offer-c');
    expect(offerWins.discount).toBe(175);
  });
});
