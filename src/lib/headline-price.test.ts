import { describe, expect, it } from 'vitest';
import {
  headlineStartingAmount,
  headlineStartingAmountFromBookingOptions,
  participantKindFromName,
  participantPriceSummary,
  pickHeadlineOption,
  pricedNamesFromBookingOptions,
} from './headline-price';
import type { ListingBookingOption } from '../types/listingExtras';
import { defaultAgeDependentCategories } from './price-categories';

describe('headline price', () => {
  it('does not treat child as the catalog from-price when adult exists', () => {
    const pick = pickHeadlineOption([
      { name: 'Child', priceUsd: 149 },
      { name: 'Adult', priceUsd: 189 },
    ]);
    expect(pick.mode).toBe('participant-standard');
    expect(pick.option?.priceUsd).toBe(189);
    expect(pick.qualifier).toBe('adult');
    expect(headlineStartingAmount(pick.option ? [pick.option, { name: 'Child', priceUsd: 149 }] : [])).toBe(189);
    expect(
      headlineStartingAmount([
        { name: 'Child', priceUsd: 149 },
        { name: 'Adult', priceUsd: 189 },
      ])
    ).toBe(189);
  });

  it('still uses From-minimum for product variants', () => {
    const pick = pickHeadlineOption([
      { name: 'Small group', priceUsd: 189 },
      { name: 'Private tour', priceUsd: 490 },
    ]);
    expect(pick.mode).toBe('from-minimum');
    expect(pick.option?.priceUsd).toBe(189);
    expect(pick.qualifier).toBeNull();
  });

  it('qualifies a child-only menu instead of a generic from-price', () => {
    const pick = pickHeadlineOption([
      { name: 'Child', priceUsd: 149 },
      { name: 'Infant', priceUsd: 0 },
    ]);
    expect(pick.mode).toBe('single');
    expect(pick.qualifier).toBe('child');
  });

  it('builds a participant summary without hardcoding a listing', () => {
    expect(
      participantPriceSummary(
        [
          { name: 'Adult', priceUsd: 189 },
          { name: 'Child', priceUsd: 149 },
        ],
        (n) => `€${n}`
      )
    ).toBe('Adult €189 · Child €149');
  });

  it('classifies generic participant labels', () => {
    expect(participantKindFromName('Adult')).toBe('adult');
    expect(participantKindFromName('Children (7–15)')).toBe('reduced');
    expect(participantKindFromName('Senior')).toBe('reduced');
    expect(participantKindFromName('Private boat')).toBe('other');
  });

  it('reads catalog from-prices from ready schedules when option-level price is empty', () => {
    const option = {
      id: 'opt-1',
      name: 'Small group',
      priceUsd: 0,
      startTime: '',
      duration: '6 hours',
      pickupPlace: 'City centre hotels',
      minPersons: 1,
      maxPersons: 8,
      maxSpotsPerSlot: 8,
      optionInfo: '',
      weekdays: [true, true, true, true, true, true, true],
      availabilityDateFrom: '',
      availabilityDateTo: '',
      pricingMode: 'uniform' as const,
      schedules: [
        {
          id: 'sch-sep',
          name: 'September',
          availabilityDateFrom: '2026-09-01',
          availabilityDateTo: '2026-09-30',
          weekdays: [true, true, true, true, true, true, true],
          startTime: '20:00',
          pricingMode: 'age_dependent' as const,
          priceUsd: 119,
          priceCategories: defaultAgeDependentCategories(119, 89),
          minPersons: 1,
          maxPersons: 8,
          maxSpotsPerSlot: 8,
          status: 'ready' as const,
        },
        {
          id: 'sch-oct',
          name: 'October',
          availabilityDateFrom: '2026-10-01',
          availabilityDateTo: '2026-10-31',
          weekdays: [true, true, true, true, true, true, true],
          startTime: '19:00',
          pricingMode: 'age_dependent' as const,
          priceUsd: 149,
          priceCategories: defaultAgeDependentCategories(149, 109),
          minPersons: 1,
          maxPersons: 8,
          maxSpotsPerSlot: 8,
          status: 'ready' as const,
        },
      ],
    } as ListingBookingOption;

    const named = pricedNamesFromBookingOptions([option]);
    expect(named.some((n) => n.name === 'Adult' && n.priceUsd === 119)).toBe(true);
    expect(named.some((n) => n.name === 'Adult' && n.priceUsd === 149)).toBe(true);
    expect(headlineStartingAmountFromBookingOptions([option], 0)).toBe(119);
  });
});
