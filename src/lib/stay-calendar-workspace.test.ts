import { describe, expect, it } from 'vitest';
import {
  buildStayCalendarAgenda,
  buildStayCalendarWeekSpans,
  stayCalendarCanBlockNight,
  stayCalendarCanUnblockNight,
  stayCalendarNightKind,
  stayCalendarOccupyingOnNight,
  weekRangeContaining,
} from './stay-calendar-workspace';

const listing = { id: 'stay-1', title: 'Lake Cabin', image: 'https://example.com/a.jpg' };

function booking(over: Record<string, unknown>) {
  return {
    id: 'b1',
    listing_id: 'stay-1',
    guest_name: 'Ada',
    guests: 2,
    booking_date: '2026-11-02',
    check_out: '2026-11-05',
    status: 'confirmed',
    payment_status: 'paid',
    created_at: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

describe('stay calendar workspace', () => {
  it('treats paid nights as booked and checkout morning as free to block', () => {
    const b = booking({});
    expect(stayCalendarNightKind({ occupying: [b], capacity: null })).toBe('booked');
    expect(stayCalendarOccupyingOnNight([b], 'stay-1', '2026-11-02')).toHaveLength(1);
    expect(stayCalendarOccupyingOnNight([b], 'stay-1', '2026-11-04')).toHaveLength(1);
    expect(stayCalendarOccupyingOnNight([b], 'stay-1', '2026-11-05')).toHaveLength(0);
    expect(stayCalendarCanBlockNight({ bookings: [b], listingId: 'stay-1', iso: '2026-11-05' })).toBe(
      true
    );
    expect(stayCalendarCanBlockNight({ bookings: [b], listingId: 'stay-1', iso: '2026-11-03' })).toBe(
      false
    );
  });

  it('marks authorized Request-to-Book as pending and unpaid Instant Book as free', () => {
    const now = Date.parse('2026-10-20T12:00:00.000Z');
    const r2b = booking({
      id: 'r2b',
      payment_status: 'authorized',
      hold_expires_at: '2026-10-21T12:00:00.000Z',
    });
    const unpaid = booking({
      id: 'ib',
      payment_status: 'pending',
      hold_expires_at: '2026-10-20T13:00:00.000Z',
    });
    expect(stayCalendarNightKind({ occupying: [r2b], capacity: null, nowMs: now })).toBe('pending');
    expect(stayCalendarOccupyingOnNight([unpaid], 'stay-1', '2026-11-02', now)).toHaveLength(0);
    expect(stayCalendarCanBlockNight({ bookings: [unpaid], listingId: 'stay-1', iso: '2026-11-02', nowMs: now })).toBe(
      true
    );
  });

  it('builds agenda check-in, check-out, and blocked rows without confusing them', () => {
    const paid = booking({});
    const agenda = buildStayCalendarAgenda({
      fromIso: '2026-11-01',
      toIso: '2026-11-06',
      bookings: [paid],
      caps: [{ listing_id: 'stay-1', available_date: '2026-11-06', capacity: 0 }],
      listings: [listing],
    });
    expect(agenda.map((r) => `${r.kind}:${r.iso}`)).toEqual([
      'check_in:2026-11-02',
      'check_out:2026-11-05',
      'blocked:2026-11-06',
    ]);
  });

  it('clips week spans to the Monday–Sunday window', () => {
    const week = weekRangeContaining('2026-11-04'); // Wed
    expect(week.from).toBe('2026-11-02');
    const spans = buildStayCalendarWeekSpans({
      weekFromIso: week.from,
      listingId: 'stay-1',
      bookings: [booking({ booking_date: '2026-10-31', check_out: '2026-11-05' })],
    });
    expect(spans).toHaveLength(1);
    expect(spans[0].colStart).toBe(0);
    expect(spans[0].colSpan).toBe(3); // Mon–Wed nights
    expect(spans[0].lane).toBe(0);
    expect(spans[0].laneCount).toBe(1);
  });

  it('stacks overlapping week spans onto separate lanes', () => {
    const week = weekRangeContaining('2026-11-04');
    const spans = buildStayCalendarWeekSpans({
      weekFromIso: week.from,
      listingId: 'stay-1',
      bookings: [
        booking({ id: 'a', booking_date: '2026-11-02', check_out: '2026-11-05' }),
        booking({ id: 'b', guest_name: 'Bea', booking_date: '2026-11-03', check_out: '2026-11-06' }),
      ],
    });
    expect(spans).toHaveLength(2);
    expect(spans.map((s) => s.lane).sort()).toEqual([0, 1]);
    expect(spans.every((s) => s.laneCount === 2)).toBe(true);
  });

  it('only unblocks supplier capacity-0 nights that are not occupied', () => {
    const paid = booking({});
    expect(
      stayCalendarCanUnblockNight({
        bookings: [paid],
        caps: [{ listing_id: 'stay-1', available_date: '2026-11-03', capacity: 0 }],
        listingId: 'stay-1',
        iso: '2026-11-03',
      })
    ).toBe(false);
    expect(
      stayCalendarCanUnblockNight({
        bookings: [],
        caps: [{ listing_id: 'stay-1', available_date: '2026-11-10', capacity: 0 }],
        listingId: 'stay-1',
        iso: '2026-11-10',
      })
    ).toBe(true);
  });
});
