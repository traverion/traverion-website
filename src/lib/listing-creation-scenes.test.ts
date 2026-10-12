import { describe, expect, it } from 'vitest';
import { listingWizardPersistLabel } from './listing-wizard-persist';
import {
  TOUR_BASICS_SCENE_COUNT,
  TOUR_BASICS_SCENES,
  TOUR_BASICS_SUBTITLE_MAX,
  TOUR_HIGHLIGHT_MAX,
  addTourHighlight,
  canAdvanceTourBasicsScene,
  canAddTourHighlight,
  canSelectTourBasicsScene,
  clampTourBasicsSceneIndex,
  identityPreviewSubtitle,
  initialTourBasicsSceneIndex,
  isTourBasicsComplete,
  isTourBasicsSceneSatisfied,
  isTourIdentitySatisfied,
  isTourLocationSatisfied,
  isTourProductTypeSatisfied,
  listingCreationSceneCopy,
  nextTourBasicsScene,
  normalizeTourHighlightSlots,
  persistableTourHighlights,
  previousTourBasicsScene,
  removeTourHighlight,
  tourBasicsIdentityQuestion,
  tourBasicsSceneForFocusSection,
  type TourBasicsFields,
} from './listing-creation-scenes';

const empty: TourBasicsFields = {
  experienceKind: '',
  experienceLanguage: '',
  city: '',
  country: '',
  title: '',
  subtitle: '',
};

const filled: TourBasicsFields = {
  experienceKind: 'tour',
  experienceLanguage: 'en',
  city: 'Rovaniemi',
  country: 'Finland',
  title: 'Old town walking tour',
  subtitle: 'Small-group walk with a local host',
};

describe('tour Basics scene order', () => {
  it('is product type, then place & language, then identity', () => {
    expect(TOUR_BASICS_SCENES.map((s) => s.id)).toEqual(['product_type', 'location', 'identity']);
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

  it('requires listing language, city, and country on the location scene', () => {
    expect(isTourLocationSatisfied({ ...filled, city: '' })).toBe(false);
    expect(isTourLocationSatisfied(filled)).toBe(true);
    expect(canAdvanceTourBasicsScene(1, filled)).toBe(true);
  });

  it('keeps title and subtitle as identity without language', () => {
    const partial = { ...filled, title: '' };
    expect(isTourIdentitySatisfied(partial)).toBe(false);
    expect(canAdvanceTourBasicsScene(2, filled)).toBe(true);
    expect(isTourIdentitySatisfied({ ...filled, subtitle: 'x'.repeat(TOUR_BASICS_SUBTITLE_MAX + 1) })).toBe(
      false
    );
  });

  it('requires the same title length bounds as publish (10–65)', () => {
    expect(isTourIdentitySatisfied({ ...filled, title: 'Short' })).toBe(false);
    expect(isTourIdentitySatisfied({ ...filled, title: 'Guaranteed NL' })).toBe(true);
    expect(isTourIdentitySatisfied({ ...filled, title: 'x'.repeat(65) })).toBe(true);
    expect(isTourIdentitySatisfied({ ...filled, title: 'x'.repeat(66) })).toBe(false);
  });

  it('completes Basics without description', () => {
    expect(isTourBasicsComplete(empty)).toBe(false);
    expect(isTourBasicsComplete(filled)).toBe(true);
    expect(isTourBasicsSceneSatisfied(2, filled)).toBe(true);
  });

  it('uses product-type-aware identity questions', () => {
    expect(tourBasicsIdentityQuestion('ticket')).toMatch(/ticket/i);
    expect(tourBasicsIdentityQuestion('transportation')).toMatch(/transfer/i);
    expect(tourBasicsIdentityQuestion('tour')).toMatch(/tour/i);
  });
});

describe('restore and edit entry', () => {
  it('maps deep-link sections onto the scene that owns the field', () => {
    expect(tourBasicsSceneForFocusSection('category')).toBe(0);
    expect(tourBasicsSceneForFocusSection('language')).toBe(1);
    expect(tourBasicsSceneForFocusSection('city')).toBe(1);
    expect(tourBasicsSceneForFocusSection('title')).toBe(2);
    expect(tourBasicsSceneForFocusSection('description')).toBeNull();
    expect(tourBasicsSceneForFocusSection('photos')).toBeNull();
  });

  it('restores a stored scene, otherwise skips product type for an existing listing', () => {
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
  });

  it('lets an existing listing jump any Basics scene, while create stays gated', () => {
    expect(canSelectTourBasicsScene(2, 0, empty, true)).toBe(true);
    expect(canSelectTourBasicsScene(1, 0, empty, false)).toBe(false);
    expect(canSelectTourBasicsScene(1, 0, { ...empty, experienceKind: 'tour' }, false)).toBe(true);
  });

  it('prefers a focus section over stored scene', () => {
    expect(
      initialTourBasicsSceneIndex({
        stored: 0,
        isEditing: true,
        focusSection: 'title',
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
  });
});

describe('scene progress copy', () => {
  it('stays subordinate numeric copy', () => {
    expect(listingCreationSceneCopy(0, 3)).toBe('1 / 3');
    expect(listingCreationSceneCopy(2, 3)).toBe('3 / 3');
  });
});

describe('tour highlights progressive disclosure', () => {
  it('starts with two visible slots and can grow to six', () => {
    expect(normalizeTourHighlightSlots(undefined)).toEqual(['', '']);
    const added = addTourHighlight(['a', 'b']);
    expect(added).toEqual(['a', 'b', '']);
    expect(canAddTourHighlight(Array.from({ length: TOUR_HIGHLIGHT_MAX }, () => 'x'))).toBe(false);
  });

  it('removes a middle highlight without dropping neighbors', () => {
    expect(removeTourHighlight(['one', 'two', 'three', 'four'], 2)).toEqual(['one', 'two', 'four']);
  });

  it('persists only filled highlights', () => {
    expect(persistableTourHighlights(['  a  ', '', 'b', '  '])).toEqual(['a', 'b']);
  });
});

describe('identity preview overflow', () => {
  it('clamps preview copy without mutating the full subtitle', () => {
    const full = `${'NorthernLights'.repeat(20)} https://example.com/${'path'.repeat(40)}`;
    const preview = identityPreviewSubtitle(full);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThan(full.length);
  });
});
