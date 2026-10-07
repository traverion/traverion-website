import { describe, expect, it } from 'vitest';
import {
  canContinueFromPhotos,
  canVisitListingCreationStep,
  listingCreationAccessState,
  listingCreationContinueHint,
  listingCreationLockedReason,
  listingCreationMissingHint,
  listingCreationProgressCopy,
  listingCreationStepRequirement,
  photosMissingItems,
  previousStepsSatisfied,
  tourDetailsMissingItems,
} from './listing-creation-progression';

const tourComplete = (index: number) => index <= 0;

describe('new listing step access', () => {
  it('keeps Basics open and locks later steps until the previous step is satisfied', () => {
    expect(
      canVisitListingCreationStep({ targetIndex: 0, isNewCreation: true, isSatisfied: () => false })
    ).toBe(true);
    expect(
      canVisitListingCreationStep({ targetIndex: 1, isNewCreation: true, isSatisfied: () => false })
    ).toBe(false);
    expect(
      canVisitListingCreationStep({ targetIndex: 1, isNewCreation: true, isSatisfied: tourComplete })
    ).toBe(true);
    expect(
      canVisitListingCreationStep({ targetIndex: 2, isNewCreation: true, isSatisfied: tourComplete })
    ).toBe(false);
  });

  it('does not lock steps when editing an existing listing', () => {
    expect(
      canVisitListingCreationStep({ targetIndex: 4, isNewCreation: false, isSatisfied: () => false })
    ).toBe(true);
  });

  it('marks skipped future steps locked instead of upcoming', () => {
    expect(
      listingCreationAccessState({
        index: 2,
        currentIndex: 0,
        isNewCreation: true,
        isSatisfied: () => false,
      })
    ).toBe('locked');
    expect(
      listingCreationAccessState({
        index: 1,
        currentIndex: 0,
        isNewCreation: false,
        isSatisfied: () => false,
      })
    ).toBe('upcoming');
  });
});

describe('Photos Continue vs publish-ready photos', () => {
  it('requires four publish-ready photos before a new listing can leave Photos', () => {
    expect(
      canContinueFromPhotos({ isNewCreation: true, photoCount: 1, photosPublishReady: false })
    ).toBe(false);
    expect(
      canContinueFromPhotos({ isNewCreation: true, photoCount: 4, photosPublishReady: true })
    ).toBe(true);
  });

  it('lets an existing listing keep a single cover and return later', () => {
    expect(
      canContinueFromPhotos({ isNewCreation: false, photoCount: 1, photosPublishReady: false })
    ).toBe(true);
  });
});

describe('missing-requirement copy', () => {
  it('names the first unfinished prior step when a locked rail item is clicked', () => {
    expect(
      listingCreationLockedReason({
        targetIndex: 3,
        isStay: false,
        isSatisfied: (i) => i === 0,
      })
    ).toBe('Add city, country, two inclusions, and one exclusion to continue.');
  });

  it('explains a disabled Continue with the current step requirement', () => {
    expect(
      listingCreationContinueHint({ stepIndex: 2, isStay: false, canContinue: false })
    ).toBe('Add at least one complete bookable option to continue.');
    expect(listingCreationContinueHint({ stepIndex: 2, isStay: false, canContinue: true })).toBeNull();
  });

  it('uses stay copy for stay steps', () => {
    expect(listingCreationStepRequirement(2, true)).toContain('guests');
    expect(listingCreationStepRequirement(3, true)).toContain('nightly rate');
  });
});

describe('progress copy', () => {
  it('reports a truthful complete count including zero', () => {
    expect(listingCreationProgressCopy(0, 5)).toBe('0 of 5 complete');
    expect(listingCreationProgressCopy(1, 5)).toBe('1 of 5 complete');
    expect(listingCreationProgressCopy(5, 5)).toBe('All steps complete');
  });
});

describe('previousStepsSatisfied', () => {
  it('requires every earlier step, not only the immediately previous one', () => {
    expect(previousStepsSatisfied(3, (i) => i !== 1)).toBe(false);
    expect(previousStepsSatisfied(3, (i) => i < 3)).toBe(true);
  });
});

describe('continue hints name what is missing', () => {
  it('lists missing details items', () => {
    expect(
      tourDetailsMissingItems({ includeCount: 1, excludeCount: 0, city: '', country: 'FI' })
    ).toEqual(['add 1 more inclusion', 'add what is not included', 'add the city']);
    expect(tourDetailsMissingItems({ includeCount: 2, excludeCount: 1, city: 'Rovaniemi', country: 'FI' })).toEqual([]);
  });

  it('joins missing items into a single hint', () => {
    expect(listingCreationMissingHint([])).toBeNull();
    expect(listingCreationMissingHint(['add a country'])).toBe('To continue: add a country.');
    expect(listingCreationMissingHint(['a', 'b', 'c'])).toBe('To continue: a, b and c.');
  });

  it('counts missing photos for new creation vs drafts', () => {
    expect(photosMissingItems({ photoCount: 2, minPhotos: 4, isNewCreation: true, photosPublishReady: false })).toEqual([
      'add 2 more photos',
    ]);
    expect(photosMissingItems({ photoCount: 0, minPhotos: 4, isNewCreation: false, photosPublishReady: false })).toEqual([
      'add at least one photo',
    ]);
    expect(photosMissingItems({ photoCount: 4, minPhotos: 4, isNewCreation: true, photosPublishReady: true })).toEqual([]);
  });
});
