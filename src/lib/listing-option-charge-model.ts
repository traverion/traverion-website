/**
 * One option = one charge model. Schedules inherit that model and must not mix
 * per-person and per-group pricing under the same option.
 */
import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';

export function optionChargeModel(
  option: Pick<ListingBookingOption, 'chargeModel' | 'privatePricing' | 'isPrivate'>
): 'per_person' | 'flat_group' | null {
  if (option.chargeModel === 'per_person' || option.chargeModel === 'flat_group') {
    return option.chargeModel;
  }
  if (option.isPrivate && option.privatePricing === 'flat_group') return 'flat_group';
  if (option.isPrivate && option.privatePricing === 'per_person') return 'per_person';
  return null;
}

/** Strip or align schedule pricing fields so they cannot contradict the option charge model. */
export function normalizeScheduleToOptionChargeModel(
  schedule: ListingOptionSchedule,
  option: ListingBookingOption
): ListingOptionSchedule {
  const model = optionChargeModel(option);
  if (model === 'flat_group') {
    return {
      ...schedule,
      pricingMode: 'uniform',
      priceCategories: undefined,
      isPrivate: true,
      privatePricing: 'flat_group',
      privateGroupPriceUsd:
        schedule.privateGroupPriceUsd && schedule.privateGroupPriceUsd > 0
          ? schedule.privateGroupPriceUsd
          : schedule.priceUsd > 0
            ? schedule.priceUsd
            : 0,
      priceUsd:
        schedule.privateGroupPriceUsd && schedule.privateGroupPriceUsd > 0
          ? schedule.privateGroupPriceUsd
          : schedule.priceUsd,
    };
  }
  if (model === 'per_person') {
    return {
      ...schedule,
      isPrivate: false,
      privatePricing: undefined,
      privateGroupPriceUsd: undefined,
    };
  }
  return schedule;
}

export function scheduleChargeModelConflict(
  schedule: ListingOptionSchedule,
  option: ListingBookingOption
): string | null {
  const model = optionChargeModel(option);
  if (!model) return 'Choose per person or per group pricing in Setup before saving schedules.';
  if (model === 'per_person' && schedule.privatePricing === 'flat_group') {
    return 'This option is priced per person. Create a separate option for per-group pricing.';
  }
  if (model === 'flat_group' && schedule.pricingMode === 'age_dependent') {
    return 'This option is priced per group. Age categories belong on a per-person option.';
  }
  return null;
}
