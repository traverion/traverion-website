import { describe, expect, it } from 'vitest';
import {
  normalizeListingBookingOption,
  parseListingExtras,
} from '../types/listingExtras';
import {
  defaultAgeDependentCategories,
  optionHeadlineUnitPrice,
  priceCategoryValidationMessages,
  summarizeOptionPricing,
} from './price-categories';

describe('price categories on booking options', () => {
  it('normalizes age-dependent categories and syncs headline price to Adult', () => {
    const opt = normalizeListingBookingOption(
      {
        id: 'opt-1',
        name: 'Hotel pickup · 20:00',
        priceUsd: 0,
        startTime: '20:00',
        duration: '5 hours',
        pickupPlace: 'Rovaniemi hotel zone',
        minPersons: 1,
        maxPersons: 8,
        maxSpotsPerSlot: 8,
        optionInfo: 'Includes hotel pickup',
        weekdays: [true, true, true, true, true, true, true],
        pricingMode: 'age_dependent',
        priceCategories: [
          { id: 'a', label: 'Adult', kind: 'adult', ageMin: 13, ageMax: 99, priceUsd: 189 },
          { id: 'c', label: 'Child', kind: 'child', ageMin: 4, ageMax: 12, priceUsd: 149, requiresAdult: true },
        ],
      },
      'opt-1'
    );
    expect(opt.pricingMode).toBe('age_dependent');
    expect(opt.priceCategories).toHaveLength(2);
    expect(opt.priceUsd).toBe(189);
    expect(optionHeadlineUnitPrice(opt)).toBe(189);
    expect(summarizeOptionPricing(opt, (n) => `€${n}`)).toMatch(/Adult €189/);
    expect(summarizeOptionPricing(opt, (n) => `€${n}`)).toMatch(/Child €149/);
  });

  it('round-trips through listing extras JSON', () => {
    const opt = normalizeListingBookingOption(
      {
        id: 'o',
        name: 'Meeting point',
        priceUsd: 169,
        pricingMode: 'age_dependent',
        priceCategories: defaultAgeDependentCategories(169, 129),
        startTime: '20:30',
        duration: '5 hours',
        pickupPlace: 'Santa Claus Village gate',
        minPersons: 1,
        maxPersons: 8,
        maxSpotsPerSlot: 8,
        optionInfo: 'Meet at the gate',
        weekdays: [true, true, true, true, true, false, false],
      },
      'o'
    );
    const parsed = parseListingExtras({ bookingOptions: [opt] });
    expect(parsed.bookingOptions?.[0]?.pricingMode).toBe('age_dependent');
    expect(parsed.bookingOptions?.[0]?.priceCategories?.[0]?.label).toBe('Adult');
    expect(parsed.bookingOptions?.[0]?.priceUsd).toBe(169);
  });

  it('validates private flat group pricing', () => {
    const opt = normalizeListingBookingOption(
      {
        id: 'p',
        name: 'Private Northern Lights',
        priceUsd: 0,
        isPrivate: true,
        privatePricing: 'flat_group',
        privateGroupPriceUsd: 0,
        duration: '5 hours',
        pickupPlace: 'Your hotel',
        optionInfo: 'Private vehicle',
        weekdays: [true, true, true, true, true, true, true],
      },
      'p'
    );
    expect(priceCategoryValidationMessages(opt).some((m) => /private group price/i.test(m))).toBe(true);
  });

  it('rejects empty age-dependent categories', () => {
    const opt = normalizeListingBookingOption(
      {
        id: 'x',
        name: 'Evening',
        pricingMode: 'age_dependent',
        priceCategories: [],
        priceUsd: 0,
        duration: '3 hours',
        pickupPlace: 'Town center meeting point',
        optionInfo: 'Shared group',
        weekdays: [true, true, true, true, true, true, true],
      },
      'x'
    );
    expect(priceCategoryValidationMessages(opt).length).toBeGreaterThan(0);
  });
});
