import type { ListingBookingOption, ListingOptionSchedule, ListingPriceCategory } from '../types/listingExtras';
import { isListingBookingOptionEffectivelyEmpty } from '../types/listingExtras';
import { newListingOptionScheduleId } from './listing-option-schedules';
import { newPriceCategoryId } from './price-categories';
import {
  TOUR_OPTION_AVAILABILITY_SCENE_INDEX,
  TOUR_OPTION_SCENE_COUNT,
  TOUR_OPTION_SCENES,
  clampTourOptionSceneIndex,
  nextTourOptionScene,
  previousTourOptionScene,
  tourOptionContextNavItems,
  type TourOptionSceneId,
} from './listing-option-progression';

export {
  TOUR_OPTION_AVAILABILITY_SCENE_INDEX,
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

function remintPriceCategories(
  categories: ListingPriceCategory[] | undefined
): ListingPriceCategory[] | undefined {
  if (!categories?.length) return categories;
  return categories.map((c) => ({ ...c, id: newPriceCategoryId() }));
}

function remintSchedule(schedule: ListingOptionSchedule): ListingOptionSchedule {
  return {
    ...schedule,
    id: newListingOptionScheduleId(),
    priceCategories: remintPriceCategories(schedule.priceCategories),
  };
}

/** Independent copy: new option id, schedule ids, and price-category ids. */
export function duplicateBookingOption<T extends ListingBookingOption>(
  option: T,
  nextId: string
): T {
  const name = option.name.trim();
  return {
    ...option,
    id: nextId,
    name: name ? `${name} (copy)` : 'Untitled option (copy)',
    priceCategories: remintPriceCategories(option.priceCategories),
    schedules: option.schedules?.map(remintSchedule),
  };
}
