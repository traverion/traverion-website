import { describe, expect, it } from 'vitest';
import type { TourPackage } from '../../types/tour';
import type { ListingBookingOption, ListingOptionSchedule } from '../../types/listingExtras';
import { normalizeListingBookingOption } from '../../types/listingExtras';
import { defaultAgeDependentCategories } from '../../lib/price-categories';
import {
  bookingCutoffSelectLabel,
  cutoffHourSelectOptions,
  parseBulkAction,
  resolveOptionCapacitiesAcrossDates,
  resolveOptionCutoffsAcrossDates,
} from './calendarAvailabilityUi';

const daily = [true, true, true, true, true, true, true];

function season(
  partial: Partial<ListingOptionSchedule> & Pick<ListingOptionSchedule, 'id' | 'maxSpotsPerSlot' | 'startTime'>
): ListingOptionSchedule {
  return {
    name: 'Season',
    availabilityDateFrom: '2026-10-01',
    availabilityDateTo: '2026-10-31',
    weekdays: daily,
    pricingMode: 'age_dependent',
    priceUsd: 119,
    priceCategories: defaultAgeDependentCategories(119, 89),
    minPersons: 1,
    maxPersons: partial.maxSpotsPerSlot,
    status: 'ready',
    ...partial,
  };
}

function option(partial: Partial<ListingBookingOption> & { id: string; name: string }): ListingBookingOption {
  return normalizeListingBookingOption(
    {
      priceUsd: 100,
      startTime: '',
      duration: '3 hours',
      pickupPlace: 'Meet',
      minPersons: 1,
      maxPersons: 16,
      maxSpotsPerSlot: 16,
      optionInfo: '',
      weekdays: daily,
      pricingMode: 'uniform',
      chargeModel: 'per_person',
      startMode: 'fixed',
      ...partial,
    },
    partial.id
  );
}

function listingFixture(): TourPackage {
  return {
    id: 'listing-1',
    title: 'Northern Lights Guarantee',
    listingExtras: {
      bookingCutoffHoursBeforeStart: 2,
      bookingOptions: [
        option({
          id: 'opt-small',
          name: 'Small Group',
          maxSpotsPerSlot: 16,
          maxPersons: 16,
          schedules: [
            season({
              id: 'sch-small',
              name: 'Small',
              startTime: '18:30',
              maxSpotsPerSlot: 16,
              maxPersons: 16,
            }),
          ],
        }),
        option({
          id: 'opt-standard',
          name: 'Standard Group',
          maxSpotsPerSlot: 50,
          maxPersons: 50,
          bookingCutoffHoursBeforeStart: 5,
          schedules: [
            season({
              id: 'sch-std',
              name: 'Bus',
              startTime: '20:00',
              maxSpotsPerSlot: 50,
              maxPersons: 50,
            }),
          ],
        }),
      ],
      slotOverrides: [
        {
          date: '2026-10-18',
          startTimeHm: '18:30',
          capacity: 25,
        },
      ],
    },
  } as TourPackage;
}

describe('bulk option capacity / cutoff resolution', () => {
  it('resolves Small Group 16 and Standard Group 50 independently', () => {
    const listing = listingFixture();
    const dates = ['2026-10-15', '2026-10-16'];
    const small = resolveOptionCapacitiesAcrossDates({
      listing,
      optionId: 'opt-small',
      dates,
    });
    const standard = resolveOptionCapacitiesAcrossDates({
      listing,
      optionId: 'opt-standard',
      dates,
    });
    expect(small.departureCount).toBeGreaterThan(0);
    expect(small.displayValue).toBe(16);
    expect(small.mixed).toBe(false);
    expect(standard.displayValue).toBe(50);
    expect(standard.mixed).toBe(false);
  });

  it('reports mixed capacity when a date override differs', () => {
    const listing = listingFixture();
    const mixed = resolveOptionCapacitiesAcrossDates({
      listing,
      optionId: 'opt-small',
      dates: ['2026-10-15', '2026-10-18'],
    });
    expect(mixed.mixed).toBe(true);
    expect(mixed.displayValue).toBeNull();
    expect(mixed.capacities).toContain(16);
    expect(mixed.capacities).toContain(25);
  });

  it('resolves option cutoffs from option then listing defaults', () => {
    const listing = listingFixture();
    const small = resolveOptionCutoffsAcrossDates({
      listing,
      optionId: 'opt-small',
      dates: ['2026-10-15'],
    });
    const standard = resolveOptionCutoffsAcrossDates({
      listing,
      optionId: 'opt-standard',
      dates: ['2026-10-15'],
    });
    expect(small.displayValue).toBe(2);
    expect(standard.displayValue).toBe(5);
  });

  it('builds consecutive cutoff hour options without presets', () => {
    const opts = cutoffHourSelectOptions(5);
    expect(opts.map((o) => o.value)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(bookingCutoffSelectLabel(0)).toBe('Until departure');
    expect(bookingCutoffSelectLabel(1)).toBe('1 hour before departure');
    expect(bookingCutoffSelectLabel(5)).toBe('5 hours before departure');
    expect(parseBulkAction('reset_overrides')).toBe('close');
    expect(parseBulkAction('change_capacity')).toBe('change_capacity');
  });
});
