import { describe, expect, it } from 'vitest';
import { RENTAL_DEV_PREVIEW_LISTINGS } from '../data/rental-dev-preview.fixtures';
import { normalizeRentalDetails } from './rental-details';
import { quoteRentalLine } from './rental-quote';
import { isRentalDevPreviewId, RENTAL_DEV_PREVIEW_IDS } from './rental-dev-preview';
import { COMMERCIAL_PLANS } from './commercial-money';

describe('rental dev previews', () => {
  it('uses reserved ids and never invents ratings', () => {
    expect(RENTAL_DEV_PREVIEW_LISTINGS.map((row) => row.id)).toEqual([...RENTAL_DEV_PREVIEW_IDS]);
    for (const row of RENTAL_DEV_PREVIEW_LISTINGS) {
      expect(isRentalDevPreviewId(row.id)).toBe(true);
      expect(row.rating).toBe(0);
      expect(row.reviews).toBe(0);
      expect(row.isSeedData).toBe(true);
      expect(row.listingExtras?.inventoryFamily).toBe('rental');
    }
    expect(isRentalDevPreviewId('11111111-1111-4111-8111-111111111111')).toBe(false);
  });

  it('keeps hourly and daily prices on the option that owns them', () => {
    const camera = normalizeRentalDetails(
      RENTAL_DEV_PREVIEW_LISTINGS.find((row) => row.id.endsWith('0003'))?.listingExtras?.rental
    );
    const bikes = normalizeRentalDetails(
      RENTAL_DEV_PREVIEW_LISTINGS.find((row) => row.id.endsWith('0001'))?.listingExtras?.rental
    );
    expect(camera?.durationMode).toBe('hourly');
    expect(bikes?.durationMode).toBe('daily');
    const body = quoteRentalLine({
      rental: camera!,
      variantId: '00000000-0000-4000-8000-000000000301',
      quantity: 1,
      durationCount: 2,
      unit: 'hour',
      commissionBps: COMMERCIAL_PLANS.standard.commissionBps,
    });
    const kit = quoteRentalLine({
      rental: camera!,
      variantId: '00000000-0000-4000-8000-000000000302',
      quantity: 1,
      durationCount: 2,
      unit: 'hour',
      commissionBps: COMMERCIAL_PLANS.standard.commissionBps,
    });
    const city = quoteRentalLine({
      rental: bikes!,
      variantId: '00000000-0000-4000-8000-000000000101',
      quantity: 2,
      durationCount: 1,
      unit: 'day',
      commissionBps: COMMERCIAL_PLANS.standard.commissionBps,
    });
    const eBike = quoteRentalLine({
      rental: bikes!,
      variantId: '00000000-0000-4000-8000-000000000102',
      quantity: 1,
      durationCount: 1,
      unit: 'day',
      commissionBps: COMMERCIAL_PLANS.standard.commissionBps,
    });
    expect(body.ok && kit.ok && city.ok && eBike.ok).toBe(true);
    if (!body.ok || !kit.ok || !city.ok || !eBike.ok) return;
    expect(body.customerTotalMinor).toBe(2400);
    expect(kit.customerTotalMinor).toBe(3600);
    expect(city.customerTotalMinor).toBe(3600);
    expect(eBike.customerTotalMinor).toBe(4200);
    expect(
      quoteRentalLine({
        rental: camera!,
        variantId: '00000000-0000-4000-8000-000000000301',
        quantity: 1,
        durationCount: 1,
        unit: 'day',
        commissionBps: COMMERCIAL_PLANS.standard.commissionBps,
      }).ok
    ).toBe(false);
    expect(
      quoteRentalLine({
        rental: bikes!,
        variantId: '00000000-0000-4000-8000-000000000102',
        quantity: 3,
        durationCount: 1,
        unit: 'day',
        commissionBps: COMMERCIAL_PLANS.standard.commissionBps,
      }).ok
    ).toBe(false);
  });
});
