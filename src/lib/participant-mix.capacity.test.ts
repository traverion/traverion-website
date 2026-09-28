import { describe, expect, it } from 'vitest';
import type { ListingBookingOption } from '../types/listingExtras';
import { participantCategoryQuantityMax } from './participant-mix';

function ageMixOption(): ListingBookingOption {
  return {
    id: 'opt',
    name: 'Standard',
    priceUsd: 100,
    startTime: '09:00',
    duration: '3h',
    pickupPlace: '',
    minPersons: 1,
    maxPersons: 10,
    maxSpotsPerSlot: 10,
    optionInfo: '',
    pricingMode: 'age_dependent',
    priceCategories: [
      { id: 'adult', label: 'Adult', kind: 'adult', ageMin: null, ageMax: null, priceUsd: 100 },
      { id: 'child', label: 'Child', kind: 'child', ageMin: null, ageMax: null, priceUsd: 50 },
    ],
  } as ListingBookingOption;
}

describe('participantCategoryQuantityMax', () => {
  it('shares remaining spots across categories (3 left ≠ 3 per category)', () => {
    const option = ageMixOption();
    const selection = { adult: 2, child: 0 };
    expect(
      participantCategoryQuantityMax({
        option,
        categoryId: 'child',
        selection,
        partyMax: 3,
      })
    ).toBe(1);
    expect(
      participantCategoryQuantityMax({
        option,
        categoryId: 'adult',
        selection: { adult: 0, child: 2 },
        partyMax: 3,
      })
    ).toBe(1);
  });

  it('respects option maxPersons when inventory cap is higher', () => {
    const option = ageMixOption();
    expect(
      participantCategoryQuantityMax({
        option,
        categoryId: 'adult',
        selection: { adult: 2, child: 8 },
        partyMax: 20,
      })
    ).toBe(2);
  });
});
