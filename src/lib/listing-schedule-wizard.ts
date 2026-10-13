import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';
import { listingCreationAccessState, previousStepsSatisfied } from './listing-creation-progression';
import type { ListingCreationNavItem } from './listing-creation-workspace';
import {
  findScheduleOverlap,
  LISTING_CAPACITY_MAX,
  listingLocalDateKey,
  maxWholeGroupsForSlot,
  scheduleCapacityValid,
  scheduleHasFixedDepartures,
  scheduleHeadlineName,
  scheduleIsBookable,
  scheduleOverlapMessage,
  scheduleWizardIsComplete,
} from './listing-option-schedules';
import { optionPricingMode, priceCategoryValidationMessages } from './price-categories';
import { scheduleChargeModelConflict } from './listing-option-charge-model';

export const TOUR_SCHEDULE_SCENES = [
  { id: 'when', label: 'When', question: 'When does this schedule run?' },
  { id: 'price_capacity', label: 'Price & capacity', question: 'Price and capacity' },
  { id: 'review', label: 'Review', question: 'Review this schedule' },
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

export function schedulePeriodIssues(
  schedule: ListingOptionSchedule,
  opts?: { startMode?: ListingBookingOption['startMode'] }
): string[] {
  const msg: string[] = [];
  const named = schedule.name.trim();
  if (named.length < 3) {
    msg.push('Add a schedule name travelers will see (at least 3 characters).');
  }
  const from = listingLocalDateKey(schedule.availabilityDateFrom);
  const to = listingLocalDateKey(schedule.availabilityDateTo);
  if (!from) msg.push('Add a starting date.');
  if (to && !from) msg.push('Add a starting date when you set an ending date, or clear the ending date.');
  if (from && to && from > to) msg.push('Ending date must be after starting date.');
  if (!schedule.weekdays.some(Boolean)) msg.push('Choose at least one operating day.');
  const flexible = opts?.startMode === 'flexible';
  if (!flexible && !scheduleHasFixedDepartures(schedule, opts?.startMode)) {
    msg.push('Add at least one start time on a day this schedule should run.');
  }
  return msg;
}

export function schedulePricingIssues(schedule: ListingOptionSchedule): string[] {
  const msgs = priceCategoryValidationMessages(schedule);
  if (optionPricingMode(schedule) === 'age_dependent') {
    return msgs.map((line) =>
      line === 'Set a price greater than zero for at least one age category.' ||
      line === 'Enter a price greater than zero for at least one age category.'
        ? 'Set a price for Adult.'
        : line
    );
  }
  return msgs.map((line) =>
    line === 'Enter a price greater than zero.' ? 'Enter what travelers pay for this schedule.' : line
  );
}

export function scheduleCapacityIssues(
  schedule: ListingOptionSchedule,
  opts?: { guestsCeiling?: number; spotsCeiling?: number; requireGroups?: boolean }
): string[] {
  const msg: string[] = [];
  const spotsCeiling =
    typeof opts?.spotsCeiling === 'number' && opts.spotsCeiling >= 1
      ? Math.min(LISTING_CAPACITY_MAX, Math.floor(opts.spotsCeiling))
      : LISTING_CAPACITY_MAX;
  const guestsCeiling = Math.min(
    typeof opts?.guestsCeiling === 'number' && opts.guestsCeiling >= 1
      ? Math.min(LISTING_CAPACITY_MAX, Math.floor(opts.guestsCeiling))
      : LISTING_CAPACITY_MAX,
    // Booking/group size cannot exceed option slot capacity (inherited onto the schedule).
    schedule.maxSpotsPerSlot >= 1 ? schedule.maxSpotsPerSlot : spotsCeiling,
    spotsCeiling
  );
  if (schedule.maxSpotsPerSlot < 1 && spotsCeiling < LISTING_CAPACITY_MAX) {
    msg.push(
      `Set travelers per start time on the option (Pricing). Current option capacity is required before finishing capacity.`
    );
  } else if (schedule.maxSpotsPerSlot > spotsCeiling) {
    msg.push(`Travelers per start time cannot exceed ${spotsCeiling} (option capacity).`);
  }
  if (schedule.maxPersons > guestsCeiling) {
    msg.push(
      opts?.requireGroups
        ? `Max group size cannot exceed the option capacity of ${guestsCeiling} travelers per start time.`
        : `Max guests per booking cannot exceed the option capacity of ${guestsCeiling} travelers per start time.`
    );
  }
  if (schedule.maxSpotsPerSlot >= 1 && schedule.maxPersons > schedule.maxSpotsPerSlot) {
    msg.push(
      opts?.requireGroups
        ? 'Max group size cannot exceed travelers per start time.'
        : 'Max guests per booking cannot exceed travelers per start time.'
    );
  }
  if (opts?.requireGroups && schedule.maxPersons >= 1 && schedule.maxSpotsPerSlot >= 1) {
    const maxGroups = maxWholeGroupsForSlot(schedule.maxSpotsPerSlot, schedule.maxPersons);
    const groups =
      typeof schedule.maxGroupsPerSlot === 'number' && Number.isFinite(schedule.maxGroupsPerSlot)
        ? Math.floor(schedule.maxGroupsPerSlot)
        : 0;
    if (groups < 1) {
      msg.push('Set how many groups can book the same start time.');
    } else if (maxGroups < 1) {
      msg.push('Max group size cannot exceed travelers per start time.');
    } else if (groups > maxGroups) {
      msg.push(
        `At max group size ${schedule.maxPersons}, you can have at most ${maxGroups} group${
          maxGroups === 1 ? '' : 's'
        } within the option capacity of ${schedule.maxSpotsPerSlot}.`
      );
    }
  }
  if (!scheduleCapacityValid(schedule, { requireGroups: opts?.requireGroups })) {
    if (schedule.maxSpotsPerSlot < 1) {
      msg.push('Option capacity per start time is missing — set it under Pricing on the option.');
    } else if (schedule.maxSpotsPerSlot > LISTING_CAPACITY_MAX || schedule.maxPersons > LISTING_CAPACITY_MAX) {
      msg.push(`Capacity cannot exceed ${LISTING_CAPACITY_MAX} travelers.`);
    } else if (schedule.maxPersons < 1 || schedule.minPersons < 1) {
      msg.push(
        opts?.requireGroups
          ? 'Set minimum and maximum group size.'
          : 'Set minimum and maximum guests per booking.'
      );
    } else if (schedule.maxPersons > schedule.maxSpotsPerSlot) {
      msg.push(
        opts?.requireGroups
          ? 'Max group size cannot exceed travelers per start time.'
          : 'Max guests per booking cannot exceed travelers per start time.'
      );
    } else if (!opts?.requireGroups) {
      msg.push('Set minimum and maximum so max is not below min.');
    }
  }
  return [...new Set(msg)];
}

export function scheduleReadyOverlapIssue(
  schedule: ListingOptionSchedule,
  option: ListingBookingOption
): string | null {
  if (schedule.status === 'draft') return null;
  if (!scheduleWizardIsComplete(schedule, { startMode: option.startMode })) return null;
  const conflict = findScheduleOverlap(schedule, option.schedules ?? [], {
    startMode: option.startMode,
  });
  return conflict ? scheduleOverlapMessage(conflict) : null;
}

export function scheduleCapacityCeilings(option?: ListingBookingOption | null): {
  guestsCeiling: number;
  spotsCeiling: number;
} {
  /** Option-level people capacity for one departure (inventory) — set on Pricing. */
  const spotsCeiling =
    option && typeof option.maxSpotsPerSlot === 'number' && option.maxSpotsPerSlot >= 1
      ? Math.min(LISTING_CAPACITY_MAX, Math.floor(option.maxSpotsPerSlot))
      : LISTING_CAPACITY_MAX;
  /** Per-booking / per-group size on a schedule — capped by option slot capacity. */
  return { guestsCeiling: spotsCeiling, spotsCeiling };
}

export function scheduleRequiresGroups(option?: ListingBookingOption | null): boolean {
  if (!option) return false;
  return (
    option.chargeModel === 'flat_group' ||
    Boolean(option.isPrivate && option.privatePricing === 'flat_group')
  );
}

export function schedulePriceCapacityIssues(
  schedule: ListingOptionSchedule,
  option?: ListingBookingOption
): string[] {
  const ceilings = scheduleCapacityCeilings(option);
  return [
    ...schedulePricingIssues(schedule),
    ...scheduleCapacityIssues(schedule, {
      ...ceilings,
      requireGroups: scheduleRequiresGroups(option),
    }),
  ];
}

export function isTourScheduleSceneSatisfied(
  sceneIndex: number,
  schedule: ListingOptionSchedule,
  option?: ListingBookingOption
): boolean {
  const scene = TOUR_SCHEDULE_SCENES[clampTourScheduleSceneIndex(sceneIndex)];
  if (!scene) return false;
  if (scene.id === 'when') return schedulePeriodIssues(schedule, { startMode: option?.startMode }).length === 0;
  if (scene.id === 'price_capacity') return schedulePriceCapacityIssues(schedule, option).length === 0;
  const overlap = option ? scheduleReadyOverlapIssue({ ...schedule, status: 'ready' }, option) : null;
  return (
    scheduleWizardIsComplete(schedule, { startMode: option?.startMode }) &&
    schedulePriceCapacityIssues(schedule, option).length === 0 &&
    !overlap
  );
}

export function canVisitTourScheduleScene(input: {
  targetIndex: number;
  isNewSchedule: boolean;
  schedule: ListingOptionSchedule;
  option?: ListingBookingOption;
}): boolean {
  if (!input.isNewSchedule) return true;
  return previousStepsSatisfied(input.targetIndex, (index) =>
    isTourScheduleSceneSatisfied(index, input.schedule, input.option)
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
  if (scene?.id === 'when') {
    return (
      schedulePeriodIssues(input.schedule, { startMode: input.option?.startMode })[0] ??
      'Finish when this schedule runs to continue.'
    );
  }
  if (scene?.id === 'price_capacity') {
    return (
      schedulePriceCapacityIssues(input.schedule, input.option)[0] ??
      'Finish price and capacity to continue.'
    );
  }
  if (input.option) {
    const overlap = scheduleReadyOverlapIssue({ ...input.schedule, status: 'ready' }, input.option);
    if (overlap) return overlap;
  }
  return 'Finish the remaining schedule details before saving.';
}

export function tourScheduleLockedReason(input: {
  targetIndex: number;
  schedule: ListingOptionSchedule;
  option?: ListingBookingOption;
}): string {
  if (input.targetIndex <= 0) return '';
  const firstIncomplete = Array.from({ length: input.targetIndex }, (_, i) => i).find(
    (i) => !isTourScheduleSceneSatisfied(i, input.schedule, input.option)
  );
  if (firstIncomplete == null) return '';
  return (
    tourScheduleSceneContinueHint({
      sceneIndex: firstIncomplete,
      schedule: input.schedule,
      option: input.option,
      canContinue: false,
    }) ?? 'Complete the previous step first.'
  );
}

export function tourScheduleContextNavItems(
  currentIndex: number,
  options?: {
    isNewSchedule?: boolean;
    schedule?: ListingOptionSchedule;
    option?: ListingBookingOption;
  }
): ListingCreationNavItem[] {
  const current = clampTourScheduleSceneIndex(currentIndex);
  const isNewSchedule = options?.isNewSchedule === true;
  const schedule = options?.schedule;
  const option = options?.option;
  return TOUR_SCHEDULE_SCENES.map((scene, index) => ({
    id: scene.id,
    label: scene.label,
    state: listingCreationAccessState({
      index,
      currentIndex: current,
      isNewCreation: isNewSchedule,
      isSatisfied: (idx) =>
        schedule ? isTourScheduleSceneSatisfied(idx, schedule, option) : idx < current,
    }),
  }));
}

export function firstScheduleIssueFocusId(
  schedule: ListingOptionSchedule,
  opts?: { startMode?: ListingBookingOption['startMode']; option?: ListingBookingOption }
): string | null {
  if (schedulePeriodIssues(schedule, opts).length > 0) return 'supplier-schedule-field-from';
  if (schedulePriceCapacityIssues(schedule, opts?.option).length > 0) {
    return 'supplier-schedule-field-price';
  }
  return null;
}

export function scheduleCanSaveReady(
  schedule: ListingOptionSchedule,
  option: ListingBookingOption
): { ok: true } | { ok: false; error: string } {
  const mode = { startMode: option.startMode };
  const chargeConflict = scheduleChargeModelConflict(schedule, option);
  if (chargeConflict) return { ok: false, error: chargeConflict };
  const priceCapacity = schedulePriceCapacityIssues(schedule, option);
  if (!scheduleWizardIsComplete(schedule, mode) || priceCapacity.length > 0) {
    return {
      ok: false,
      error:
        schedulePeriodIssues(schedule, mode)[0] ??
        priceCapacity[0] ??
        'Finish this schedule before saving.',
    };
  }
  const overlap = findScheduleOverlap({ ...schedule, status: 'ready' }, option.schedules ?? [], {
    startMode: option.startMode,
  });
  if (overlap) return { ok: false, error: scheduleOverlapMessage(overlap) };
  return { ok: true };
}

export function optionScheduleManagementIssues(
  option: ListingBookingOption,
  todayIso?: string
): string[] {
  if (option.schedules !== undefined) {
    // Phase 1290/1294: only scheduleIsBookable ready seasons count (quote/catalog parity).
    const mode = { startMode: option.startMode };
    const ready = (option.schedules ?? []).filter((s) => scheduleIsBookable(s, mode));
    if (ready.length === 0) {
      return ['Add at least one complete schedule before finishing this option.'];
    }
    // Phase 1258: reject seasons that already ended (flat-option publish parity).
    if (todayIso) {
      const live = ready.filter((s) => {
        const to = (s.availabilityDateTo ?? '').trim();
        return !to || to >= todayIso;
      });
      if (live.length === 0) {
        return [
          'Every schedule season has already ended. Extend an end date or travelers cannot pick a date.',
        ];
      }
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
  }, { startMode: option.startMode })) {
    return [];
  }
  return ['Add at least one complete schedule before finishing this option.'];
}

export { scheduleHeadlineName };
