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
  rentalHasDepositInfo,
  rentalCustomerSkillSuitability,
  rentalOperatingHoursIssue,
  rentalSkillConflictsDifficulty,
  rentalStartingFromMajor,
  rentalVariantComplete,
  rentalVariantMetaLine,
} from './rental-details';
import {
  LEGACY_RENTAL_SCREEN_ALIASES,
  RENTAL_ONBOARDING_SCREENS,
  resolveRentalScreenId,
  rentalPublishBlockers,
  rentalScreenIndex,
  rentalScreenIndexForPublishLine,
  rentalStageBlocker,
} from './rental-onboarding';
import { rentalHighlightSuggestions } from './rental-categories';
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

  it('keeps deposit amounts when no deposit is selected so they can be restored', () => {
    const cleared = clearRentalDepositAmounts();
    expect(cleared.depositRequired).toBe(false);
    expect(cleared.depositAmountMinor).toBeUndefined();
    const normalized = normalizeRentalDetails({
      depositRequired: false,
      depositAmountMinor: 5000,
      depositCollectionMethod: 'cash_at_pickup',
      depositCurrency: 'EUR',
      depositDisclosure: 'Bring cash',
      accessibilityStatus: 'details_provided',
      accessibilityFeatures: ['Step-free pickup access'],
      difficulty: 'not_applicable',
      restrictions: ['No subletting'],
      suitableFor: 'Adults who can ride',
    });
    expect(normalized?.depositAmountMinor).toBe(5000);
    expect(normalized?.depositCollectionMethod).toBe('cash_at_pickup');
    expect(normalized?.depositDisclosure).toBe('Bring cash');
    expect(normalized?.accessibilityFeatures).toEqual(['Step-free pickup access']);
    expect(normalized?.difficulty).toBe('not_applicable');
    expect(normalized?.restrictions).toEqual(['No subletting']);
    expect(rentalHasDepositInfo(normalized!)).toBe(true);
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

describe('skill suitability', () => {
  it('lifts the old specification into one guest field and hides contradictions', () => {
    const normalized = normalizeRentalDetails({
      category: 'skis_snowboards',
      difficulty: 'moderate',
      specifications: { brand: 'Atomic', skillLevel: 'Beginner to intermediate' },
    });
    expect(normalized?.specifications?.skillLevel).toBeUndefined();
    expect(normalized?.specifications?.brand).toBe('Atomic');
    expect(normalized?.skillSuitability).toBe('Beginner to intermediate');
    expect(rentalCustomerSkillSuitability(normalized!)).toBe('Beginner to intermediate');
    expect(rentalSkillConflictsDifficulty('easy', 'Advanced riders')).toBe(true);
    expect(rentalCustomerSkillSuitability({ ...normalized!, difficulty: 'easy', skillSuitability: 'Advanced' })).toBeNull();
    expect(rentalCustomerSkillSuitability({ ...normalized!, difficulty: 'easy', skillSuitability: 'Easy' })).toBeNull();
  });
});

describe('legacy rental screen aliases', () => {
  it('maps retired 33-step ids onto the simplified journey', () => {
    expect(resolveRentalScreenId('gallery')).toBe('photos');
    expect(resolveRentalScreenId('buffers')).toBe('booking-rules');
    expect(resolveRentalScreenId('availability-summary')).toBe('duration');
    expect(resolveRentalScreenId('basics-title')).toBe('basics-title');
    expect(resolveRentalScreenId('pickup-handover')).toBe('pickup-location');
    expect(resolveRentalScreenId('item-type')).toBe('basics-item');
    expect(resolveRentalScreenId('daily-rules')).toBe('daily-counting');
    expect(resolveRentalScreenId('collection')).toBe('handover');
    expect(resolveRentalScreenId('highlights')).toBe('basics-highlights');
    expect(resolveRentalScreenId('basics-description')).toBe('basics-description');
    expect(Object.keys(LEGACY_RENTAL_SCREEN_ALIASES).length).toBeGreaterThan(10);
  });

  it('places highlights immediately after the description in Basics', () => {
    const ids = RENTAL_ONBOARDING_SCREENS.filter((screen) => screen.group === 'Basics').map((screen) => screen.id);
    expect(ids).toEqual([
      'basics-category',
      'basics-item',
      'basics-location',
      'basics-title',
      'basics-description',
      'basics-highlights',
      'basics-specs',
    ]);
    expect(rentalScreenIndex('basics-highlights')).toBe(rentalScreenIndex('basics-description') + 1);
    expect(RENTAL_ONBOARDING_SCREENS[rentalScreenIndex('basics-description')].part).toBe('5 of 7');
    expect(RENTAL_ONBOARDING_SCREENS[rentalScreenIndex('basics-highlights')].part).toBe('6 of 7');
    const check = {
      title: 'Thermal overall rental',
      subtitle: 'Warm overalls for a day outside.',
      description: 'Short',
      highlights: ['Several sizes'],
      galleryCount: 3,
      city: 'Rovaniemi',
      country: 'Finland',
      experienceLanguage: 'en',
      rental: emptyRentalDetails(),
    };
    expect(rentalStageBlocker('basics-description', check)).toMatch(/40/);
    expect(rentalStageBlocker('basics-highlights', { ...check, description: 'Warm thermal overalls for Arctic conditions, sized for a full day outside.' })).toBeNull();
    expect(rentalScreenIndexForPublishLine('Add a highlight')).toBe(rentalScreenIndex('basics-highlights'));
    expect(rentalHighlightSuggestions('bikes')).toContain('Helmet included');
    expect(rentalHighlightSuggestions('cameras_electronics')).toContain('Battery included');
    expect(rentalHighlightSuggestions('bikes').join(' ')).not.toMatch(/family friendly/i);
    expect(rentalHighlightSuggestions(undefined)).toEqual([]);
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
      cancellationPreset: 'flexible_24h',
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
