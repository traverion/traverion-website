import { describe, expect, it } from 'vitest';
import { listingWizardPersistLabel } from './listing-wizard-persist';
import { MIN_LISTING_DESCRIPTION_LENGTH } from './listingQualityScore';
import {
  TOUR_BASICS_SCENE_COUNT,
  TOUR_BASICS_SCENES,
  TOUR_BASICS_SUBTITLE_MAX,
  canAdvanceTourBasicsScene,
  canSelectTourBasicsScene,
  clampTourBasicsSceneIndex,
  initialTourBasicsSceneIndex,
  isTourBasicsComplete,
  isTourBasicsSceneSatisfied,
  isTourIdentitySatisfied,
  isTourProductTypeSatisfied,
  isTourStorySatisfied,
  listingCreationSceneCopy,
  nextTourBasicsScene,
  previousTourBasicsScene,
  tourBasicsSceneForFocusSection,
  type TourBasicsFields,
} from './listing-creation-scenes';

const empty: TourBasicsFields = {
  experienceKind: '',
  experienceLanguage: '',
  title: '',
  subtitle: '',
  description: '',
};

const filled: TourBasicsFields = {
  experienceKind: 'tour',
  experienceLanguage: 'en',
  title: 'Old town walking tour',
  subtitle: 'Small-group walk with a local host',
  description:
    'A two-hour walk through the old town with a local host. We stop for coffee, share stories, and keep groups small so guests can ask questions along the way.',
};

describe('tour Basics scene order', () => {
  it('keeps three conceptual scenes, not one field per screen', () => {
    expect(TOUR_BASICS_SCENES.map((s) => s.id)).toEqual(['product_type', 'identity', 'story']);
    expect(TOUR_BASICS_SCENE_COUNT).toBe(3);
  });
});

describe('scene navigation', () => {
  it('advances forward and back without wrapping past the ends', () => {
    expect(nextTourBasicsScene(0)).toBe(1);
    expect(nextTourBasicsScene(1)).toBe(2);
    expect(nextTourBasicsScene(2)).toBe(2);
    expect(previousTourBasicsScene(2)).toBe(1);
    expect(previousTourBasicsScene(1)).toBe(0);
    expect(previousTourBasicsScene(0)).toBe(0);
    expect(clampTourBasicsSceneIndex(99)).toBe(2);
    expect(clampTourBasicsSceneIndex(-4)).toBe(0);
  });
});

describe('scene satisfaction and Continue gates', () => {
  it('requires a real category before leaving product type', () => {
    expect(isTourProductTypeSatisfied(empty)).toBe(false);
    expect(canAdvanceTourBasicsScene(0, empty)).toBe(false);
    expect(canAdvanceTourBasicsScene(0, { ...empty, experienceKind: 'ticket' })).toBe(true);
  });

  it('keeps language, title, and subtitle together as identity', () => {
    const partial = { ...filled, title: '' };
    expect(isTourIdentitySatisfied(partial)).toBe(false);
    expect(canAdvanceTourBasicsScene(1, filled)).toBe(true);
    expect(isTourIdentitySatisfied({ ...filled, subtitle: 'x'.repeat(TOUR_BASICS_SUBTITLE_MAX + 1) })).toBe(false);
  });

  it('keeps existing description length rules for the story scene', () => {
    expect(isTourStorySatisfied({ description: 'short' })).toBe(false);
    expect(isTourStorySatisfied({ description: 'a'.repeat(MIN_LISTING_DESCRIPTION_LENGTH) })).toBe(true);
    expect(isTourBasicsSceneSatisfied(2, { ...filled, description: '' })).toBe(false);
  });

  it('only allows Continue to Details when all Basics fields that already gated the step are complete', () => {
    expect(isTourBasicsComplete(empty)).toBe(false);
    expect(canAdvanceTourBasicsScene(2, filled)).toBe(true);
    expect(canAdvanceTourBasicsScene(2, { ...filled, experienceKind: '' })).toBe(false);
  });

  it('does not require highlights for Basics completion', () => {
    expect(isTourBasicsComplete(filled)).toBe(true);
  });
});

describe('category persistence across scenes', () => {
  it('treats scene index as independent of field values', () => {
    const fields = { ...filled, experienceKind: 'transportation' };
    expect(isTourProductTypeSatisfied(fields)).toBe(true);
    expect(isTourIdentitySatisfied(fields)).toBe(true);
    expect(nextTourBasicsScene(0)).toBe(1);
    expect(fields.experienceKind).toBe('transportation');
  });
});

describe('restore and edit entry', () => {
  it('maps deep-link sections onto the scene that owns the field', () => {
    expect(tourBasicsSceneForFocusSection('category')).toBe(0);
    expect(tourBasicsSceneForFocusSection('title')).toBe(1);
    expect(tourBasicsSceneForFocusSection('highlights')).toBe(2);
    expect(tourBasicsSceneForFocusSection('photos')).toBeNull();
  });

  it('restores a stored scene, otherwise skips product type for an existing listing that already has a category', () => {
    expect(
      initialTourBasicsSceneIndex({
        stored: 2,
        isEditing: true,
        productTypeSelected: true,
      })
    ).toBe(2);
    expect(
      initialTourBasicsSceneIndex({
        stored: null,
        isEditing: true,
        productTypeSelected: true,
      })
    ).toBe(1);
    expect(
      initialTourBasicsSceneIndex({
        stored: 0,
        isEditing: true,
        productTypeSelected: true,
      })
    ).toBe(1);
    expect(
      initialTourBasicsSceneIndex({
        stored: null,
        isEditing: false,
        productTypeSelected: false,
      })
    ).toBe(0);
  });

  it('lets an existing listing jump any Basics scene, while create stays gated', () => {
    expect(canSelectTourBasicsScene(2, 0, empty, true)).toBe(true);
    expect(canSelectTourBasicsScene(1, 0, empty, false)).toBe(false);
    expect(canSelectTourBasicsScene(1, 0, { ...empty, experienceKind: 'tour' }, false)).toBe(true);
    expect(canSelectTourBasicsScene(0, 1, filled, false)).toBe(true);
  });

  it('prefers a focus section over stored scene so quality jumps land on the right fields', () => {
    expect(
      initialTourBasicsSceneIndex({
        stored: 0,
        isEditing: true,
        focusSection: 'description',
        productTypeSelected: true,
      })
    ).toBe(2);
  });
});

describe('draft truth across scene transitions', () => {
  it('does not claim a server save merely because the Basics scene changed', () => {
    expect(
      listingWizardPersistLabel({
        saving: false,
        failed: false,
        dirty: true,
        serverSaved: false,
      })
    ).toBe('Unsaved changes');
    expect(
      listingWizardPersistLabel({
        saving: false,
        failed: false,
        dirty: false,
        serverSaved: false,
      })
    ).toBeNull();
  });
});

describe('scene progress copy', () => {
  it('stays subordinate numeric copy, not a second wizard', () => {
    expect(listingCreationSceneCopy(0, 3)).toBe('1 / 3');
    expect(listingCreationSceneCopy(2, 3)).toBe('3 / 3');
  });
});
