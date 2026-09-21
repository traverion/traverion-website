/**
 * Tour option wizard: 4 supplier-facing steps with strict forward gating for NEW options.
 *
 * Availability, pricing and capacity stay on the existing ListingBookingOption JSON.
 * The Availability & Pricing scene is a summary; configuration opens a nested sub-workspace.
 *
 * Existing options remain freely visitable so legacy data is not trapped behind new gates.
 */

import type { ListingBookingOption } from '../types/listingExtras';
import { listingCreationAccessState, previousStepsSatisfied } from './listing-creation-progression';
import type { ListingCreationNavItem } from './listing-creation-workspace';
import { formatOptionWeekdays } from './booking-quote';
import {
  bookingOptionAvailabilityIssues,
  bookingOptionCapacityIssues,
  bookingOptionMeetingIssues,
  bookingOptionPricingIssues,
  bookingOptionSetupIssues,
  type OptionEndingDateState,
} from './listing-option-validation';

export const TOUR_OPTION_SCENES = [
  { id: 'setup', label: 'Setup', question: 'Name this bookable option' },
  { id: 'meeting', label: 'Meeting', question: 'How do travelers start this option?' },
  {
    id: 'availability_pricing',
    label: 'Availability & Pricing',
    question: 'When can they book, and what do they pay?',
  },
  { id: 'review', label: 'Review', question: 'Does this option look right?' },
] as const;

export type TourOptionSceneId = (typeof TOUR_OPTION_SCENES)[number]['id'];
export const TOUR_OPTION_SCENE_COUNT = TOUR_OPTION_SCENES.length;

export type TourOptionConfigPanel = 'availability' | 'pricing' | 'capacity';

export function tourOptionConfigPanelIssues(
  panel: TourOptionConfigPanel,
  option: ListingBookingOption,
  ending?: OptionEndingDateState
): string[] {
  if (panel === 'availability') return bookingOptionAvailabilityIssues(option, ending);
  if (panel === 'pricing') return bookingOptionPricingIssues(option);
  return bookingOptionCapacityIssues(option);
}

export function tourOptionConfigSaveHint(
  panel: TourOptionConfigPanel,
  option: ListingBookingOption,
  ending?: OptionEndingDateState
): string | null {
  return tourOptionConfigPanelIssues(panel, option, ending)[0] ?? null;
}

export function clampTourOptionSceneIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(TOUR_OPTION_SCENE_COUNT - 1, Math.trunc(index)));
}

export function nextTourOptionScene(index: number): number {
  return clampTourOptionSceneIndex(index + 1);
}

export function previousTourOptionScene(index: number): number {
  return clampTourOptionSceneIndex(index - 1);
}

export function isTourOptionSceneSatisfied(
  sceneIndex: number,
  option: ListingBookingOption,
  ending?: OptionEndingDateState
): boolean {
  const scene = TOUR_OPTION_SCENES[clampTourOptionSceneIndex(sceneIndex)];
  if (!scene) return false;
  if (scene.id === 'setup') return bookingOptionSetupIssues(option).length === 0;
  if (scene.id === 'meeting') return bookingOptionMeetingIssues(option).length === 0;
  if (scene.id === 'availability_pricing') {
    return (
      bookingOptionAvailabilityIssues(option, ending).length === 0 &&
      bookingOptionPricingIssues(option).length === 0 &&
      bookingOptionCapacityIssues(option).length === 0
    );
  }
  return (
    bookingOptionSetupIssues(option).length === 0 &&
    bookingOptionMeetingIssues(option).length === 0 &&
    bookingOptionAvailabilityIssues(option, ending).length === 0 &&
    bookingOptionPricingIssues(option).length === 0 &&
    bookingOptionCapacityIssues(option).length === 0
  );
}

export function canVisitTourOptionScene(input: {
  targetIndex: number;
  isNewOption: boolean;
  option: ListingBookingOption;
  ending?: OptionEndingDateState;
}): boolean {
  if (!input.isNewOption) return true;
  return previousStepsSatisfied(input.targetIndex, (index) =>
    isTourOptionSceneSatisfied(index, input.option, input.ending)
  );
}

