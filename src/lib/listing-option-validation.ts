/**
 * Bookable-option validation truth for the supplier wizard.
 * Publish still uses listingPublishGate; this module must not invent extra requirements.
 */

import type { ListingBookingOption } from '../types/listingExtras';
import { getListingBookingOptionDurationIssue, TOUR_OPTION_INFO_MAX } from '../types/listingExtras';
import { LISTING_CAPACITY_MAX } from './listing-option-schedules';
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
  if (option.startMode !== 'fixed' && option.startMode !== 'flexible') {
    msg.push('Choose fixed start time or flexible operating hours.');
  }
  return msg;
}

export function bookingOptionChargeModelIssues(option: ListingBookingOption): string[] {
  if (option.chargeModel !== 'per_person' && option.chargeModel !== 'flat_group') {
    return ['Choose how you charge: per person or per group.'];
  }
  return [];
}

/**
 * Pricing scene: charge model always; option slot capacity for schedule-based options;
 * flat amount + full capacity for legacy non-schedule options.
 */
export function bookingOptionPricingSceneIssues(option: ListingBookingOption): string[] {
  const msg = [...bookingOptionChargeModelIssues(option)];
  if (Array.isArray(option.schedules)) {
    if (option.maxSpotsPerSlot < 1) {
      msg.push('Set how many travelers this option can take per start time.');
    } else if (option.maxSpotsPerSlot > LISTING_CAPACITY_MAX) {
      msg.push(`Capacity cannot exceed ${LISTING_CAPACITY_MAX} travelers.`);
    }
    return msg;
  }
  return [...msg, ...bookingOptionPricingIssues(option), ...bookingOptionCapacityIssues(option)];
}

/** Schedules need charge model + slot capacity (Pricing) + start mode (Setup) first. */
export function bookingOptionSchedulePrereqIssues(option: ListingBookingOption): string[] {
  const msg: string[] = [];
  if (option.chargeModel !== 'per_person' && option.chargeModel !== 'flat_group') {
    msg.push('Choose pricing (per person or per group) in Pricing before adding a schedule.');
  }
  if (option.maxSpotsPerSlot < 1) {
    msg.push('Set travelers per start time in Pricing before adding a schedule.');
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
  if (fulfillment === 'pickup') {
    const hasCenter =
      Boolean(option.pickupPlaceId) && option.pickupCenterLat != null && option.pickupCenterLng != null;
    if (hasCenter && (option.pickupRadiusKm == null || option.pickupRadiusKm < 1)) {
      return ['Set the pickup radius.'];
    }
    if (!hasCenter && place.length < 8) {
      return ['Choose a pickup center and set the radius.'];
    }
    if (
      option.pickupTiming === 'before_start' &&
      (option.pickupWindowMinutes == null || option.pickupWindowMinutes < 5)
    ) {
      return ['Choose how long before departure the pickup window opens.'];
    }
  } else if (place.length < 8) {
    if (fulfillment === 'meeting_point') {
      return ['Choose the meeting point from search.'];
    }
    return ['Choose where guests meet or where you pick them up.'];
  }
  if (option.dropoffMode === 'different' && (option.dropoffPlace ?? '').trim().length < 8) {
    return ['Choose the drop-off location from search.'];
  }
  if (option.transportIncluded && !option.transportMode) {
    return ['Choose the vehicle used for transportation.'];
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

/** Availability scene: schedules (preferred) or legacy weekday/date/time fields. */
export function bookingOptionAvailabilitySceneIssues(
  option: ListingBookingOption,
  ending?: OptionEndingDateState
): string[] {
  if (Array.isArray(option.schedules)) {
    return optionScheduleManagementIssues(option);
  }
  return bookingOptionAvailabilityIssues(option, ending);
}

/** @deprecated Prefer bookingOptionAvailabilitySceneIssues + bookingOptionPricingSceneIssues. */
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
  if (
    option.maxSpotsPerSlot > LISTING_CAPACITY_MAX ||
    option.maxPersons > LISTING_CAPACITY_MAX ||
    option.minPersons > LISTING_CAPACITY_MAX
  ) {
    msg.push(`Capacity cannot exceed ${LISTING_CAPACITY_MAX} travelers.`);
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
      ...bookingOptionPricingSceneIssues(option),
      ...bookingOptionAvailabilitySceneIssues(option, ending),
    ];
  }
  return [
    ...bookingOptionSetupIssues(option),
    ...bookingOptionMeetingIssues(option),
    ...bookingOptionPricingSceneIssues(option),
    ...bookingOptionAvailabilitySceneIssues(option, ending),
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
  if (bookingOptionPricingSceneIssues(option).length > 0) {
    return 'supplier-listing-field-option-charge-model';
  }
  if (Array.isArray(option.schedules)) {
    if (bookingOptionAvailabilitySceneIssues(option, ending).length > 0) {
      return 'supplier-listing-field-option-schedules';
    }
    return null;
  }
  if (bookingOptionAvailabilityIssues(option, ending).length > 0) {
    return 'supplier-listing-field-option-availability';
  }
  return null;
}
