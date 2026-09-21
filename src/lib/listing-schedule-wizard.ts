import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';
import { listingCreationAccessState, previousStepsSatisfied } from './listing-creation-progression';
import type { ListingCreationNavItem } from './listing-creation-workspace';
import {
  findScheduleOverlap,
  listingLocalDateKey,
  scheduleCapacityValid,
  scheduleHeadlineName,
  scheduleIsBookable,
  scheduleOverlapMessage,
  scheduleWizardIsComplete,
} from './listing-option-schedules';
import { listingShapeHasBookablePrice, optionPricingMode, priceCategoryValidationMessages } from './price-categories';

export const TOUR_SCHEDULE_SCENES = [
  { id: 'schedule', label: 'Schedule', question: 'When does this schedule apply?' },
  { id: 'pricing', label: 'Pricing', question: 'What do travelers pay?' },
  { id: 'capacity', label: 'Capacity', question: 'How many travelers can join?' },
  { id: 'review', label: 'Review', question: 'Does this schedule look right?' },
] as const;

export type TourScheduleSceneId = (typeof TOUR_SCHEDULE_SCENES)[number]['id'];
export const TOUR_SCHEDULE_SCENE_COUNT = TOUR_SCHEDULE_SCENES.length;

export function clampTourScheduleSceneIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(TOUR_SCHEDULE_SCENE_COUNT - 1, Math.trunc(index)));
}

export function nextTourScheduleScene(index: number): number {
  return clampTourScheduleSceneIndex(index + 1);
}

export function previousTourScheduleScene(index: number): number {
  return clampTourScheduleSceneIndex(index - 1);
}

export function schedulePeriodIssues(schedule: ListingOptionSchedule): string[] {
  const msg: string[] = [];
  const from = listingLocalDateKey(schedule.availabilityDateFrom);
  const to = listingLocalDateKey(schedule.availabilityDateTo);
  if (!from) msg.push('Add a starting date.');
  if (to && !from) msg.push('Add a starting date when you set an ending date, or clear the ending date.');
  if (from && to && from > to) msg.push('Ending date must be after starting date.');
  if (!schedule.weekdays.some(Boolean)) msg.push('Choose at least one operating day.');
  if (!schedule.startTime.trim()) msg.push('Add at least one departure time.');
  return msg;
}

export function schedulePricingIssues(schedule: ListingOptionSchedule): string[] {
  const msgs = priceCategoryValidationMessages(schedule);
  if (optionPricingMode(schedule) === 'age_dependent') {
    return msgs.map((line) =>
      line === 'Set a price greater than zero for at least one age category.'
        ? 'Set a price for Adult.'
        : line
    );
  }
  return msgs;
}

export function scheduleCapacityIssues(schedule: ListingOptionSchedule): string[] {
  const msg: string[] = [];
  if (!scheduleCapacityValid(schedule)) {
    if (schedule.maxSpotsPerSlot < 1) msg.push('Maximum capacity must be at least 1.');
    else msg.push('Set minimum and maximum guests so max is not below min.');
  }
  return msg;
}

export function scheduleReadyOverlapIssue(
  schedule: ListingOptionSchedule,
  option: ListingBookingOption
): string | null {
  if (schedule.status === 'draft') return null;
  if (!scheduleWizardIsComplete(schedule)) return null;
  const conflict = findScheduleOverlap(schedule, option.schedules ?? []);
  return conflict ? scheduleOverlapMessage(conflict) : null;
}

export function isTourScheduleSceneSatisfied(
  sceneIndex: number,
  schedule: ListingOptionSchedule,
  option?: ListingBookingOption
): boolean {
  const scene = TOUR_SCHEDULE_SCENES[clampTourScheduleSceneIndex(sceneIndex)];
  if (!scene) return false;
  if (scene.id === 'schedule') return schedulePeriodIssues(schedule).length === 0;
  if (scene.id === 'pricing') return schedulePricingIssues(schedule).length === 0;
  if (scene.id === 'capacity') return scheduleCapacityIssues(schedule).length === 0;
  const overlap = option ? scheduleReadyOverlapIssue({ ...schedule, status: 'ready' }, option) : null;
  return scheduleWizardIsComplete(schedule) && !overlap;
}

export function canVisitTourScheduleScene(input: {
  targetIndex: number;
  isNewSchedule: boolean;
  schedule: ListingOptionSchedule;
}): boolean {
  if (!input.isNewSchedule) return true;
  return previousStepsSatisfied(input.targetIndex, (index) =>
    isTourScheduleSceneSatisfied(index, input.schedule)
  );
}

export function canContinueTourScheduleScene(input: {
  sceneIndex: number;
  schedule: ListingOptionSchedule;
  option?: ListingBookingOption;
}): boolean {
  return isTourScheduleSceneSatisfied(input.sceneIndex, input.schedule, input.option);
}