export function canContinueTourOptionScene(input: {
  sceneIndex: number;
  option: ListingBookingOption;
  ending?: OptionEndingDateState;
}): boolean {
  return isTourOptionSceneSatisfied(input.sceneIndex, input.option, input.ending);
}

export function tourOptionSceneContinueHint(input: {
  sceneIndex: number;
  option: ListingBookingOption;
  ending?: OptionEndingDateState;
  canContinue: boolean;
}): string | null {
  if (input.canContinue) return null;
  const scene = TOUR_OPTION_SCENES[clampTourOptionSceneIndex(input.sceneIndex)];
  if (scene?.id === 'setup') return bookingOptionSetupIssues(input.option)[0] ?? 'Finish Setup to continue.';
  if (scene?.id === 'meeting') {
    return bookingOptionMeetingIssues(input.option)[0] ?? 'Finish Meeting to continue.';
  }
  if (scene?.id === 'availability_pricing') {
    return (
      bookingOptionAvailabilityIssues(input.option, input.ending)[0] ??
      bookingOptionPricingIssues(input.option)[0] ??
      bookingOptionCapacityIssues(input.option)[0] ??
      'Finish availability and pricing to continue.'
    );
  }
  return 'Finish the remaining option details before completing.';
}

export function tourOptionLockedReason(input: {
  targetIndex: number;
  option: ListingBookingOption;
  ending?: OptionEndingDateState;
}): string {
  if (input.targetIndex <= 0) return '';
  const firstIncomplete = Array.from({ length: input.targetIndex }, (_, i) => i).find(
    (i) => !isTourOptionSceneSatisfied(i, input.option, input.ending)
  );
  if (firstIncomplete == null) return '';
  return (
    tourOptionSceneContinueHint({
      sceneIndex: firstIncomplete,
      option: input.option,
      ending: input.ending,
      canContinue: false,
    }) ?? 'Complete the previous step first.'
  );
}

export function tourOptionContextNavItems(
  currentIndex: number,
  options?: {
    isNewOption?: boolean;
    option?: ListingBookingOption;
    ending?: OptionEndingDateState;
  }
): ListingCreationNavItem[] {
  const current = clampTourOptionSceneIndex(currentIndex);
  const isNewOption = options?.isNewOption === true;
  const option = options?.option;
  return TOUR_OPTION_SCENES.map((scene, index) => ({
    id: scene.id,
    label: scene.label,
    state: listingCreationAccessState({
      index,
      currentIndex: current,
      isNewCreation: isNewOption,
      isSatisfied: (idx) => (option ? isTourOptionSceneSatisfied(idx, option, options?.ending) : idx < current),
    }),
  }));
}

export function isOptionAvailabilityConfigured(option: ListingBookingOption): boolean {
  return option.weekdays.some(Boolean) && option.startTime.trim().length > 0;
}

export function isOptionPricingConfigured(option: ListingBookingOption): boolean {
  return bookingOptionPricingIssues(option).length === 0;
}

export function isOptionCapacityConfigured(option: ListingBookingOption): boolean {
  return bookingOptionCapacityIssues(option).length === 0;
}

export function summarizeOptionAvailability(option: ListingBookingOption): string {
  if (!isOptionAvailabilityConfigured(option)) return 'Not configured';
  const days = formatOptionWeekdays(option.weekdays);
  const from = option.availabilityDateFrom.trim();
  const to = option.availabilityDateTo.trim();
  const range = from && to ? `${from} – ${to}` : from ? `From ${from}` : to ? `Until ${to}` : 'Ongoing';
  const time = option.startTime.trim();
  return [range, days, time].filter(Boolean).join(' · ');
}

export function summarizeOptionCapacity(option: ListingBookingOption): string {
  if (!isOptionCapacityConfigured(option)) return 'Not configured';
  return `${option.minPersons}–${option.maxPersons} guests · ${option.maxSpotsPerSlot} per departure`;
}

export function summarizeOptionChargeModel(option: ListingBookingOption): string {
  if (option.isPrivate && option.privatePricing === 'flat_group') {
    return 'Whole group';
  }
  if (option.pricingMode === 'age_dependent') return 'Per person · by age';
  return 'Per person';
}

export function optionAvailabilityPricingReady(
  option: ListingBookingOption,
  ending?: OptionEndingDateState
): boolean {
  return isTourOptionSceneSatisfied(2, option, ending);
}
