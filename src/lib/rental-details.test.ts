import { describe, expect, it } from 'vitest';
import {
  createDefaultRentalVariant,
  effectiveVariantPricing,
  emptyRentalDetails,
  ensureRentalHasDefaultVariant,
  normalizeRentalDetails,
  rentalVariantComplete,
} from './rental-details';
import { rentalPublishBlockers } from './rental-onboarding';
import type { RentalDetails } from '../types/rental';

describe('rental details', () => {
  it('assigns stable ids when normalizing variants without ids', () => {
    const normalized = normalizeRentalDetails({
      category: 'winter_clothing',
      variants: [{ name: 'Size M', quantity: 12 }],
    });
    expect(normalized?.variants?.[0]?.id).toMatch(/\S{8,}/);
    expect(normalized?.variants?.[0]?.name).toBe('Size M');
    expect(normalized?.variants?.[0]?.quantity).toBe(12);
  });

  it('preserves variant ids across normalize rounds', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const once = normalizeRentalDetails({
      category: 'bikes',
      variants: [{ id, name: 'Electric', quantity: 5 }],
    });
    const twice = normalizeRentalDetails(once);
    expect(twice?.variants?.[0]?.id).toBe(id);
  });

  it('inherits shared pricing unless override is set', () => {
    const rental: RentalDetails = {
      ...emptyRentalDetails(),
      durationMode: 'both',
      sharedPricing: { pricePerDayMinor: 3000, pricePerHourMinor: 800 },
      variants: [
        { id: 'a', name: 'Standard', quantity: 2, pricingOverride: null },
        {
          id: 'b',
          name: 'Premium',
          quantity: 1,
          pricingOverride: { pricePerDayMinor: 4500 },
        },
      ],
    };
    expect(effectiveVariantPricing(rental, rental.variants![0])).toEqual({
      pricePerDayMinor: 3000,
      pricePerHourMinor: 800,
    });
    expect(effectiveVariantPricing(rental, rental.variants![1]).pricePerDayMinor).toBe(4500);
  });

  it('ensures a default variant without duplicating', () => {
    const empty = ensureRentalHasDefaultVariant(emptyRentalDetails());
    expect(empty.variants).toHaveLength(1);
    const again = ensureRentalHasDefaultVariant(empty);
    expect(again.variants).toHaveLength(1);
    expect(again.variants![0].id).toBe(empty.variants![0].id);
  });

  it('marks incomplete variants when quantity or pricing is missing', () => {
    const rental: RentalDetails = {
      ...emptyRentalDetails(),
      durationMode: 'daily',
      sharedPricing: {},
      variants: [createDefaultRentalVariant('XL')],
    };
    expect(rentalVariantComplete(rental.variants![0], rental)).toBe(false);
    rental.sharedPricing = { pricePerDayMinor: 2500 };
    rental.variants![0].quantity = 6;
    expect(rentalVariantComplete(rental.variants![0], rental)).toBe(true);
  });
});

describe('rental publish readiness', () => {
  it('requires category, photos, pickup, and at least one complete option', () => {
    const blockers = rentalPublishBlockers({
      title: '',
      description: '',
      city: '',
      country: '',
      galleryCount: 0,
      experienceLanguage: 'en',
      rental: emptyRentalDetails(),
    });
    expect(blockers.some((b) => /category/i.test(b))).toBe(true);
    expect(blockers.some((b) => /photo/i.test(b))).toBe(true);
    expect(blockers.some((b) => /pickup/i.test(b))).toBe(true);
  });

  it('accepts a thermal-overall style listing for creator completeness checks', () => {
    const rental: RentalDetails = {
      ...emptyRentalDetails(),
      category: 'winter_clothing',
      itemType: 'thermal_overall',
      durationMode: 'daily',
      pickupAddress: 'Rovaniemi depot, Main Street 1',
      sharedPricing: { pricePerDayMinor: 2000 },
      variants: [
        { id: 's', name: 'S', quantity: 8 },
        { id: 'm', name: 'M', quantity: 12 },
        { id: 'l', name: 'L', quantity: 10 },
        {
          id: 'xl',
          name: 'XL',
          quantity: 6,
          pricingOverride: { pricePerDayMinor: 2500 },
        },
      ],
    };
    const blockers = rentalPublishBlockers({
      title: 'Premium Thermal Overall Rental',
      description: 'Warm thermal overalls for Arctic conditions, sized S through XL.',
      city: 'Rovaniemi',
      country: 'Finland',
      galleryCount: 4,
      experienceLanguage: 'en',
      rental,
    });
    expect(blockers).toEqual([]);
  });
});
