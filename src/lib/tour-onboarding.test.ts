import { describe, expect, it } from 'vitest';
import {
  TOUR_ONBOARDING_SCREENS,
  tourBasicsSceneIndexForScreen,
  tourInformationSceneIndexForScreen,
  tourScreenIndex,
  tourScreenIndexFromStorage,
  tourScreenIndexForPublishLine,
  tourStageBlocker,
  tourStageForLegacyWizardStep,
  type TourOnboardingCheck,
} from './tour-onboarding';
import {
  MIN_LISTING_DESCRIPTION_LENGTH,
  MIN_SHORT_DESCRIPTION_LENGTH,
} from './listingQualityScore';

function pad(n: number): string {
  return 'a'.repeat(n);
}

function check(over: Partial<TourOnboardingCheck> = {}): TourOnboardingCheck {
  return {
    experienceKind: 'tour',
    experienceLanguage: 'en',
    city: 'Rovaniemi',
    country: 'Finland',
    title: 'Northern Lights evening tour',
    subtitle: pad(MIN_SHORT_DESCRIPTION_LENGTH),
    description: pad(MIN_LISTING_DESCRIPTION_LENGTH),
    includes: ['Guide', 'Hot drink'],
    excludes: [],
    bookingOptions: [],
    optionsContinueReady: true,
    photoCount: 4,
    photosPublishReady: true,
    isNewCreation: true,
    ...over,
  };
}

describe('tour onboarding screens', () => {
  it('exposes a linear focused catalog covering basics through preview', () => {
    expect(TOUR_ONBOARDING_SCREENS.map((s) => s.id)).toEqual([
      'product-type',
      'location',
      'identity',
      'experience',
      'guest-prep',
      'suitability',
      'languages-contact',
      'options',
      'photos',
      'preview',
    ]);
  });

  it('maps basics and information screens onto the existing scene indexes', () => {
    expect(tourBasicsSceneIndexForScreen('product-type')).toBe(0);
    expect(tourBasicsSceneIndexForScreen('identity')).toBe(2);
    expect(tourInformationSceneIndexForScreen('guest-prep')).toBe(0);
    expect(tourInformationSceneIndexForScreen('languages-contact')).toBe(2);
    expect(tourBasicsSceneIndexForScreen('experience')).toBeNull();
  });

  it('restores from new screen storage and legacy wizard/scene keys', () => {
    expect(tourScreenIndexFromStorage('options', null, null, null)).toBe(tourScreenIndex('options'));
    expect(tourScreenIndexFromStorage(null, '0', '2', null)).toBe(tourScreenIndex('identity'));
    expect(tourScreenIndexFromStorage(null, '2', null, '1')).toBe(tourScreenIndex('suitability'));
    expect(tourScreenIndexFromStorage(null, '4', null, null)).toBe(tourScreenIndex('photos'));
    expect(tourStageForLegacyWizardStep(3)).toBe(tourScreenIndex('options'));
  });

  it('blocks Continue with the shared description floors and option readiness', () => {
    expect(tourStageBlocker('product-type', check({ experienceKind: '' }))).toMatch(/product type/i);
    expect(tourStageBlocker('identity', check({ subtitle: pad(99) }))).toMatch(/at least 100/i);
    expect(tourStageBlocker('identity', check())).toBeNull();
    expect(tourStageBlocker('experience', check({ description: pad(499) }))).toMatch(/at least 500/i);
    expect(tourStageBlocker('experience', check({ includes: ['Guide'] }))).toMatch(/inclusion/i);
    expect(tourStageBlocker('guest-prep', check())).toBeNull();
    expect(tourStageBlocker('options', check({ optionsContinueReady: false }))).toMatch(/option/i);
    expect(tourStageBlocker('photos', check({ photosPublishReady: false, photoCount: 1 }))).toMatch(
      /photo/i
    );
  });

  it('routes publish attention lines onto the matching focused screen', () => {
    expect(tourScreenIndexForPublishLine('Short description must be at least 100 characters.')).toBe(
      tourScreenIndex('identity')
    );
    expect(tourScreenIndexForPublishLine('Full description must be at least 500 characters.')).toBe(
      tourScreenIndex('experience')
    );
    expect(tourScreenIndexForPublishLine('Add at least one bookable option with meeting point')).toBe(
      tourScreenIndex('options')
    );
    expect(tourScreenIndexForPublishLine('Add a booking contact phone number')).toBe(
      tourScreenIndex('languages-contact')
    );
  });
});
