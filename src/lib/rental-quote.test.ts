import { describe, expect, it } from 'vitest';
import { emptyRentalDetails, normalizeRentalDetails } from './rental-details';
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

  it('quotes one day from the option price after an inherited rate is copied', () => {
    const rental = normalizeRentalDetails(thermalListing());
    expect(rental?.variants?.find((variant) => variant.id === 'm')?.pricingOverride?.pricePerDayMinor).toBe(2000);
    expect(rental?.variants?.find((variant) => variant.id === 'xl')?.pricingOverride?.pricePerDayMinor).toBe(2500);
    const result = quoteRentalLine({
      rental: rental!,
      variantId: 'm',
      quantity: 1,
      durationCount: 1,
      unit: 'day',
      commissionBps: bps,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unitMinor).toBe(2000);
    expect(result.customerTotalMinor).toBe(2000);
    expect(result.commissionMinor).toBe(Math.floor((2000 * bps) / 10000));
    expect(result.supplierEarningsMinor).toBe(2000 - result.commissionMinor);
    const premium = quoteRentalLine({
      rental: rental!,
      variantId: 'xl',
      quantity: 1,
      durationCount: 1,
      unit: 'day',
      commissionBps: bps,
    });
    expect(premium.ok).toBe(true);
    if (!premium.ok) return;
    expect(premium.unitMinor).toBe(2500);
  });

  it('quotes one hour from the option hour price and keeps the day price separate', () => {
    const rental = normalizeRentalDetails({
      durationMode: 'both',
      minDurationHours: 1,
      maxDurationHours: 8,
      minDurationDays: 1,
      maxDurationDays: 14,
      sharedPricing: { pricePerHourMinor: 500, pricePerDayMinor: 9000 },
      variants: [{ id: 'a', name: 'A', quantity: 2, pricingOverride: { pricePerHourMinor: 700 } }],
    });
    const hour = quoteRentalLine({
      rental: rental!,
      variantId: 'a',
      quantity: 1,
      durationCount: 1,
      unit: 'hour',
      commissionBps: bps,
    });
    expect(hour.ok).toBe(true);
    if (!hour.ok) return;
    expect(hour.unitMinor).toBe(700);
    expect(hour.customerTotalMinor).toBe(700);
    expect(hour.commissionMinor).toBe(Math.floor((700 * bps) / 10000));
    expect(hour.supplierEarningsMinor).toBe(700 - hour.commissionMinor);
    const day = quoteRentalLine({
      rental: rental!,
      variantId: 'a',
      quantity: 1,
      durationCount: 1,
      unit: 'day',
      commissionBps: bps,
    });
    expect(day.ok).toBe(true);
    if (!day.ok) return;
    expect(day.unitMinor).toBe(9000);
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

  it('enforces the selected option rental type even when the listing still says both', () => {
    const rental: RentalDetails = {
      ...emptyRentalDetails(),
      durationMode: 'both',
      minDurationHours: 1,
      maxDurationHours: 8,
      minDurationDays: 1,
      maxDurationDays: 7,
      variants: [
        {
          id: 'hour-only',
          name: 'Hour only',
          quantity: 2,
          durationMode: 'hourly',
          minDurationHours: 2,
          maxDurationHours: 6,
          pricingOverride: { pricePerHourMinor: 900 },
        },
      ],
    };
    expect(
      quoteRentalLine({
        rental,
        variantId: 'hour-only',
        quantity: 1,
        durationCount: 1,
        unit: 'day',
        commissionBps: bps,
      }).ok,
    ).toBe(false);
    const hour = quoteRentalLine({
      rental,
      variantId: 'hour-only',
      quantity: 1,
      durationCount: 1,
      unit: 'hour',
      commissionBps: bps,
    });
    expect(hour.ok).toBe(false); // below option min 2 hours
    const ok = quoteRentalLine({
      rental,
      variantId: 'hour-only',
      quantity: 1,
      durationCount: 3,
      unit: 'hour',
      commissionBps: bps,
    });
    expect(ok.ok).toBe(true);
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
