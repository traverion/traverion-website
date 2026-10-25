import { describe, expect, it } from 'vitest';
import { emptyRentalDetails } from './rental-details';
import { quoteRentalLine, quoteRentalWithAvailability } from './rental-quote';
import type { RentalDetails } from '../types/rental';
import { COMMERCIAL_PLANS } from './commercial-money';

function thermalListing(): RentalDetails {
  return {
    ...emptyRentalDetails(),
    durationMode: 'daily',
    minDurationDays: 1,
    maxDurationDays: 14,
    sharedPricing: {
      pricePerDayMinor: 2000,
      multiDayDiscountPercent: 10,
      multiDayDiscountMinDays: 3,
    },
    variants: [
      { id: 'm', name: 'M', quantity: 5, pricingOverride: null },
      {
        id: 'xl',
        name: 'XL',
        quantity: 2,
        pricingOverride: { pricePerDayMinor: 2500 },
      },
    ],
  };
}

describe('quoteRentalLine', () => {
  const bps = COMMERCIAL_PLANS.standard.commissionBps;

  it('quotes €20/day × 3 days × 2 units with multi-day discount', () => {
    // 2000 * 2 * 3 = 12000 → 10% off = 10800
    const result = quoteRentalLine({
      rental: thermalListing(),
      variantId: 'm',
      quantity: 2,
      durationCount: 3,
      unit: 'day',
      commissionBps: bps,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.customerTotalMinor).toBe(10800);
    expect(result.discountApplied).toBe(true);
    expect(result.commissionMinor + result.supplierEarningsMinor).toBe(10800);
    expect(result.commissionMinor).toBe(Math.floor((10800 * bps) / 10000));
  });

  it('uses variant override pricing', () => {
    const result = quoteRentalLine({
      rental: thermalListing(),
      variantId: 'xl',
      quantity: 1,
      durationCount: 1,
      unit: 'day',
      commissionBps: bps,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unitMinor).toBe(2500);
    expect(result.customerTotalMinor).toBe(2500);
  });

  it('rejects quantity above stock and hourly when mode is daily', () => {
    expect(
      quoteRentalLine({
        rental: thermalListing(),
        variantId: 'm',
        quantity: 6,
        durationCount: 1,
        unit: 'day',
        commissionBps: bps,
      }).ok
    ).toBe(false);
    expect(
      quoteRentalLine({
        rental: thermalListing(),
        variantId: 'm',
        quantity: 1,
        durationCount: 2,
        unit: 'hour',
        commissionBps: bps,
      }).ok
    ).toBe(false);
  });

  it('rejects duration below minimum', () => {
    const rental = { ...thermalListing(), minDurationDays: 2 };
    const result = quoteRentalLine({
      rental,
      variantId: 'm',
      quantity: 1,
      durationCount: 1,
      unit: 'day',
      commissionBps: bps,
    });
    expect(result.ok).toBe(false);
  });

  it('quoteRentalWithAvailability requires free stock for the interval', () => {
    const pickup = Date.parse('2030-01-10T09:00:00Z');
    const ret = Date.parse('2030-01-12T18:00:00Z');
    const blocked = quoteRentalWithAvailability({
      rental: thermalListing(),
      variantId: 'm',
      quantity: 2,
      durationCount: 2,
      unit: 'day',
      commissionBps: bps,
      availability: {
        pickupReturn: { startMs: pickup, endMs: ret },
        bufferMinutes: 0,
        bookingNoticeHours: 0,
        nowMs: Date.parse('2029-12-01T00:00:00Z'),
        blocks: [],
        occupancies: [
          { variantId: 'm', quantity: 4, interval: { startMs: pickup, endMs: ret } },
        ],
      },
    });
    expect(blocked.ok).toBe(false);

    const ok = quoteRentalWithAvailability({
      rental: thermalListing(),
      variantId: 'm',
      quantity: 2,
      durationCount: 2,
      unit: 'day',
      commissionBps: bps,
      availability: {
        pickupReturn: { startMs: pickup, endMs: ret },
        bufferMinutes: 0,
        bookingNoticeHours: 0,
        nowMs: Date.parse('2029-12-01T00:00:00Z'),
        blocks: [],
        occupancies: [],
      },
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.customerTotalMinor).toBe(8000);
    expect(ok.availability.available).toBe(5);
  });
});
