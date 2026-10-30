import { describe, expect, it } from 'vitest';
import {
  partnerHomeRentalCollectionOverdue,
  partnerHomeScheduleEventsForNext7Days,
  partnerHomeScheduleEventsForToday,
} from './partner-home-schedule';

function rentalBooking(params: {
  id?: string;
  pickupAt: string;
  returnAt: string;
  rentalOpsStatus?: 'awaiting_pickup' | 'collected' | 'returned' | 'cancelled';
  booking_date?: string;
  check_out?: string;
}) {
  return {
    id: params.id ?? 'r1',
    status: 'confirmed',
    payment_status: 'paid',
    booking_date: params.booking_date ?? params.pickupAt.slice(0, 10),
    check_out: params.check_out ?? params.returnAt.slice(0, 10),
    purchase_snapshot: {
      inventoryFamily: 'rental',
      variantId: 'v1',
      quantity: 1,
      pickupAt: params.pickupAt,
      returnAt: params.returnAt,
      durationCount: 1,
      durationUnit: 'day' as const,
      unitMinor: 8900,
      customerTotalMinor: 8900,
      commissionMinor: 1335,
      supplierEarningsMinor: 7565,
      commissionBps: 1500,
      currency: 'EUR',
      rentalOpsStatus: params.rentalOpsStatus ?? 'awaiting_pickup',
      departureTimezone: 'Europe/Helsinki',
      listingTitle: 'Sony A7 IV',
    },
  };
}

/** Helsinki noon on the given calendar day. */
function helsinkiNoonMs(ymd: string): number {
  return Date.parse(`${ymd}T12:00:00+03:00`);
}

describe('Mission 03.1: Partner Home rental schedule events', () => {
  it('splits same-day collection and return into two events', () => {
    // September keeps Europe/Helsinki on EEST (+03).
    const booking = rentalBooking({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt: '2026-09-20T18:00:00+03:00',
    });
    const events = partnerHomeScheduleEventsForToday([booking], helsinkiNoonMs('2026-09-20'));
    expect(events.map((e) => e.kind)).toEqual(['rental_collection', 'rental_return']);
    expect(events.map((e) => e.ymd)).toEqual(['2026-09-20', '2026-09-20']);
    expect(events[0].timeHm).toBe('09:00');
    expect(events[1].timeHm).toBe('18:00');
    expect(new Set(events.map((e) => e.key)).size).toBe(2);
    expect(events.every((e) => e.booking.id === 'r1')).toBe(true);
  });

  it('surfaces overdue collection without hiding today’s return', () => {
    const booking = rentalBooking({
      pickupAt: '2026-10-28T09:00:00+03:00',
      returnAt: '2026-10-30T18:00:00+03:00',
      rentalOpsStatus: 'awaiting_pickup',
    });
    expect(partnerHomeRentalCollectionOverdue(booking, '2026-10-30')).toBe(true);

    const events = partnerHomeScheduleEventsForToday([booking], helsinkiNoonMs('2026-10-30'));
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('rental_collection');
    expect(events[0].collectionOverdue).toBe(true);
    expect(events[0].ymd).toBe('2026-10-28');
    expect(events[1].kind).toBe('rental_return');
    expect(events[1].ymd).toBe('2026-10-30');
    expect(events[1].collectionOverdue).toBe(false);
  });

  it('hides completed handovers from the schedule', () => {
    const returned = rentalBooking({
      pickupAt: '2026-10-30T09:00:00+03:00',
      returnAt: '2026-10-30T18:00:00+03:00',
      rentalOpsStatus: 'returned',
    });
    expect(partnerHomeScheduleEventsForToday([returned], helsinkiNoonMs('2026-10-30'))).toEqual([]);
    expect(
      partnerHomeScheduleEventsForNext7Days([returned], helsinkiNoonMs('2026-10-29'))
    ).toEqual([]);
  });

  it('after collection, keeps return and drops the collection event', () => {
    const collected = rentalBooking({
      pickupAt: '2026-10-30T09:00:00+03:00',
      returnAt: '2026-11-02T18:00:00+03:00',
      rentalOpsStatus: 'collected',
    });
    const today = partnerHomeScheduleEventsForToday([collected], helsinkiNoonMs('2026-10-30'));
    expect(today.map((e) => e.kind)).toEqual([]);

    const week = partnerHomeScheduleEventsForNext7Days([collected], helsinkiNoonMs('2026-10-30'));
    expect(week.map((e) => e.kind)).toEqual(['rental_return']);
    expect(week[0].ymd).toBe('2026-11-02');
  });

  it('respects Today vs Next 7 days date boundaries (no duplicates)', () => {
    const booking = rentalBooking({
      id: 'boundary',
      pickupAt: '2026-10-30T09:00:00+03:00',
      returnAt: '2026-11-02T18:00:00+03:00',
    });

    const today = partnerHomeScheduleEventsForToday([booking], helsinkiNoonMs('2026-10-30'));
    expect(today.map((e) => `${e.kind}:${e.ymd}`)).toEqual(['rental_collection:2026-10-30']);

    const week = partnerHomeScheduleEventsForNext7Days([booking], helsinkiNoonMs('2026-10-30'));
    expect(week.map((e) => `${e.kind}:${e.ymd}`)).toEqual(['rental_return:2026-11-02']);

    // Day before collection: both future events land in the week strip.
    const weekFrom29 = partnerHomeScheduleEventsForNext7Days(
      [booking],
      helsinkiNoonMs('2026-10-29')
    );
    expect(weekFrom29.map((e) => `${e.kind}:${e.ymd}`)).toEqual([
      'rental_collection:2026-10-30',
      'rental_return:2026-11-02',
    ]);
    expect(new Set(weekFrom29.map((e) => e.key)).size).toBe(2);

    // After the +7 window ends, nothing remains.
    const afterWindow = partnerHomeScheduleEventsForNext7Days(
      [booking],
      helsinkiNoonMs('2026-11-03')
    );
    expect(afterWindow).toEqual([]);
  });

  it('keeps tour and stay as single events and counts events not bookings', () => {
    const tour = {
      id: 't1',
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-10-30',
      purchase_snapshot: { inventoryFamily: 'tour', departureTimezone: 'Europe/Helsinki' },
    };
    const stay = {
      id: 's1',
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-10-30',
      check_out: '2026-11-02',
      purchase_snapshot: {
        inventoryFamily: 'stay',
        checkOut: '2026-11-02',
        departureTimezone: 'Europe/Helsinki',
      },
    };
    const rental = rentalBooking({
      id: 'r-same',
      pickupAt: '2026-10-30T09:00:00+03:00',
      returnAt: '2026-10-30T18:00:00+03:00',
    });

    const events = partnerHomeScheduleEventsForToday(
      [tour, stay, rental],
      helsinkiNoonMs('2026-10-30')
    );
    // 1 tour + 1 stay check-in + 2 rental events = 4 events from 3 bookings
    expect(events).toHaveLength(4);
    expect(events.filter((e) => e.kind === 'tour')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'stay_check_in')).toHaveLength(1);
    expect(events.filter((e) => e.kind.startsWith('rental_'))).toHaveLength(2);
  });
});
