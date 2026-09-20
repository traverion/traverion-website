/** Shared listing-creation shell (tour + stay). Navigation states only — no fake completion. */

export type ListingCreationStepState = 'complete' | 'current' | 'upcoming';

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
  satisfied: boolean
): ListingCreationStepState {
  if (index === currentIndex) return 'current';
  if (satisfied) return 'complete';
  return 'upcoming';
}

export function listingCreationProgressCopy(completeCount: number, total: number): string {
  if (total <= 0) return '';
  if (completeCount <= 0) return `${total} steps`;
  if (completeCount >= total) return 'All steps complete';
  return `${completeCount} of ${total} complete`;
}

export function listingCreationNavItems(
  steps: readonly { id: string; label: string }[],
  currentIndex: number,
  isSatisfied: (index: number) => boolean
): ListingCreationNavItem[] {
  return steps.map((step, index) => ({
    id: step.id,
    label: step.label,
    state: listingCreationStepState(index, currentIndex, isSatisfied(index)),
  }));
}