export function tourScheduleSceneContinueHint(input: {
  sceneIndex: number;
  schedule: ListingOptionSchedule;
  option?: ListingBookingOption;
  canContinue: boolean;
}): string | null {
  if (input.canContinue) return null;
  const scene = TOUR_SCHEDULE_SCENES[clampTourScheduleSceneIndex(input.sceneIndex)];
  if (scene?.id === 'schedule') return schedulePeriodIssues(input.schedule)[0] ?? 'Finish the schedule dates to continue.';
  if (scene?.id === 'pricing') return schedulePricingIssues(input.schedule)[0] ?? 'Finish pricing to continue.';
  if (scene?.id === 'capacity') return scheduleCapacityIssues(input.schedule)[0] ?? 'Finish capacity to continue.';
  if (input.option) {
    const overlap = scheduleReadyOverlapIssue({ ...input.schedule, status: 'ready' }, input.option);
    if (overlap) return overlap;
  }
  return 'Finish the remaining schedule details before saving.';
}

export function tourScheduleLockedReason(input: {
  targetIndex: number;
  schedule: ListingOptionSchedule;
}): string {
  if (input.targetIndex <= 0) return '';
  const firstIncomplete = Array.from({ length: input.targetIndex }, (_, i) => i).find(
    (i) => !isTourScheduleSceneSatisfied(i, input.schedule)
  );
  if (firstIncomplete == null) return '';
  return (
    tourScheduleSceneContinueHint({
      sceneIndex: firstIncomplete,
      schedule: input.schedule,
      canContinue: false,
    }) ?? 'Complete the previous step first.'
  );
}

export function tourScheduleContextNavItems(
  currentIndex: number,
  options?: {
    isNewSchedule?: boolean;
    schedule?: ListingOptionSchedule;
  }
): ListingCreationNavItem[] {
  const current = clampTourScheduleSceneIndex(currentIndex);
  const isNewSchedule = options?.isNewSchedule === true;
  const schedule = options?.schedule;
  return TOUR_SCHEDULE_SCENES.map((scene, index) => ({
    id: scene.id,
    label: scene.label,
    state: listingCreationAccessState({
      index,
      currentIndex: current,
      isNewCreation: isNewSchedule,
      isSatisfied: (idx) => (schedule ? isTourScheduleSceneSatisfied(idx, schedule) : idx < current),
    }),
  }));
}

export function firstScheduleIssueFocusId(schedule: ListingOptionSchedule): string | null {
  if (schedulePeriodIssues(schedule).length > 0) return 'supplier-schedule-field-from';
  if (schedulePricingIssues(schedule).length > 0) return 'supplier-schedule-field-price';
  if (scheduleCapacityIssues(schedule).length > 0) return 'supplier-schedule-field-capacity';
  return null;
}

export function scheduleCanSaveReady(
  schedule: ListingOptionSchedule,
  option: ListingBookingOption
): { ok: true } | { ok: false; error: string } {
  if (!scheduleWizardIsComplete(schedule)) {
    return {
      ok: false,
      error:
        schedulePeriodIssues(schedule)[0] ??
        schedulePricingIssues(schedule)[0] ??
        scheduleCapacityIssues(schedule)[0] ??
        'Finish this schedule before saving.',
    };
  }
  const overlap = findScheduleOverlap({ ...schedule, status: 'ready' }, option.schedules ?? []);
  if (overlap) return { ok: false, error: scheduleOverlapMessage(overlap) };
  return { ok: true };
}

export function optionScheduleManagementIssues(option: ListingBookingOption): string[] {
  if (option.schedules !== undefined) {
    const ready = (option.schedules ?? []).filter(
      (s) => s.status !== 'draft' && scheduleWizardIsComplete(s) && listingShapeHasBookablePrice(s)
    );
    if (ready.length === 0) {
      return ['Add at least one complete schedule before finishing this option.'];
    }
    return [];
  }
  if (scheduleIsBookable({
    id: `${option.id}-implicit`,
    name: option.name,
    availabilityDateFrom: option.availabilityDateFrom,
    availabilityDateTo: option.availabilityDateTo,
    weekdays: option.weekdays,
    startTime: option.startTime,
    pricingMode: option.pricingMode,
    priceUsd: option.priceUsd,
    priceCategories: option.priceCategories,
    isPrivate: option.isPrivate,
    privatePricing: option.privatePricing,
    privateGroupPriceUsd: option.privateGroupPriceUsd,
    minPersons: option.minPersons,
    maxPersons: option.maxPersons,
    maxSpotsPerSlot: option.maxSpotsPerSlot,
    status: 'ready',
  })) {
    return [];
  }
  return ['Add at least one complete schedule before finishing this option.'];
}

export { scheduleHeadlineName };
