/**
 * Display helpers for the Availability schedule list in the option editor.
 * Keeps rows truthful: missing values render as "Not set", never fabricated zeros.
 */

import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';
import { optionChargeModel } from './listing-option-charge-model';
import {
  formatScheduleDay,
  formatScheduleDepartureSummary,
  formatScheduleWeekdays,
  listingLocalDateKey,
  LISTING_OPTION_SCHEDULES_MAX,
  scheduleHeadlineName,
  scheduleIsBookable,
  scheduleWizardIsComplete,
} from './listing-option-schedules';
import { activePriceCategories, optionPricingMode } from './price-categories';
import {
  schedulePeriodIssues,
  schedulePriceCapacityIssues,
} from './listing-schedule-wizard';

export { LISTING_OPTION_SCHEDULES_MAX };

export type ScheduleListStatus = 'ready' | 'incomplete' | 'draft';

export function scheduleListStatus(
  schedule: ListingOptionSchedule,
  startMode?: ListingBookingOption['startMode']
): ScheduleListStatus {
  if (schedule.status === 'draft') return 'draft';
  const mode = { startMode };
  if (scheduleWizardIsComplete(schedule, mode) && scheduleIsBookable(schedule, mode)) {
    return 'ready';
  }
  return 'incomplete';
}

export function scheduleListStatusLabel(status: ScheduleListStatus): string {
  if (status === 'ready') return 'Ready';
  if (status === 'draft') return 'Draft';
  return 'Incomplete';
}

/** Date range for list rows — empty seasons are Not set (not “Ongoing”). */
export function formatScheduleListDates(from: string, to: string): string {
  const a = listingLocalDateKey(from);
  const b = listingLocalDateKey(to);
  if (!a && !b) return 'Not set';
  if (a && b) return `${formatScheduleDay(a)} – ${formatScheduleDay(b)}`;
  if (a) return `From ${formatScheduleDay(a)}`;
  return `Until ${formatScheduleDay(b)}`;
}

export function formatScheduleListDays(weekdays: boolean[]): string {
  if (!Array.isArray(weekdays) || weekdays.length < 7) return 'Not set';
  if (!weekdays.some(Boolean)) return 'Not set';
  return formatScheduleWeekdays(weekdays);
}

export function formatScheduleListDeparture(
  schedule: ListingOptionSchedule,
  startMode?: ListingBookingOption['startMode']
): string {
  if (startMode === 'flexible') {
    return schedule.weekdays.some(Boolean) ? 'Flexible hours' : 'Not set';
  }
  const summary = formatScheduleDepartureSummary(schedule, startMode);
  return summary.trim() ? summary : 'Not set';
}

export function formatScheduleListPrice(
  schedule: ListingOptionSchedule,
  option: ListingBookingOption,
  formatAmount: (n: number) => string
): { model: string; price: string } {
  const charge = optionChargeModel(option);
  if (charge === 'flat_group') {
    const flat = schedule.privateGroupPriceUsd ?? schedule.priceUsd;
    return {
      model: 'Whole group',
      price: typeof flat === 'number' && flat > 0 ? formatAmount(flat) : 'Not set',
    };
  }
  if (charge === 'per_person') {
    if (optionPricingMode(schedule) === 'age_dependent') {
      const cats = activePriceCategories(schedule).filter((c) => c.priceUsd > 0);
      if (cats.length === 0) {
        return { model: 'Per person', price: 'Not set' };
      }
      return {
        model: 'Per person',
        price: cats.map((c) => `${c.label.trim()} ${formatAmount(c.priceUsd)}`).join(' · '),
      };
    }
    return {
      model: 'Per person',
      price: schedule.priceUsd > 0 ? formatAmount(schedule.priceUsd) : 'Not set',
    };
  }
  return { model: 'Not set', price: 'Not set' };
}

export function formatScheduleListCapacity(
  schedule: ListingOptionSchedule,
  option: ListingBookingOption
): string {
  const charge = optionChargeModel(option);
  const seats = schedule.maxSpotsPerSlot >= 1 ? schedule.maxSpotsPerSlot : null;
  const minOk = schedule.minPersons >= 1;
  const maxOk = schedule.maxPersons >= 1 && schedule.maxPersons >= schedule.minPersons;

  if (charge === 'flat_group') {
    const parts: string[] = [];
    if (seats != null) parts.push(`${seats} seats`);
    if (minOk && maxOk) {
      parts.push(`${schedule.minPersons}–${schedule.maxPersons} per group`);
      if (typeof schedule.maxGroupsPerSlot === 'number' && schedule.maxGroupsPerSlot >= 1) {
        parts.push(
          `${schedule.maxGroupsPerSlot} group${schedule.maxGroupsPerSlot === 1 ? '' : 's'}`
        );
      }
    }
    return parts.length > 0 ? parts.join(' · ') : 'Not set';
  }

  const parts: string[] = [];
  if (minOk && maxOk) parts.push(`${schedule.minPersons}–${schedule.maxPersons} per booking`);
  if (seats != null) parts.push(`${seats} seats`);
  return parts.length > 0 ? parts.join(' · ') : 'Not set';
}

export function scheduleListNextIssue(
  schedule: ListingOptionSchedule,
  option: ListingBookingOption
): string | null {
  const status = scheduleListStatus(schedule, option.startMode);
  if (status === 'ready') return null;
  return (
    schedulePeriodIssues(schedule, { startMode: option.startMode })[0] ??
    schedulePriceCapacityIssues(schedule, option)[0] ??
    (status === 'draft' ? 'Saved as draft — finish to make bookable.' : 'Finish required fields.')
  );
}

export function scheduleListRowModel(
  schedule: ListingOptionSchedule,
  option: ListingBookingOption,
  index: number,
  formatAmount: (n: number) => string
) {
  const status = scheduleListStatus(schedule, option.startMode);
  const pricing = formatScheduleListPrice(schedule, option, formatAmount);
  return {
    id: schedule.id,
    name: scheduleHeadlineName(schedule, index),
    status,
    statusLabel: scheduleListStatusLabel(status),
    dates: formatScheduleListDates(schedule.availabilityDateFrom, schedule.availabilityDateTo),
    days: formatScheduleListDays(schedule.weekdays),
    departure: formatScheduleListDeparture(schedule, option.startMode),
    pricingModel: pricing.model,
    price: pricing.price,
    capacity: formatScheduleListCapacity(schedule, option),
    nextIssue: scheduleListNextIssue(schedule, option),
  };
}

export function canAddOptionSchedule(option: ListingBookingOption): {
  ok: boolean;
  reason: string | null;
} {
  const count = Array.isArray(option.schedules) ? option.schedules.length : 0;
  if (count >= LISTING_OPTION_SCHEDULES_MAX) {
    return {
      ok: false,
      reason: `You can add up to ${LISTING_OPTION_SCHEDULES_MAX} schedules per option.`,
    };
  }
  return { ok: true, reason: null };
}
