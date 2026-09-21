/** Shared listing-creation shell (tour + stay). Navigation states only — no fake completion. */

import {
  listingCreationAccessState,
  listingCreationProgressCopy as truthfulProgressCopy,
  type ListingCreationAccess,
} from './listing-creation-progression';

export type ListingCreationStepState = ListingCreationAccess;

export type ListingCreationNavItem = {
  id: string;
  label: string;
  state: ListingCreationStepState;
};

/** Nested object editor nav. Supply only when a real nested workflow exists. */
export type ListingCreationContextNav = {
  title: string;
  items: ListingCreationNavItem[];
  onSelect?: (id: string) => void;
};

export function listingCreationStepState(
  index: number,
  currentIndex: number,
  satisfied: boolean,
  locked = false
): ListingCreationStepState {
  if (index === currentIndex) return 'current';
  if (locked) return 'locked';
  if (satisfied) return 'complete';
  return 'upcoming';
}

export const listingCreationProgressCopy = truthfulProgressCopy;

export function listingCreationNavItems(
  steps: readonly { id: string; label: string }[],
  currentIndex: number,
  isSatisfied: (index: number) => boolean,
  options?: { isNewCreation?: boolean }
): ListingCreationNavItem[] {
  const isNewCreation = options?.isNewCreation === true;
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
