import { describe, expect, it } from 'vitest';
import { quoteBooking, tourBookableSellingDeparturesOnDate } from './booking-quote';
import { tourCheckoutOccupiedGuests } from './booking-hold';
import {
  confirmedDepartureKey,
  departureHasConfirmedPaidBooking,
  evaluateDepartureBookingWindow,
  lastMinutePolicyFromListingExtras,
} from './last-minute-booking';
import { wallTimeInZoneToUtcMs } from './tour-departure-cutoff';
import { normalizeListingBookingOption } from '../types/listingExtras';

const DATE = '2026-09-27';
const TIME = '20:30';
const OPTION = 'opt-small';
const ZONE = 'Europe/Helsinki';

function startMs() {
  const ms = wallTimeInZoneToUtcMs(DATE, TIME, ZONE);
  if (ms == null) throw new Error('fixture start');
  return ms;
}

function paid(over: Record<string, unknown> = {}) {
  return {
    status: 'confirmed',
    payment_status: 'paid',
    booking_date: DATE,
    booking_option_id: OPTION,
    start_time: TIME,
    guests: 2,
    ...over,
  };
}

function window(over: Parameters<typeof evaluateDepartureBookingWindow>[0] = {}) {
  return evaluateDepartureBookingWindow({
    bookingDate: DATE,
    startTimeHm: TIME,
    cutoffHoursBeforeStart: 2,
    timeZone: ZONE,
    nowMs: startMs() - 30 * 60 * 1000,
    ...over,
  });
}

