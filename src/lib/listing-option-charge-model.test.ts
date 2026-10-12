import { describe, expect, it } from 'vitest';
import {
  normalizeScheduleToOptionChargeModel,
  optionChargeModel,
  scheduleChargeModelConflict,
} from './listing-option-charge-model';
import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';

function option(partial: Partial<ListingBookingOption> = {}): ListingBookingOption {
  return {
    id: 'opt-1',
    name: 'Northern Lights',
    duration: '3 hours',
    priceUsd: 149,
    maxPersons: 8,
    maxSpotsPerSlot: 16,
    minPersons: 1,
    startTime: '20:00',
    weekdays: [true, true, true, true, true, true, true],
    pickupPlace: 'Town square',
    optionInfo: 'Small group',
    travelerStartInstructions: '',
    ...partial,
  };
}

function schedule(partial: Partial<ListingOptionSchedule> = {}): ListingOptionSchedule {
  return {
    id: 'sch-1',
    name: 'Winter Season',
    status: 'ready',
    availabilityDateFrom: '2026-11-01',
    availabilityDateTo: '2027-03-31',
    weekdays: [true, true, true, true, true, true, true],
    startTime: '20:00',
    priceUsd: 149,
    pricingMode: 'uniform',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 16,
    ...partial,
  };
}

describe('optionChargeModel', () => {
  it('reads explicit chargeModel', () => {
    expect(optionChargeModel(option({ chargeModel: 'per_person' }))).toBe('per_person');
    expect(optionChargeModel(option({ chargeModel: 'flat_group' }))).toBe('flat_group');
  });

  it('falls back to legacy privatePricing', () => {
    expect(
      optionChargeModel(option({ isPrivate: true, privatePricing: 'flat_group', chargeModel: undefined }))
    ).toBe('flat_group');
  });
});

describe('normalizeScheduleToOptionChargeModel', () => {
  it('strips group fields on a per-person option', () => {
    const next = normalizeScheduleToOptionChargeModel(
      schedule({
        isPrivate: true,
        privatePricing: 'flat_group',
        privateGroupPriceUsd: 499,
      }),
      option({ chargeModel: 'per_person' })
    );
    expect(next.isPrivate).toBe(false);
    expect(next.privatePricing).toBeUndefined();
    expect(next.privateGroupPriceUsd).toBeUndefined();
  });

  it('forces flat group pricing fields on a per-group option', () => {
    const next = normalizeScheduleToOptionChargeModel(
      schedule({ priceUsd: 499, pricingMode: 'age_dependent' }),
      option({ chargeModel: 'flat_group' })
    );
    expect(next.pricingMode).toBe('uniform');
    expect(next.privatePricing).toBe('flat_group');
    expect(next.isPrivate).toBe(true);
    expect(next.privateGroupPriceUsd).toBe(499);
  });
});

describe('scheduleChargeModelConflict', () => {
  it('blocks flat-group schedules under per-person options', () => {
    expect(
      scheduleChargeModelConflict(
        schedule({ privatePricing: 'flat_group' }),
        option({ chargeModel: 'per_person' })
      )
    ).toMatch(/per person/i);
  });

  it('blocks age categories under per-group options', () => {
    expect(
      scheduleChargeModelConflict(
        schedule({ pricingMode: 'age_dependent' }),
        option({ chargeModel: 'flat_group' })
      )
    ).toMatch(/per group/i);
  });

  it('requires a charge model before saving', () => {
    expect(scheduleChargeModelConflict(schedule(), option({ chargeModel: undefined }))).toMatch(
      /per person or per group/i
    );
  });
});
