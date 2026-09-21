/**
 * Certification: same date, two departure times — morning fill must not steal evening capacity.
 * Distinguishes unit-proven slot math from browser/deployed journeys.
 */
import { describe, expect, it } from 'vitest';
import { remainingCapacity } from './availability-ops';
import { tourCheckoutOccupiedGuests } from './booking-hold';
import { tourDepartureSlotCapacity } from '../../supabase/functions/_shared/booking-quote.ts';
import { tourPaidSlotKey } from '../data/supabase-availability';

const weekdaysAll = [true, true, true, true, true, true, true];

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
      availabilityDateTo: '2026-09-30',
      schedules: [
        {
          id: 'sch-am',
          name: 'Morning',
          availabilityDateFrom: '2026-09-01',
          availabilityDateTo: '2026-09-30',
          weekdays: weekdaysAll,
          startTime: '08:00',
          priceUsd: 100,
          minPersons: 1,
          maxPersons: 8,
          maxSpotsPerSlot: 8,
          status: 'ready',
        },
        {
          id: 'sch-pm',
          name: 'Evening',
          availabilityDateFrom: '2026-09-01',
          availabilityDateTo: '2026-09-30',
          weekdays: weekdaysAll,
          startTime: '20:00',
          priceUsd: 120,
          minPersons: 1,
          maxPersons: 6,
          maxSpotsPerSlot: 6,
          status: 'ready',
        },
      ],
    },
  ],
};

describe('Phase 404 multi-departure inventory certification', () => {
  const day = '2026-09-15';
  const now = Date.parse('2026-09-08T12:00:00.000Z');

  it('resolves distinct slot capacities for 08:00 and 20:00', () => {
    expect(
      tourDepartureSlotCapacity({
        listing_extras: extras,
        bookingDate: day,
        bookingOptionId: 'opt-1',
        startTime: '08:00',
      })
    ).toBe(8);
    expect(
      tourDepartureSlotCapacity({
        listing_extras: extras,
        bookingDate: day,
        bookingOptionId: 'opt-1',
        startTime: '20:00',
      })
    ).toBe(6);
  });

  it('filling morning paid guests leaves evening remaining intact', () => {
    const rows = [
      {
        id: 'am-full',
        status: 'confirmed',
        payment_status: 'paid',
        booking_date: day,
        guests: 8,
        start_time: '08:00:00',
      },
    ];
    const amOccupied = tourCheckoutOccupiedGuests(rows, day, null, now, '08:00');
    const pmOccupied = tourCheckoutOccupiedGuests(rows, day, null, now, '20:00');
    expect(amOccupied).toBe(8);
    expect(pmOccupied).toBe(0);

    const amCap = tourDepartureSlotCapacity({
      listing_extras: extras,
      bookingDate: day,
      bookingOptionId: 'opt-1',
      startTime: '08:00',
    })!;
    const pmCap = tourDepartureSlotCapacity({
      listing_extras: extras,
      bookingDate: day,
      bookingOptionId: 'opt-1',
      startTime: '20:00',
    })!;

    expect(remainingCapacity(amCap, amOccupied)).toBe(0);
    expect(remainingCapacity(pmCap, pmOccupied)).toBe(6);

    const paidBySlot: Record<string, number> = {
      [tourPaidSlotKey(day, '08:00')]: 8,
    };
    expect(remainingCapacity(pmCap, paidBySlot[tourPaidSlotKey(day, '20:00')] ?? 0)).toBe(6);
  });

  it('day-wide occupancy without startTime still sums both slots (legacy/day override path)', () => {
    const rows = [
      {
        id: 'am',
        status: 'confirmed',
        payment_status: 'paid',
        booking_date: day,
        guests: 3,
        start_time: '08:00',
      },
      {
        id: 'pm',
        status: 'confirmed',
        payment_status: 'paid',
        booking_date: day,
        guests: 2,
        start_time: '20:00',
      },
    ];
    expect(tourCheckoutOccupiedGuests(rows, day, null, now)).toBe(5);
    expect(tourCheckoutOccupiedGuests(rows, day, null, now, '08:00')).toBe(3);
    expect(tourCheckoutOccupiedGuests(rows, day, null, now, '20:00')).toBe(2);
  });
});
