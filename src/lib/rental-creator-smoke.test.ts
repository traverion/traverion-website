/**
 * Creator UI smoke (logic-level): 21-screen journey, draft resume, validations.
 * Complements browser smoke; does not require a running Vite session.
 */
import { describe, expect, it } from 'vitest';
import { applyRentalCategoryChange } from './rental-categories';
import { emptyRentalDetails } from './rental-details';
import {
  RENTAL_ONBOARDING_SCREENS,
  resolveRentalScreenId,
  rentalScreenIndexFromStorage,
  rentalStageBlocker,
  type RentalOnboardingCheck,
} from './rental-onboarding';

function baseCheck(overrides: Partial<RentalOnboardingCheck> = {}): RentalOnboardingCheck {
  return {
    title: 'Arctic Fatbike Day Hire',
    subtitle: 'Fatbikes ready for snow trails.',
    description: 'Guided-ready fatbikes for a full day on prepared winter trails around Rovaniemi.',
    highlights: ['Helmet included', 'Studded tires'],
    galleryCount: 3,
    city: 'Rovaniemi',
    country: 'Finland',
    experienceLanguage: 'en',
    rental: {
      ...emptyRentalDetails(),
      category: 'bikes',
      itemType: 'fat_bike',
      shortIntro: 'Fatbikes ready for snow trails.',
      pickupAddress: 'Koskikatu 1, Rovaniemi',
      returnSameAsPickup: true,
      durationMode: 'daily',
      minDurationDays: 1,
      maxDurationDays: 7,
      cancellationPreset: 'flexible',
      operatingDays: [
        { day: 'mon', open: true, pickupFrom: '09:00', pickupTo: '17:00', returnFrom: '09:00', returnTo: '17:00' },
        { day: 'tue', open: true, pickupFrom: '09:00', pickupTo: '17:00', returnFrom: '09:00', returnTo: '17:00' },
        { day: 'wed', open: true, pickupFrom: '09:00', pickupTo: '17:00', returnFrom: '09:00', returnTo: '17:00' },
        { day: 'thu', open: true, pickupFrom: '09:00', pickupTo: '17:00', returnFrom: '09:00', returnTo: '17:00' },
        { day: 'fri', open: true, pickupFrom: '09:00', pickupTo: '17:00', returnFrom: '09:00', returnTo: '17:00' },
        { day: 'sat', open: true, pickupFrom: '09:00', pickupTo: '17:00', returnFrom: '09:00', returnTo: '17:00' },
        { day: 'sun', open: false, pickupFrom: null, pickupTo: null, returnFrom: null, returnTo: null },
      ],
      variants: [
        {
          id: 'opt-1',
          name: 'Standard',
          quantity: 4,
          pricingOverride: { pricePerDayMinor: 4500 },
        },
      ],
    },
    ...overrides,
  };
}

describe('rental creator 21-screen smoke', () => {
  it('exposes exactly 21 screens with category, item type, and highlights separated', () => {
    expect(RENTAL_ONBOARDING_SCREENS).toHaveLength(21);
    const ids = RENTAL_ONBOARDING_SCREENS.map((s) => s.id);
    expect(new Set(ids).size).toBe(21);
    expect(ids[0]).toBe('basics-category');
    expect(ids[1]).toBe('basics-item');
    expect(ids[4]).toBe('basics-description');
    expect(ids[5]).toBe('basics-highlights');
    expect(ids.at(-1)).toBe('publish');
  });

  it('resumes interim and legacy draft screen ids onto the 21-screen journey', () => {
    expect(resolveRentalScreenId('basics-item')).toBe('basics-item');
    expect(resolveRentalScreenId('item-type')).toBe('basics-item');
    expect(resolveRentalScreenId('category')).toBe('basics-category');
    expect(resolveRentalScreenId('basics-highlights')).toBe('basics-highlights');
    expect(resolveRentalScreenId('highlights')).toBe('basics-highlights');
    expect(resolveRentalScreenId('return-location')).toBe('pickup-location');
    expect(resolveRentalScreenId('daily-counting')).toBe('duration');
    expect(resolveRentalScreenId('accessibility')).toBe('requirements');
    expect(resolveRentalScreenId('suitability')).toBe('requirements');
    expect(resolveRentalScreenId('restrictions')).toBe('inclusions');
    expect(resolveRentalScreenId('pricing')).toBe('options');
    expect(rentalScreenIndexFromStorage('basics-highlights')).toBe(
      RENTAL_ONBOARDING_SCREENS.findIndex((s) => s.id === 'basics-highlights'),
    );
    expect(rentalScreenIndexFromStorage('item-type')).toBe(1);
  });

  it('blocks incomplete early steps and keeps highlights optional', () => {
    const empty = baseCheck({
      title: '',
      subtitle: '',
      description: '',
      galleryCount: 0,
      city: '',
      country: '',
      rental: emptyRentalDetails(),
    });
    expect(rentalStageBlocker('basics-category', empty)).toMatch(/category/i);
    expect(rentalStageBlocker('basics-category', baseCheck())).toBeNull();
    expect(rentalStageBlocker('basics-item', empty)).toMatch(/category/i);
    expect(
      rentalStageBlocker('basics-item', {
        ...baseCheck(),
        rental: { ...baseCheck().rental, itemType: undefined },
      }),
    ).toMatch(/item type/i);
    expect(
      rentalStageBlocker('basics-item', {
        ...baseCheck(),
        rental: { ...baseCheck().rental, itemType: 'winter_jacket' },
      }),
    ).toMatch(/item type/i);
    expect(rentalStageBlocker('basics-item', baseCheck())).toBeNull();
    expect(rentalStageBlocker('basics-description', empty)).toMatch(/40/);
    expect(rentalStageBlocker('basics-description', baseCheck())).toBeNull();
    expect(rentalStageBlocker('basics-highlights', { ...baseCheck(), highlights: [] })).toBeNull();
    expect(rentalStageBlocker('basics-highlights', baseCheck())).toBeNull();
    expect(rentalStageBlocker('photos', { ...baseCheck(), galleryCount: 1 })).toMatch(/3 photos/i);
    expect(rentalStageBlocker('photos', baseCheck())).toBeNull();
    expect(
      rentalStageBlocker('options', {
        ...baseCheck(),
        rental: { ...baseCheck().rental, variants: [{ id: 'x', name: '', quantity: 0 }] },
      }),
    ).toMatch(/name|unit/i);
    expect(rentalStageBlocker('options', baseCheck())).toBeNull();
    expect(rentalStageBlocker('duration', baseCheck())).toBeNull();
    expect(rentalStageBlocker('pickup-location', baseCheck())).toBeNull();
  });

  it('walks every screen blocker without throwing for a complete draft', () => {
    const check = baseCheck();
    for (const screen of RENTAL_ONBOARDING_SCREENS) {
      expect(() => rentalStageBlocker(screen.id, check)).not.toThrow();
    }
  });

  it('resets incompatible item types when the category changes', () => {
    const fromBikes = applyRentalCategoryChange(baseCheck().rental, 'winter_clothing');
    expect(fromBikes.category).toBe('winter_clothing');
    expect(fromBikes.itemType).toBeUndefined();
    expect(fromBikes.customItemType).toBeUndefined();

    const keepCompatible = applyRentalCategoryChange(
      { ...baseCheck().rental, itemType: 'custom', customItemType: 'Cargo e-bike' },
      'vehicles',
    );
    expect(keepCompatible.itemType).toBe('custom');
    expect(keepCompatible.customItemType).toBe('Cargo e-bike');
  });
});
