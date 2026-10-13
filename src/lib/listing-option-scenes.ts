import type { ListingBookingOption } from '../types/listingExtras';
import { isListingBookingOptionEffectivelyEmpty } from '../types/listingExtras';
import {
  TOUR_OPTION_SCENE_COUNT,
  TOUR_OPTION_SCENES,
  clampTourOptionSceneIndex,
  nextTourOptionScene,
  previousTourOptionScene,
  tourOptionContextNavItems,
  type TourOptionSceneId,
} from './listing-option-progression';

export {
  TOUR_OPTION_SCENE_COUNT,
  TOUR_OPTION_SCENES,
  clampTourOptionSceneIndex,
  nextTourOptionScene,
  previousTourOptionScene,
  tourOptionContextNavItems,
};
export type { TourOptionSceneId };

export type TourOptionReadiness = 'draft' | 'incomplete' | 'ready';

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
