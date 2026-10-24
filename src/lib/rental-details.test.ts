import { describe, expect, it } from 'vitest';
import {
  clearRentalDepositAmounts,
  createDefaultRentalVariant,
  defaultRentalOperatingDays,
  effectiveVariantPricing,
  emptyRentalDetails,
  ensureRentalHasDefaultVariant,
  groupRentalOperatingHours,
  normalizeRentalDetails,
  rentalIllustrativeTotalMinor,
  rentalOperatingHoursIssue,
  rentalStartingFromMajor,
  rentalVariantComplete,
  rentalVariantMetaLine,
} from './rental-details';
import { LEGACY_RENTAL_SCREEN_ALIASES, resolveRentalScreenId, rentalPublishBlockers } from './rental-onboarding';
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

describe('rental display helpers', () => {
  it('groups identical operating hours across consecutive days', () => {
    const days = defaultRentalOperatingDays().map((d) => ({
      ...d,
      open: d.day !== 'sun',
      earliestPickupHm: '09:00',
      latestPickupHm: '17:00',
      earliestReturnHm: '09:00',
      latestReturnHm: '18:00',
    }));
    const lines = groupRentalOperatingHours(days);
    expect(lines.some((l) => l.startsWith('Mon–Sat:'))).toBe(true);
    expect(lines).toHaveLength(1);
  });

  it('omits attributes already present in the option name', () => {
    const line = rentalVariantMetaLine(
      { id: '1', name: 'Size M', quantity: 12, attributes: { size: 'M' } },
      [{ key: 'size', label: 'Size' }]
    );
    expect(line).toBe('12 units');
    expect(line).not.toMatch(/\bM\b/);
  });
});

describe('rental pricing derivation', () => {
  it('derives startingFrom from lowest daily variant rate (major units)', () => {
    const rental: RentalDetails = {
      ...emptyRentalDetails(),
      durationMode: 'daily',
      sharedPricing: { pricePerDayMinor: 2000 },
      variants: [
        { id: 'a', name: 'S', quantity: 1 },
        { id: 'b', name: 'XL', quantity: 1, pricingOverride: { pricePerDayMinor: 2500 } },
      ],
    };
    expect(rentalStartingFromMajor(rental)).toBe(20);
  });

  it('applies multi-day discount on illustrative totals only for daily mode', () => {
    expect(
      rentalIllustrativeTotalMinor({
        unitMinor: 2000,
        units: 2,
        durationCount: 3,
        mode: 'day',
        multiDayDiscountPercent: 10,
        multiDayDiscountMinDays: 3,
      })
    ).toBe(10800);
    expect(
      rentalIllustrativeTotalMinor({
        unitMinor: 800,
        units: 1,
        durationCount: 5,
        mode: 'hour',
        multiDayDiscountPercent: 10,
        multiDayDiscountMinDays: 3,
      })
    ).toBe(4000);
  });

  it('clears deposit amounts when no deposit is selected (normalize + helper)', () => {
    const cleared = clearRentalDepositAmounts();
    expect(cleared.depositRequired).toBe(false);
    expect(cleared.depositAmountMinor).toBeNull();
    const normalized = normalizeRentalDetails({
      depositRequired: false,
      depositAmountMinor: 5000,
      depositCollectionMethod: 'cash_at_pickup',
      depositCurrency: 'EUR',
      depositDisclosure: 'Bring cash',
    });
    expect(normalized?.depositAmountMinor).toBeNull();
    expect(normalized?.depositCollectionMethod).toBeNull();
    expect(normalized?.depositDisclosure).toBe('Bring cash');
  });

  it('flags invalid pickup windows', () => {
    const days = defaultRentalOperatingDays().map((d) => ({
      ...d,
      open: d.day === 'mon',
      earliestPickupHm: '17:00',
      latestPickupHm: '09:00',
    }));
    expect(rentalOperatingHoursIssue(days)).toMatch(/Pickup/i);
  });
});

describe('legacy rental screen aliases', () => {
  it('maps retired 33-step ids onto the simplified journey', () => {
    expect(resolveRentalScreenId('gallery')).toBe('photos');
    expect(resolveRentalScreenId('buffers')).toBe('booking-rules');
    expect(resolveRentalScreenId('availability-summary')).toBe('duration');
    expect(resolveRentalScreenId('basics-title')).toBe('basics-title');
    expect(Object.keys(LEGACY_RENTAL_SCREEN_ALIASES).length).toBeGreaterThan(10);
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
