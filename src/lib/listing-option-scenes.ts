import type { ListingBookingOption } from '../types/listingExtras';
import { isListingBookingOptionEffectivelyEmpty } from '../types/listingExtras';
import { listingCreationStepState, type ListingCreationNavItem } from './listing-creation-workspace';

export const TOUR_OPTION_SCENES = [
  { id: 'setup', label: 'Setup', question: 'Name this bookable option' },
  { id: 'meeting', label: 'Meeting', question: 'Where do guests meet or get picked up?' },
  { id: 'pricing', label: 'Pricing', question: 'How is this option priced?' },
  { id: 'schedule', label: 'Schedule', question: 'When can travelers book it?' },
  { id: 'review', label: 'Review', question: 'Does this option look right?' },
] as const;

export type TourOptionSceneId = (typeof TOUR_OPTION_SCENES)[number]['id'];
export const TOUR_OPTION_SCENE_COUNT = TOUR_OPTION_SCENES.length;

export type TourOptionReadiness = 'draft' | 'incomplete' | 'ready';

export function clampTourOptionSceneIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(TOUR_OPTION_SCENE_COUNT - 1, Math.trunc(index)));
}

export function tourOptionReadiness(
  option: ListingBookingOption | null | undefined,
  validationMessages: string[]
): TourOptionReadiness {
  if (!option || isListingBookingOptionEffectivelyEmpty(option)) return 'draft';
  if (validationMessages.length > 0) return 'incomplete';
  return 'ready';
}

export function tourOptionReadinessLabel(status: TourOptionReadiness): string {
  if (status === 'ready') return 'Ready';
  if (status === 'incomplete') return 'Incomplete';
  return 'Draft';
}

export function readyBookingOptions<T extends ListingBookingOption>(
  options: T[],
  messagesFor: (option: T) => string[]
): T[] {
  return options.filter((option) => tourOptionReadiness(option, messagesFor(option)) === 'ready');
}

export function nextTourOptionScene(index: number): number {
  return clampTourOptionSceneIndex(index + 1);
}

export function previousTourOptionScene(index: number): number {
  return clampTourOptionSceneIndex(index - 1);
}

/** Upsert by canonical option id so retries never create a second option. */
export function upsertBookingOption<T extends { id: string }>(options: T[], next: T): T[] {
  const exists = options.some((option) => option.id === next.id);
  if (!exists) return [...options, next];
  return options.map((option) => (option.id === next.id ? next : option));
}

export function duplicateBookingOption<T extends ListingBookingOption>(
  option: T,
  nextId: string
): T {
  const name = option.name.trim();
  return {
    ...option,
    id: nextId,
    name: name ? `${name} (copy)` : 'Untitled option (copy)',
  };
}

export function tourOptionContextNavItems(currentIndex: number): ListingCreationNavItem[] {
  const current = clampTourOptionSceneIndex(currentIndex);
  return TOUR_OPTION_SCENES.map((scene, index) => ({
    id: scene.id,
    label: scene.label,
    state: listingCreationStepState(index, current, index < current),
  }));
}
