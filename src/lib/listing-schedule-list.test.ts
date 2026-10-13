import { describe, expect, it } from 'vitest';
import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';
import { normalizeListingBookingOption, normalizeListingOptionSchedule } from '../types/listingExtras';
import {
  canAddOptionSchedule,
  formatScheduleListCapacity,
  formatScheduleListDates,
  formatScheduleListDeparture,
  formatScheduleListPrice,
  LISTING_OPTION_SCHEDULES_MAX,
  scheduleListRowModel,
  scheduleListStatus,
} from './listing-schedule-list';
import { blankOptionSchedule, LISTING_OPTION_SCHEDULES_MAX as MaxFromSchedules } from './listing-option-schedules';

function option(partial: Partial<ListingBookingOption> = {}): ListingBookingOption {
  return normalizeListingBookingOption(
    {
      id: 'opt-1',
      name: 'Small Group Tour',
      priceUsd: 0,
      startTime: '',
      duration: '3 hours',
      pickupPlace: 'City center meeting point',
      minPersons: 1,
      maxPersons: 0,
      maxSpotsPerSlot: 16,
      optionInfo: 'Guided tour',
      weekdays: [true, true, true, true, true, true, true],
      availabilityDateFrom: '',
      availabilityDateTo: '',
      pricingMode: 'uniform',
      chargeModel: 'per_person',
      startMode: 'fixed',
      schedules: [],
      ...partial,
    },
    'opt-1'
  );
}

function schedule(partial: Partial<ListingOptionSchedule> = {}): ListingOptionSchedule {
  return normalizeListingOptionSchedule(
    {
      ...blankOptionSchedule('sch-1'),
      ...partial,
    },
    'sch-1'
  );
}

describe('schedule list display', () => {
  it('exports the same soft max as listing-option-schedules', () => {
    expect(LISTING_OPTION_SCHEDULES_MAX).toBe(5);
    expect(MaxFromSchedules).toBe(5);
  });

  it('shows Not set instead of Ongoing / zero seats / 1–0 groups', () => {
    const blank = schedule({
      name: '',
      availabilityDateFrom: '',
      availabilityDateTo: '',
      weekdays: [false, false, false, false, false, false, false],
      startTime: '',
      minPersons: 1,
      maxPersons: 0,
      maxSpotsPerSlot: 0,
      priceUsd: 0,
      status: 'draft',
    });
    const opt = option({ chargeModel: 'flat_group', isPrivate: true, privatePricing: 'flat_group' });
    const row = scheduleListRowModel(blank, opt, 0, (n) => `€${n}`);
    expect(row.dates).toBe('Not set');
    expect(row.days).toBe('Not set');
    expect(row.departure).toBe('Not set');
    expect(row.price).toBe('Not set');
    expect(row.capacity).toBe('Not set');
    expect(row.capacity).not.toMatch(/0 seats|1–0/);
    expect(row.statusLabel).toBe('Draft');
  });

  it('labels ready vs incomplete vs draft correctly', () => {
    const ready = schedule({
      name: 'Winter',
      availabilityDateFrom: '2099-01-01',
      weekdays: [true, true, true, true, true, true, true],
      startTime: '10:00',
      priceUsd: 120,
      minPersons: 1,
      maxPersons: 8,
      maxSpotsPerSlot: 16,
      status: 'ready',
    });
    expect(scheduleListStatus(ready, 'fixed')).toBe('ready');

    const incomplete = schedule({
      ...ready,
      status: undefined,
      priceUsd: 0,
      maxPersons: 0,
    });
    expect(scheduleListStatus(incomplete, 'fixed')).toBe('incomplete');

    const draft = schedule({ ...ready, status: 'draft' });
    expect(scheduleListStatus(draft, 'fixed')).toBe('draft');
  });

  it('respects option charge model for price labels', () => {
    const sch = schedule({
      priceUsd: 200,
      privateGroupPriceUsd: 748,
      isPrivate: true,
      privatePricing: 'flat_group',
    });
    const groupOpt = option({
      chargeModel: 'flat_group',
      isPrivate: true,
      privatePricing: 'flat_group',
    });
    expect(formatScheduleListPrice(sch, groupOpt, (n) => `€${n}`)).toEqual({
      model: 'Whole group',
      price: '€748',
    });

    const personOpt = option({ chargeModel: 'per_person' });
    expect(formatScheduleListPrice(sch, personOpt, (n) => `€${n}`).model).toBe('Per person');
  });

  it('formats capacity without fabricating empty group ranges', () => {
    expect(
      formatScheduleListCapacity(
        schedule({ minPersons: 1, maxPersons: 8, maxSpotsPerSlot: 16, maxGroupsPerSlot: 2 }),
        option({ chargeModel: 'flat_group', isPrivate: true, privatePricing: 'flat_group' })
      )
    ).toBe('16 seats · 1–8 per group · 2 groups');

    expect(
      formatScheduleListCapacity(
        schedule({ minPersons: 1, maxPersons: 0, maxSpotsPerSlot: 0 }),
        option({ chargeModel: 'per_person' })
      )
    ).toBe('Not set');
  });

  it('formats dates and departures for filled schedules', () => {
    expect(formatScheduleListDates('2026-12-01', '2026-12-31')).toMatch(/Dec/);
    expect(
      formatScheduleListDeparture(
        schedule({
          weekdays: [true, false, false, false, false, false, false],
          startTime: '09:30',
        }),
        'fixed'
      )
    ).toBe('09:30');
  });

  it('blocks adding beyond the soft max', () => {
    const schedules = Array.from({ length: LISTING_OPTION_SCHEDULES_MAX }, (_, i) =>
      schedule({ id: `sch-${i}`, name: `S${i}` })
    );
    expect(canAddOptionSchedule(option({ schedules })).ok).toBe(false);
    expect(canAddOptionSchedule(option({ schedules: schedules.slice(0, 4) })).ok).toBe(true);
  });
});
