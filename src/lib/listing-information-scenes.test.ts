import { describe, expect, it } from 'vitest';
import {
  TOUR_INFORMATION_SCENE_COUNT,
  bumpInformationFarthest,
  canAdvanceTourInformationScene,
  canSelectTourInformationScene,
  clampTourInformationSceneIndex,
  initialTourInformationSceneIndex,
  isTourInformationSceneSatisfied,
  nextTourInformationScene,
  previousTourInformationScene,
  tourInformationSceneForFocusSection,
  tourInformationSceneHasContent,
} from './listing-information-scenes';

describe('listing information scenes', () => {
  it('clamps and advances like Basics', () => {
    expect(clampTourInformationSceneIndex(-1)).toBe(0);
    expect(clampTourInformationSceneIndex(99)).toBe(TOUR_INFORMATION_SCENE_COUNT - 1);
    expect(nextTourInformationScene(0)).toBe(1);
    expect(previousTourInformationScene(2)).toBe(1);
    expect(canAdvanceTourInformationScene(0)).toBe(true);
  });

  it('maps focus sections to scenes', () => {
    expect(tourInformationSceneForFocusSection('know_before')).toBe(0);
    expect(tourInformationSceneForFocusSection('accessibility')).toBe(1);
    expect(tourInformationSceneForFocusSection('booking_contact')).toBe(2);
  });

  it('treats empty optional scenes as satisfied once moved past', () => {
    expect(isTourInformationSceneSatisfied(0, {}, 1)).toBe(true);
    expect(isTourInformationSceneSatisfied(1, {}, 1)).toBe(false);
    expect(
      tourInformationSceneHasContent(0, { knowBeforeYouGo: 'Bring warm clothes' })
    ).toBe(true);
  });

  it('gates pill selection by farthest reached for new listings', () => {
    expect(canSelectTourInformationScene(2, 0, 0, false)).toBe(false);
    expect(canSelectTourInformationScene(1, 0, 1, false)).toBe(true);
    expect(canSelectTourInformationScene(2, 0, 0, true)).toBe(true);
    expect(bumpInformationFarthest(0, 2)).toBe(2);
  });

  it('returns to last scene when coming back from Options', () => {
    expect(
      initialTourInformationSceneIndex({
        stored: 0,
        farthest: 2,
        enterFromOptionsBack: true,
      })
    ).toBe(2);
  });
});
