/**
 * Bookable-option validation truth for the supplier wizard.
 * Publish still uses listingPublishGate; this module must not invent extra requirements.
 */

import type { ListingBookingOption } from '../types/listingExtras';
import { getListingBookingOptionDurationIssue, TOUR_OPTION_INFO_MAX } from '../types/listingExtras';
import { priceCategoryValidationMessages } from './price-categories';
import { optionScheduleManagementIssues } from './listing-schedule-wizard';

export type OptionEndingDateState = {
  hasEndingDate: boolean;
};

export function bookingOptionSetupIssues(option: ListingBookingOption): string[] {
  const msg: string[] = [];
  if (!option.name.trim()) {
    msg.push('Add an option name to continue.');
  }
  const durIssue = getListingBookingOptionDurationIssue(option.duration);
  if (durIssue) msg.push(durIssue);
  if (option.optionInfo.trim().length < 3) {
    msg.push(
      `Add why travelers should choose this option (shown on the tour page) — at least 3 characters, max ${TOUR_OPTION_INFO_MAX}.`
    );
  } else if (option.optionInfo.length > TOUR_OPTION_INFO_MAX) {
    msg.push(`Keep “Why choose this option” to ${TOUR_OPTION_INFO_MAX} characters or fewer.`);
  }
  if (option.chargeModel !== 'per_person' && option.chargeModel !== 'flat_group') {
    msg.push('Choose how you charge: per person or per group.');
  }
  if (option.startMode !== 'fixed' && option.startMode !== 'flexible') {
    msg.push('Choose fixed start time or flexible operating hours.');
  }
  return msg;
}

/** Schedules need charge model + start mode from option setup first. */
export function bookingOptionSchedulePrereqIssues(option: ListingBookingOption): string[] {
  const msg: string[] = [];
  if (option.chargeModel !== 'per_person' && option.chargeModel !== 'flat_group') {
    msg.push('Choose pricing (per person or per group) in Setup before adding a schedule.');
  }
  if (option.startMode !== 'fixed' && option.startMode !== 'flexible') {
    msg.push('Choose fixed start time or flexible hours in Setup before adding a schedule.');
  }
  return msg;
}

export function bookingOptionMeetingIssues(option: ListingBookingOption): string[] {
  const fulfillment = option.fulfillment;
  const place = option.pickupPlace.trim();
  if (!fulfillment && place.length < 8) {
    return ['Choose how travelers meet you.'];
  }
  if (place.length < 8) {
    if (fulfillment === 'pickup') {
      return ['Describe the pickup area (at least 8 characters).'];
    }
    if (fulfillment === 'meeting_point') {
      return ['Describe the meeting point (at least 8 characters).'];
    }
    return ['Describe where guests meet or where you pick them up (at least 8 characters).'];
  }
  const startInstructions = (option.travelerStartInstructions ?? '').trim();
  if (startInstructions.length < 8) {
    if (fulfillment === 'pickup') {
      return ['Add pickup start instructions (e.g. wait outside, how to spot the vehicle).'];
    }
    if (fulfillment === 'meeting_point') {
      return ['Add meeting start instructions (e.g. arrive 15 minutes early, where to stand).'];
    }
    return ['Add traveler start instructions for this option (at least 8 characters).'];
  }
  return [];
}

export function bookingOptionAvailabilityPricingIssues(
  option: ListingBookingOption,
  ending?: OptionEndingDateState
): string[] {
  if (Array.isArray(option.schedules)) {
    return optionScheduleManagementIssues(option);
  }
  return [
    ...bookingOptionAvailabilityIssues(option, ending),
    ...bookingOptionPricingIssues(option),
    ...bookingOptionCapacityIssues(option),
  ];
}

export function bookingOptionAvailabilityIssues(
  option: ListingBookingOption,
  ending?: OptionEndingDateState
): string[] {
  const msg: string[] = [];
  if (!option.weekdays.some(Boolean)) {
    msg.push('Choose at least one weekday when this option runs.');
  }
  if (option.startMode !== 'flexible' && !option.startTime.trim()) {
    msg.push('Add a start time so travelers know when this option begins.');
  }
  const df = option.availabilityDateFrom.trim();
  const dt = option.availabilityDateTo.trim();
  if (ending?.hasEndingDate && !dt) {
    msg.push('Choose an ending date, or turn off the ending date.');
  }
  if (dt) {
    if (!df) {
      msg.push('Add a starting date when you set an ending date, or clear the ending date.');
    } else if (df > dt) {
      msg.push('Ending date must be on or after the starting date.');
    }
  }
  return msg;
}

export function bookingOptionPricingIssues(option: ListingBookingOption): string[] {
  return priceCategoryValidationMessages(option);
}

export function bookingOptionCapacityIssues(option: ListingBookingOption): string[] {
  const msg: string[] = [];
  if (option.minPersons < 1 || option.maxPersons < option.minPersons) {
    msg.push('Set minimum and maximum guests so max is not below min.');
  }
  if (option.maxSpotsPerSlot < 1) {
    msg.push('Set max spots per departure or start time.');
  }
  if (option.isPrivate && option.privatePricing === 'flat_group' && option.maxPersons < 1) {
    msg.push('Set how many travelers the group price covers.');
  }
  return msg;
}

export function getBookingOptionValidationMessages(
  option: ListingBookingOption,
  ending?: OptionEndingDateState
): string[] {
  if (Array.isArray(option.schedules)) {
    return [
      ...bookingOptionSetupIssues(option),
      ...bookingOptionMeetingIssues(option),
      ...bookingOptionAvailabilityPricingIssues(option, ending),
    ];
  }
  return [
    ...bookingOptionSetupIssues(option),
    ...bookingOptionMeetingIssues(option),
    ...bookingOptionPricingIssues(option),
    ...bookingOptionCapacityIssues(option),
    ...bookingOptionAvailabilityIssues(option, ending),
  ];
}

export function firstBookingOptionIssueFocusId(
  option: ListingBookingOption,
  ending?: OptionEndingDateState
): string | null {
  if (bookingOptionSetupIssues(option).some((line) => /name/i.test(line))) {
    return 'supplier-listing-field-option-name';
  }
  if (getListingBookingOptionDurationIssue(option.duration)) {
    return 'supplier-listing-field-option-duration';
  }
  if (bookingOptionSetupIssues(option).length > 0) return 'supplier-listing-field-pickup';
  if (bookingOptionMeetingIssues(option).length > 0) return 'supplier-listing-field-meeting';
  if (Array.isArray(option.schedules)) {
    if (bookingOptionAvailabilityPricingIssues(option, ending).length > 0) {
      return 'supplier-listing-field-option-schedules';
    }
    return null;
  }
  if (bookingOptionPricingIssues(option).length > 0) return 'supplier-listing-field-price';
  if (bookingOptionCapacityIssues(option).length > 0) return 'supplier-listing-field-group';
  if (bookingOptionAvailabilityIssues(option, ending).length > 0) {
    return 'supplier-listing-field-option-availability';
  }
  return null;
}
