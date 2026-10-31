import { describe, expect, it } from 'vitest';
import {
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

function helsinkiNoonMs(ymd: string): number {
  return Date.parse(`${ymd}T12:00:00+03:00`);
}

describe('Mission 04: Partner Home rental schedule (no handover)', () => {
  it('splits same-day collection and return into two events without overdue flags', () => {
    const booking = rentalBooking({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt: '2026-09-20T18:00:00+03:00',
    });
    const events = partnerHomeScheduleEventsForToday([booking], helsinkiNoonMs('2026-09-20'));
    expect(events.map((e) => e.kind)).toEqual(['rental_collection', 'rental_return']);
    expect(events.every((e) => e.collectionOverdue === false)).toBe(true);
    expect(events[0].timeHm).toBe('09:00');
    expect(events[1].timeHm).toBe('18:00');
  });

  it('still shows collection and return on schedule even when legacy ops say collected/returned', () => {
    const collected = rentalBooking({
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt: '2026-09-22T18:00:00+03:00',
      rentalOpsStatus: 'collected',
    });
    const today = partnerHomeScheduleEventsForToday([collected], helsinkiNoonMs('2026-09-20'));
    expect(today.map((e) => e.kind)).toEqual(['rental_collection']);

    const week = partnerHomeScheduleEventsForNext7Days([collected], helsinkiNoonMs('2026-09-20'));
    expect(week.map((e) => `${e.kind}:${e.ymd}`)).toEqual(['rental_return:2026-09-22']);
  });

  it('does not invent overdue collection warnings for uncollected past collection days', () => {
    const booking = rentalBooking({
      pickupAt: '2026-09-18T09:00:00+03:00',
      returnAt: '2026-09-20T18:00:00+03:00',
      rentalOpsStatus: 'awaiting_pickup',
    });
    const events = partnerHomeScheduleEventsForToday([booking], helsinkiNoonMs('2026-09-20'));
    expect(events.map((e) => e.kind)).toEqual(['rental_return']);
    expect(events.every((e) => !e.collectionOverdue)).toBe(true);
  });

  it('respects Today vs Next 7 days date boundaries', () => {
    const booking = rentalBooking({
      id: 'boundary',
      pickupAt: '2026-09-20T09:00:00+03:00',
      returnAt: '2026-09-22T18:00:00+03:00',
    });
    expect(
      partnerHomeScheduleEventsForToday([booking], helsinkiNoonMs('2026-09-20')).map(
        (e) => `${e.kind}:${e.ymd}`
      )
    ).toEqual(['rental_collection:2026-09-20']);
    expect(
      partnerHomeScheduleEventsForNext7Days([booking], helsinkiNoonMs('2026-09-20')).map(
        (e) => `${e.kind}:${e.ymd}`
      )
    ).toEqual(['rental_return:2026-09-22']);
  });
});
