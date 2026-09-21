/** Sequential creation gates. New listings cannot skip unfinished structure. Existing listings stay freely editable. */

export type ListingCreationAccess = 'complete' | 'current' | 'upcoming' | 'locked';

export function previousStepsSatisfied(
  targetIndex: number,
  isSatisfied: (index: number) => boolean
): boolean {
  if (targetIndex <= 0) return true;
  for (let i = 0; i < targetIndex; i += 1) {
    if (!isSatisfied(i)) return false;
  }
  return true;
}

export function canVisitListingCreationStep(input: {
  targetIndex: number;
  isNewCreation: boolean;
  isSatisfied: (index: number) => boolean;
}): boolean {
  if (!input.isNewCreation) return true;
  return previousStepsSatisfied(input.targetIndex, input.isSatisfied);
}

export function listingCreationAccessState(input: {
  index: number;
  currentIndex: number;
  isNewCreation: boolean;
  isSatisfied: (index: number) => boolean;
}): ListingCreationAccess {
  if (input.index === input.currentIndex) return 'current';
  if (input.isNewCreation && !previousStepsSatisfied(input.index, input.isSatisfied)) return 'locked';
  if (input.isSatisfied(input.index)) return 'complete';
  return 'upcoming';
}

export function listingCreationNavItemsWithAccess(
  steps: readonly { id: string; label: string }[],
  currentIndex: number,
  isNewCreation: boolean,
  isSatisfied: (index: number) => boolean
): Array<{ id: string; label: string; state: ListingCreationAccess }> {
  return steps.map((step, index) => ({
    id: step.id,
    label: step.label,
    state: listingCreationAccessState({
      index,
      currentIndex,
      isNewCreation,
      isSatisfied,
    }),
  }));
}

export function listingCreationProgressCopy(completeCount: number, total: number): string {
  if (total <= 0) return '';
  if (completeCount >= total) return 'All steps complete';
  return `${completeCount} of ${total} complete`;
}

/** Photos Continue: new creation requires publish-ready photos. Existing drafts may keep a single cover and return later. */
export function canContinueFromPhotos(input: {
  isNewCreation: boolean;
  photoCount: number;
  photosPublishReady: boolean;
}): boolean {
  if (input.isNewCreation) return input.photosPublishReady;
  return input.photoCount >= 1;
}

export function listingCreationLockedReason(input: {
  targetIndex: number;
  isStay: boolean;
  isSatisfied: (index: number) => boolean;
}): string {
  if (input.targetIndex <= 0) return '';
  const firstIncomplete = Array.from({ length: input.targetIndex }, (_, i) => i).find(
    (i) => !input.isSatisfied(i)
  );
  if (firstIncomplete == null) return '';
  return listingCreationStepRequirement(firstIncomplete, input.isStay);
}

export function listingCreationStepRequirement(stepIndex: number, isStay: boolean): string {
  if (isStay) {
    if (stepIndex === 0) return 'Add a title, subtitle and description to continue.';
    if (stepIndex === 1) return 'Add city and country to continue.';
    if (stepIndex === 2) return 'Set how many guests can stay to continue.';
    if (stepIndex === 3) return 'Set nightly rate and check-in times to continue.';
    if (stepIndex === 4) return 'Add at least four photos to continue.';
    return 'Finish the previous step to continue.';
  }
  if (stepIndex === 0) return 'Add a title, language and description to continue.';
  if (stepIndex === 1) return 'Add city, country, two inclusions, and one exclusion to continue.';
  if (stepIndex === 2) return 'Add at least one complete bookable option to continue.';
  if (stepIndex === 3) return 'Add at least four photos to continue.';
  return 'Finish the previous step to continue.';
}

export function listingCreationContinueHint(input: {
  stepIndex: number;
  isStay: boolean;
  canContinue: boolean;
}): string | null {
  if (input.canContinue) return null;
  return listingCreationStepRequirement(input.stepIndex, input.isStay);
}
