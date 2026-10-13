/**
 * Guided scenes inside Tour → Information (mirrors Basics scene helpers).
 * Optional fields never block Continue; publish still gates booking contact separately.
 */

export const TOUR_INFORMATION_SCENES = [
  {
    id: 'guest_preparation',
    label: 'Guest preparation',
    question: 'What should guests know before arriving?',
    support: 'Help travelers prepare for their experience.',
  },
  {
    id: 'suitability',
    label: 'Suitability',
    question: 'Who is this experience suitable for?',
    support: 'Share important participation restrictions and accessibility features.',
  },
  {
    id: 'languages_contact',
    label: 'Languages & contact',
    question: 'How can travelers communicate with you?',
    support: 'Choose your experience languages and provide a contact number for confirmed bookings.',
  },
] as const;

export type TourInformationSceneId = (typeof TOUR_INFORMATION_SCENES)[number]['id'];
export const TOUR_INFORMATION_SCENE_COUNT = TOUR_INFORMATION_SCENES.length;

export type TourInformationFields = {
  knowBeforeYouGo?: string;
  whatToBring?: string;
  whatToBringIds?: string[];
  requirementsNotes?: string;
  notSuitableForIds?: string[];
  accessibilitySummary?: string;
  accessibilityFeatureIds?: string[];
  additionalInfo?: string;
  additionalLanguages?: string[];
  bookingContactPhoneE164?: string;
};

export function clampTourInformationSceneIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(TOUR_INFORMATION_SCENE_COUNT - 1, Math.trunc(index)));
}

export function nextTourInformationScene(index: number): number {
  return clampTourInformationSceneIndex(index + 1);
}

export function previousTourInformationScene(index: number): number {
  return clampTourInformationSceneIndex(index - 1);
}

export function tourInformationSceneHasContent(
  sceneIndex: number,
  fields: TourInformationFields
): boolean {
  const idx = clampTourInformationSceneIndex(sceneIndex);
  if (idx === 0) {
    return Boolean(
      (fields.knowBeforeYouGo ?? '').trim() ||
        (fields.whatToBring ?? '').trim() ||
        (fields.whatToBringIds?.length ?? 0) > 0
    );
  }
  if (idx === 1) {
    return Boolean(
      (fields.requirementsNotes ?? '').trim() ||
        (fields.accessibilitySummary ?? '').trim() ||
        (fields.notSuitableForIds?.length ?? 0) > 0 ||
        (fields.accessibilityFeatureIds?.length ?? 0) > 0
    );
  }
  return Boolean(
    (fields.additionalInfo ?? '').trim() ||
      (fields.additionalLanguages?.length ?? 0) > 0 ||
      (fields.bookingContactPhoneE164 ?? '').trim()
  );
}

/**
 * Checkmark state: content filled, or the supplier has already moved past this scene.
 * Empty optional scenes are not marked incomplete once visited via Continue.
 */
export function isTourInformationSceneSatisfied(
  sceneIndex: number,
  fields: TourInformationFields,
  currentIndex: number
): boolean {
  const idx = clampTourInformationSceneIndex(sceneIndex);
  const current = clampTourInformationSceneIndex(currentIndex);
  if (tourInformationSceneHasContent(idx, fields)) return true;
  return idx < current;
}

/** Optional Information scenes never block Continue / advance. */
export function canAdvanceTourInformationScene(_sceneIndex: number): boolean {
  return true;
}

export function canSelectTourInformationScene(
  targetIndex: number,
  currentIndex: number,
  farthestReached: number,
  isEditing: boolean
): boolean {
  const target = clampTourInformationSceneIndex(targetIndex);
  const current = clampTourInformationSceneIndex(currentIndex);
  const farthest = clampTourInformationSceneIndex(farthestReached);
  if (target === current) return true;
  if (isEditing) return true;
  if (target <= farthest) return true;
  return false;
}

export function tourInformationSceneForFocusSection(section: string | null | undefined): number | null {
  if (!section) return null;
  if (
    section === 'know_before' ||
    section === 'what_to_bring' ||
    section === 'guest' ||
    section === 'guest_preparation'
  ) {
    return 0;
  }
  if (
    section === 'requirements' ||
    section === 'accessibility' ||
    section === 'suitability' ||
    section === 'not_suitable'
  ) {
    return 1;
  }
  if (
    section === 'languages' ||
    section === 'additional_info' ||
    section === 'booking_contact' ||
    section === 'contact'
  ) {
    return 2;
  }
  return null;
}

export function initialTourInformationSceneIndex(input: {
  stored: number | null;
  farthest: number | null;
  focusSection?: string | null;
  /** When returning from Options via Back, land on the last Information scene. */
  enterFromOptionsBack?: boolean;
}): number {
  const focused = tourInformationSceneForFocusSection(input.focusSection ?? null);
  if (focused !== null) return focused;
  if (input.enterFromOptionsBack) return TOUR_INFORMATION_SCENE_COUNT - 1;
  if (input.stored !== null) return clampTourInformationSceneIndex(input.stored);
  return 0;
}

export function bumpInformationFarthest(farthest: number, sceneIndex: number): number {
  return Math.max(
    clampTourInformationSceneIndex(farthest),
    clampTourInformationSceneIndex(sceneIndex)
  );
}
