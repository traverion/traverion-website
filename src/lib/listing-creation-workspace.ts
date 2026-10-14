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
  /** True when this step’s requirements are met (even while it is the current step). */
  requirementsMet?: boolean;
  /** Short operator summary when the step has content (shown under the state caption). */
  summary?: string | null;
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
  options?: {
    isNewCreation?: boolean;
    summaryForIndex?: (index: number) => string | null | undefined;
  }
): ListingCreationNavItem[] {
  const isNewCreation = options?.isNewCreation === true;
  return steps.map((step, index) => {
    const summary = options?.summaryForIndex?.(index)?.trim() || null;
    const requirementsMet = isSatisfied(index);
    return {
      id: step.id,
      label: step.label,
      state: listingCreationAccessState({
        index,
        currentIndex,
        isNewCreation,
        isSatisfied,
      }),
      requirementsMet,
      summary: summary || null,
    };
  });
}
