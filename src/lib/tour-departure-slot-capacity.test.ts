import { describe, expect, it } from 'vitest';
import { tourDepartureSlotCapacity } from '../../supabase/functions/_shared/booking-quote.ts';

const weekdaysAll = [true, true, true, true, true, true, true];

describe('tourDepartureSlotCapacity', () => {
  it('uses the resolved schedule max spots for the selected departure', () => {
    const extras = {
      bookingOptions: [
        {
          id: 'opt-1',
          name: 'Standard',
          priceUsd: 100,
          minPersons: 1,
          maxPersons: 12,
          weekdays: weekdaysAll,
          availabilityDateFrom: '2026-09-01',
          availabilityDateTo: '2026-10-31',
          schedules: [
            {
              id: 'sch-sep',
              name: 'September',
              availabilityDateFrom: '2026-09-01',
              availabilityDateTo: '2026-09-30',
              weekdays: weekdaysAll,
              startTime: '09:00',
              priceUsd: 100,
              minPersons: 2,
              maxPersons: 8,
              maxSpotsPerSlot: 8,
              status: 'ready',
            },
            {
              id: 'sch-oct',
              name: 'October evenings',
              availabilityDateFrom: '2026-10-01',
              availabilityDateTo: '2026-10-31',
              weekdays: weekdaysAll,
              startTime: '19:00',
              priceUsd: 120,
              minPersons: 4,
              maxPersons: 6,
              maxSpotsPerSlot: 6,
              status: 'ready',
            },
          ],
        },
      ],
    };

    expect(
      tourDepartureSlotCapacity({
        listing_extras: extras,
        bookingDate: '2026-09-15',
        bookingOptionId: 'opt-1',
        startTime: '09:00',
      })
    ).toBe(8);
    expect(
      tourDepartureSlotCapacity({
        listing_extras: extras,
        bookingDate: '2026-10-15',
        bookingOptionId: 'opt-1',
        startTime: '19:00',
      })
    ).toBe(6);
  });

  it('Phase 1205: legacy option without maxSpotsPerSlot returns null (no invent from maxPersons)', () => {
    const extras = {
      bookingOptions: [
        {
          id: 'opt-legacy',
          name: 'Standard',
          priceUsd: 80,
          minPersons: 1,
          maxPersons: 12,
          weekdays: weekdaysAll,
          availabilityDateFrom: '2026-09-01',
          availabilityDateTo: '2026-12-31',
          startTime: '10:00',
        },
      ],
    };
    expect(
      tourDepartureSlotCapacity({
        listing_extras: extras,
        bookingDate: '2026-10-01',
        bookingOptionId: 'opt-legacy',
        startTime: '10:00',
      })
    ).toBeNull();
  });

  it('Phase 1205: schedule missing maxSpotsPerSlot is not bookable / capacity null', () => {
    const extras = {
      bookingOptions: [
        {
          id: 'opt-1',
          name: 'Standard',
          priceUsd: 100,
          minPersons: 1,
          maxPersons: 12,
          weekdays: weekdaysAll,
          availabilityDateFrom: '2026-09-01',
          availabilityDateTo: '2026-12-31',
          schedules: [
            {
              id: 'sch-bad',
              name: 'No spots field',
              availabilityDateFrom: '2026-09-01',
              availabilityDateTo: '2026-12-31',
              weekdays: weekdaysAll,
              startTime: '09:00',
              priceUsd: 100,
              minPersons: 1,
              maxPersons: 8,
              status: 'ready',
            },
          ],
        },
      ],
    };
    expect(
      tourDepartureSlotCapacity({
        listing_extras: extras,
        bookingDate: '2026-10-01',
        bookingOptionId: 'opt-1',
        startTime: '09:00',
      })
    ).toBeNull();
  });
});