describe('last-minute booking window', () => {
  it('stays open before the normal cutoff without a confirmed booking', () => {
    expect(window({ nowMs: startMs() - 3 * 60 * 60 * 1000, confirmedPaidOnDeparture: false }).ok).toBe(true);
  });

  it('closes after the cutoff when last-minute is off', () => {
    const result = window({ lastMinuteEnabled: false, confirmedPaidOnDeparture: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/2 hours before departure/i);
  });

  it('opens after the cutoff only for the same departure that already has a confirmed booking', () => {
    expect(
      window({ lastMinuteEnabled: true, lastMinuteUntil: 'departure', confirmedPaidOnDeparture: true }).ok
    ).toBe(true);
    expect(window({ lastMinuteEnabled: true, confirmedPaidOnDeparture: false }).ok).toBe(false);
  });

  it('stops at the chosen deadline and never after departure', () => {
    const start = startMs();
    expect(
      window({
        lastMinuteEnabled: true,
        lastMinuteUntil: '30m',
        confirmedPaidOnDeparture: true,
        nowMs: start - 31 * 60 * 1000,
      }).ok
    ).toBe(true);
    const expired = window({
      lastMinuteEnabled: true,
      lastMinuteUntil: '30m',
      confirmedPaidOnDeparture: true,
      nowMs: start - 29 * 60 * 1000,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error).toMatch(/no longer available/i);
    expect(
      window({
        lastMinuteEnabled: true,
        lastMinuteUntil: 'departure',
        confirmedPaidOnDeparture: true,
        nowMs: start + 60 * 1000,
      }).ok
    ).toBe(false);
  });

  it('uses real elapsed time across the Helsinki spring-forward gap', () => {
    const spring = wallTimeInZoneToUtcMs('2026-03-29', '04:00', ZONE);
    expect(spring).not.toBeNull();
    const result = evaluateDepartureBookingWindow({
      bookingDate: '2026-03-29',
      startTimeHm: '04:00',
      cutoffHoursBeforeStart: 2,
      timeZone: ZONE,
      nowMs: spring! - 31 * 60 * 1000,
      lastMinuteEnabled: true,
      lastMinuteUntil: '30m',
      confirmedPaidOnDeparture: true,
    });
    expect(result.ok).toBe(true);
    expect(
      evaluateDepartureBookingWindow({
        bookingDate: '2026-03-29',
        startTimeHm: '04:00',
        cutoffHoursBeforeStart: 2,
        timeZone: ZONE,
        nowMs: spring! - 20 * 60 * 1000,
        lastMinuteEnabled: true,
        lastMinuteUntil: '30m',
        confirmedPaidOnDeparture: true,
      }).ok
    ).toBe(false);
  });

  it('does not unlock from another time, another option, or a missing option id', () => {
    const rows = [
      paid(),
      paid({ start_time: '18:00', booking_option_id: 'other' }),
      paid({ booking_option_id: '' }),
    ];
    expect(departureHasConfirmedPaidBooking(rows, { date: DATE, startTimeHm: TIME, optionId: OPTION })).toBe(true);
    expect(departureHasConfirmedPaidBooking(rows, { date: DATE, startTimeHm: '18:00', optionId: OPTION })).toBe(false);
    expect(departureHasConfirmedPaidBooking(rows, { date: DATE, startTimeHm: TIME, optionId: 'other-option' })).toBe(
      false
    );
    expect(departureHasConfirmedPaidBooking([paid({ booking_option_id: null })], { date: DATE, startTimeHm: TIME, optionId: OPTION })).toBe(
      false
    );
  });

  it('ignores cancelled, pending, failed, refunded, and expired holds', () => {
    const now = startMs() - 30 * 60 * 1000;
    const cases = [
      paid({ status: 'cancelled' }),
      paid({ payment_status: 'pending', hold_expires_at: new Date(now + 60 * 60 * 1000).toISOString() }),
      paid({ payment_status: 'pending', hold_expires_at: new Date(now - 60 * 1000).toISOString() }),
      paid({ payment_status: 'failed' }),
      paid({ payment_status: 'refunded' }),
    ];
    for (const row of cases) {
      expect(departureHasConfirmedPaidBooking([row], { date: DATE, startTimeHm: TIME, optionId: OPTION })).toBe(false);
    }
    const liveHold = cases[1];
    // Instant Book pending no longer occupies inventory.
    expect(tourCheckoutOccupiedGuests([liveHold], DATE, null, now, TIME)).toBe(0);
    expect(tourCheckoutOccupiedGuests([paid()], DATE, null, now, TIME)).toBe(2);
  });

  it('keeps a full departure closed by capacity even when the window is open', () => {
    const now = startMs() - 30 * 60 * 1000;
    expect(window({ lastMinuteEnabled: true, confirmedPaidOnDeparture: true, nowMs: now }).ok).toBe(true);
    expect(tourCheckoutOccupiedGuests([paid({ guests: 8 })], DATE, null, now, TIME)).toBe(8);
  });

  it('treats pickup and meeting-point options the same', () => {
    const pickup = window({ lastMinuteEnabled: true, lastMinuteUntil: '1h', confirmedPaidOnDeparture: true, nowMs: startMs() - 90 * 60 * 1000 });
    const meeting = window({ lastMinuteEnabled: true, lastMinuteUntil: '1h', confirmedPaidOnDeparture: true, nowMs: startMs() - 90 * 60 * 1000 });
    expect(pickup).toEqual(meeting);
  });

  it('leaves legacy options off unless the supplier saved the toggle', () => {
    const legacy = normalizeListingBookingOption({ id: OPTION, name: 'Small group', priceUsd: 10 }, OPTION);
    expect(legacy.lastMinuteBookings).toBeUndefined();
    const saved = normalizeListingBookingOption(
      { id: OPTION, name: 'Small group', priceUsd: 10, lastMinuteBookings: true, lastMinuteUntil: '30m' },
      OPTION
    );
    expect(saved.lastMinuteBookings).toBe(true);
    expect(saved.lastMinuteUntil).toBe('30m');
    expect(lastMinutePolicyFromListingExtras({ bookingOptions: [legacy] }, OPTION).enabled).toBe(false);
  });
});

describe('quoteBooking last-minute', () => {
  const option = {
    id: OPTION,
    name: 'Small group',
    priceUsd: 149,
    startTime: TIME,
    duration: '3 hours',
    pickupPlace: 'Hotel lobby',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    optionInfo: 'Small group',
    travelerStartInstructions: 'Meet your guide at the lobby.',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '2020-01-01',
    availabilityDateTo: '',
    bookingCutoffHoursBeforeStart: 2,
    fulfillment: 'pickup' as const,
  };

  function quote(over: { lastMinute?: boolean; confirmed?: boolean; nowMs?: number; startTime?: string }) {
    return quoteBooking({
      tour: {
        status: 'published',
        price: { startingFrom: 149, currency: 'EUR' },
        listingExtras: {
          departureTimezone: ZONE,
          bookingOptions: [
            {
              ...option,
              lastMinuteBookings: over.lastMinute === true,
              lastMinuteUntil: 'departure',
              fulfillment: over.startTime === '18:00' ? 'meeting_point' : 'pickup',
            },
          ],
        },
      },
      discounts: [],
      bookingDate: DATE,
      guests: 1,
      bookingOptionId: OPTION,
      startTime: over.startTime ?? TIME,
      todayIso: DATE,
      nowMs: over.nowMs ?? startMs() - 30 * 60 * 1000,
      confirmedPaidOnDeparture: over.confirmed === true,
    });
  }

  it('rejects after cutoff until a confirmed booking on that departure is known', () => {
    expect(quote({ lastMinute: true, confirmed: false }).ok).toBe(false);
    expect(quote({ lastMinute: true, confirmed: true }).ok).toBe(true);
    expect(quote({ lastMinute: false, confirmed: true }).ok).toBe(false);
  });

  it('shows the departure on the calendar only when that slot is confirmed', () => {
    const nowMs = startMs() - 30 * 60 * 1000;
    const options = [
      {
        ...option,
        lastMinuteBookings: true as const,
        lastMinuteUntil: 'departure' as const,
      },
    ];
    const hidden = tourBookableSellingDeparturesOnDate(options, DATE, {
      timeZone: ZONE,
      nowMs,
      confirmedDepartureKeys: new Set(),
    });
    expect(hidden.map((d) => d.startTime)).not.toContain(TIME);
    const shown = tourBookableSellingDeparturesOnDate(options, DATE, {
      timeZone: ZONE,
      nowMs,
      confirmedDepartureKeys: new Set([confirmedDepartureKey(DATE, TIME, OPTION)]),
    });
    expect(shown.map((d) => d.startTime)).toContain(TIME);
  });
});

describe('independent per-departure cutoffs (18:30 vs 20:00)', () => {
  const DAY = '2026-09-27';
  const EARLY = '18:30';
  const LATE = '20:00';
  const OPT_A = 'opt-bus';
  const OPT_B = 'opt-small';

  function ms(hm: string) {
    const v = wallTimeInZoneToUtcMs(DAY, hm, ZONE);
    if (v == null) throw new Error(hm);
    return v;
  }

  function slotOption(id: string, startTime: string, cutoffHours: number) {
    return {
      id,
      name: id,
      priceUsd: 99,
      startTime,
      duration: '2 hours',
      pickupPlace: 'Square',
      minPersons: 1,
      maxPersons: 40,
      maxSpotsPerSlot: 40,
      optionInfo: id,
      travelerStartInstructions: 'Board at the square.',
      weekdays: [true, true, true, true, true, true, true],
      availabilityDateFrom: '2020-01-01',
      availabilityDateTo: '',
      bookingCutoffHoursBeforeStart: cutoffHours,
      fulfillment: 'meeting_point' as const,
      lastMinuteBookings: true as const,
      lastMinuteUntil: 'departure' as const,
    };
  }

  // Same option id + two schedule rows via weekdayStartTimes on one schedule.
  const dualTimes = [EARLY, LATE];
  const dualScheduleOption = {
    ...slotOption(OPT_A, EARLY, 3),
    schedules: [
      {
        id: 'sch-dual',
        name: 'Evening',
        status: 'ready' as const,
        startTime: EARLY,
        priceUsd: 99,
        weekdays: [true, true, true, true, true, true, true],
        weekdayStartTimes: Array.from({ length: 7 }, () => dualTimes),
        availabilityDateFrom: '2020-01-01',
        availabilityDateTo: '',
        maxSpotsPerSlot: 40,
        minPersons: 1,
        maxPersons: 40,
      },
    ],
  };

  it('closes 18:30 at its own cutoff while 20:00 stays open', () => {
    // 16:00 local: 18:30 cutoff was 15:30 (closed); 20:00 cutoff is 17:00 (open).
    const nowMs = ms(EARLY) - 2.5 * 60 * 60 * 1000;
    const bookable = tourBookableSellingDeparturesOnDate([dualScheduleOption], DAY, {
      timeZone: ZONE,
      nowMs,
      confirmedDepartureKeys: new Set(),
    });
    const times = bookable.map((d) => d.startTime);
    expect(times).not.toContain(EARLY);
    expect(times).toContain(LATE);
  });

  it('late-booking on 18:30 does not unlock 20:00', () => {
    // 17:30: past both cutoffs (15:30 / 17:00), still before either departure start.
    const nowMs = ms(EARLY) - 60 * 60 * 1000;
    const onlyEarlyConfirmed = new Set([confirmedDepartureKey(DAY, EARLY, OPT_A)]);
    const bookable = tourBookableSellingDeparturesOnDate([dualScheduleOption], DAY, {
      timeZone: ZONE,
      nowMs,
      confirmedDepartureKeys: onlyEarlyConfirmed,
    });
    const times = bookable.map((d) => d.startTime);
    expect(times).toContain(EARLY);
    expect(times).not.toContain(LATE);
  });

  it('late-booking on 20:00 does not unlock 18:30', () => {
    const nowMs = ms(EARLY) - 60 * 60 * 1000;
    const onlyLateConfirmed = new Set([confirmedDepartureKey(DAY, LATE, OPT_A)]);
    const bookable = tourBookableSellingDeparturesOnDate([dualScheduleOption], DAY, {
      timeZone: ZONE,
      nowMs,
      confirmedDepartureKeys: onlyLateConfirmed,
    });
    const times = bookable.map((d) => d.startTime);
    expect(times).not.toContain(EARLY);
    expect(times).toContain(LATE);
  });

  it('keeps options with different cutoffs independent on the same date', () => {
    const nowMs = ms(EARLY) - 90 * 60 * 1000; // 1.5h before 18:30
    const bookable = tourBookableSellingDeparturesOnDate(
      [slotOption(OPT_A, EARLY, 3), slotOption(OPT_B, LATE, 1)],
      DAY,
      { timeZone: ZONE, nowMs, confirmedDepartureKeys: new Set() }
    );
    const byId = Object.fromEntries(bookable.map((d) => [d.optionId, d.startTime]));
    expect(byId[OPT_A]).toBeUndefined(); // 3h cutoff already closed
    expect(byId[OPT_B]).toBe(LATE); // 1h cutoff still open
  });

  it('does not unlock another option or another date', () => {
    const nowMs = ms(EARLY) - 30 * 60 * 1000;
    expect(
      evaluateDepartureBookingWindow({
        bookingDate: DAY,
        startTimeHm: EARLY,
        cutoffHoursBeforeStart: 3,
        timeZone: ZONE,
        nowMs,
        lastMinuteEnabled: true,
        lastMinuteUntil: 'departure',
        confirmedPaidOnDeparture: departureHasConfirmedPaidBooking(
          [paid({ booking_option_id: OPT_B, start_time: EARLY })],
          { date: DAY, startTimeHm: EARLY, optionId: OPT_A }
        ),
      }).ok
    ).toBe(false);
    expect(
      evaluateDepartureBookingWindow({
        bookingDate: DAY,
        startTimeHm: EARLY,
        cutoffHoursBeforeStart: 3,
        timeZone: ZONE,
        nowMs,
        lastMinuteEnabled: true,
        lastMinuteUntil: 'departure',
        confirmedPaidOnDeparture: departureHasConfirmedPaidBooking(
          [paid({ booking_date: '2026-09-28', start_time: EARLY })],
          { date: DAY, startTimeHm: EARLY, optionId: OPT_A }
        ),
      }).ok
    ).toBe(false);
  });

  it('honors an existing checkout hold past cutoff until absolute start', () => {
    const start = ms(EARLY);
    expect(
      evaluateDepartureBookingWindow({
        bookingDate: DAY,
        startTimeHm: EARLY,
        cutoffHoursBeforeStart: 3,
        timeZone: ZONE,
        nowMs: start - 30 * 60 * 1000,
        lastMinuteEnabled: false,
        confirmedPaidOnDeparture: false,
        existingHold: true,
      }).ok
    ).toBe(true);
    expect(
      evaluateDepartureBookingWindow({
        bookingDate: DAY,
        startTimeHm: EARLY,
        cutoffHoursBeforeStart: 3,
        timeZone: ZONE,
        nowMs: start + 1,
        lastMinuteEnabled: false,
        confirmedPaidOnDeparture: false,
        existingHold: true,
      }).ok
    ).toBe(false);
  });

  it('rejects exactly at cutoff and at departure start', () => {
    const start = ms(EARLY);
    const cutoffMs = start - 3 * 60 * 60 * 1000;
    expect(
      evaluateDepartureBookingWindow({
        bookingDate: DAY,
        startTimeHm: EARLY,
        cutoffHoursBeforeStart: 3,
        timeZone: ZONE,
        nowMs: cutoffMs,
        lastMinuteEnabled: false,
      }).ok
    ).toBe(false);
    expect(
      evaluateDepartureBookingWindow({
        bookingDate: DAY,
        startTimeHm: EARLY,
        cutoffHoursBeforeStart: 3,
        timeZone: ZONE,
        nowMs: start,
        lastMinuteEnabled: true,
        confirmedPaidOnDeparture: true,
        existingHold: true,
      }).ok
    ).toBe(false);
  });

  it('closes late bookings when the last qualifying booking is cancelled', () => {
    const nowMs = ms(EARLY) - 30 * 60 * 1000;
    const rows = [paid({ status: 'cancelled' })];
    expect(
      departureHasConfirmedPaidBooking(rows, { date: DAY, startTimeHm: EARLY, optionId: OPTION })
    ).toBe(false);
    expect(
      evaluateDepartureBookingWindow({
        bookingDate: DAY,
        startTimeHm: EARLY,
        cutoffHoursBeforeStart: 3,
        timeZone: ZONE,
        nowMs,
        lastMinuteEnabled: true,
        lastMinuteUntil: 'departure',
        confirmedPaidOnDeparture: false,
      }).ok
    ).toBe(false);
  });
});
