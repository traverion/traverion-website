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
  if (stepIndex === 0) return 'Choose a product type, place, language, title and subtitle to continue.';
  if (stepIndex === 1)
    return 'Add a description, two inclusions, and how guests start to continue.';
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

/** "To continue: add 1 more inclusion, add a country." — null when nothing is missing. */
export function listingCreationMissingHint(missing: string[]): string | null {
  const items = missing.map((line) => line.trim()).filter(Boolean);
  if (items.length === 0) return null;
  if (items.length === 1) return `To continue: ${items[0]}.`;
  return `To continue: ${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}.`;
}

/** What is still missing on the tour Experience step. */
export function tourDetailsMissingItems(input: {
  includeCount: number;
  /** @deprecated Exclusions are optional — ignored when present. */
  excludeCount?: number;
  descriptionLength: number;
  minDescriptionLength: number;
  startStyleOk: boolean;
}): string[] {
  const missing: string[] = [];
  if (input.descriptionLength < input.minDescriptionLength) {
    missing.push(`add a description of at least ${input.minDescriptionLength} characters`);
  }
  const inc = Math.max(0, 2 - input.includeCount);
  if (inc > 0) missing.push(inc === 1 ? 'add 1 more inclusion' : `add ${inc} inclusions`);
  if (!input.startStyleOk) missing.push('choose how guests start');
  return missing;
}

/** What is still missing on the tour Photos step for the given gate. */
export function photosMissingItems(input: {
  photoCount: number;
  minPhotos: number;
  isNewCreation: boolean;
  photosPublishReady: boolean;
}): string[] {
  if (input.isNewCreation) {
    if (input.photosPublishReady) return [];
    const need = Math.max(0, input.minPhotos - input.photoCount);
    if (need > 0) return [need === 1 ? 'add 1 more photo' : `add ${need} more photos`];
    return ['replace the placeholder cover with a real photo'];
  }
  return input.photoCount >= 1 ? [] : ['add at least one photo'];
}
