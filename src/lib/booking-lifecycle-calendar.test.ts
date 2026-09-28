import { describe, expect, it } from 'vitest';
import {
  addCalendarDaysYmd,
  lifecycleBookingIsStay,
  lifecycleReminderAnchorYmd,
  lifecycleReviewCompletionYmd,
  lifecycleStayCheckOutYmd,
  resolveLifecycleTimezone,
  shouldSendExperienceReminder,
  shouldSendReviewRequest,
  ymdInTimeZone,
} from './booking-lifecycle-calendar';

describe('booking-lifecycle-calendar', () => {
  it('adds calendar days across month boundaries without local TZ drift', () => {
    expect(addCalendarDaysYmd('2026-01-31', 1)).toBe('2026-02-01');
    expect(addCalendarDaysYmd('2026-03-01', -1)).toBe('2026-02-28');
    expect(addCalendarDaysYmd('2026-09-15', 1)).toBe('2026-09-16');
  });

  // Phase 1302: partner Home week-ahead uses +7 experience calendar days (not browser Date).
  it('week-ahead end is seven calendar days after experience today', () => {
    expect(addCalendarDaysYmd('2026-09-28', 7)).toBe('2026-10-05');
    expect(addCalendarDaysYmd('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('resolves snapshot timezone with Helsinki fallback', () => {
    expect(
      resolveLifecycleTimezone({
        listingTitle: 'x',
        departureTimezone: 'America/New_York',
        capturedAt: 't',
      })
    ).toBe('America/New_York');
    expect(resolveLifecycleTimezone({ listingTitle: 'x', capturedAt: 't' })).toBe('Europe/Helsinki');
    expect(resolveLifecycleTimezone({ departureTimezone: 'Not/AZone', capturedAt: 't' })).toBe(
      'Europe/Helsinki'
    );
  });

  it('reminder uses experience-local tomorrow, not UTC date', () => {
    // 2026-09-15 22:30 UTC = 2026-09-16 01:30 Helsinki → local today Sep 16.
    // Reminder for Sep 17 departure should fire (day before).
    const now = Date.parse('2026-09-15T22:30:00.000Z');
    expect(ymdInTimeZone(now, 'Europe/Helsinki')).toBe('2026-09-16');
    const tour = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-17',
      purchase_snapshot: {
        listingTitle: 'Aurora',
        startTimeHm: '20:00',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: '2026-09-01T00:00:00.000Z',
      },
    };
    expect(shouldSendExperienceReminder(tour, now)).toBe(true);
    // Same instant is still Sep 15 in New York — must NOT fire for NY listing.
    const ny = {
      ...tour,
      purchase_snapshot: {
        ...tour.purchase_snapshot,
        departureTimezone: 'America/New_York',
      },
    };
    expect(ymdInTimeZone(now, 'America/New_York')).toBe('2026-09-15');
    expect(shouldSendExperienceReminder(ny, now)).toBe(false);
  });

  it('tour review fires day after departure in experience TZ', () => {
    // Helsinki Sep 16 00:30 = Sep 15 21:30 UTC.
    const now = Date.parse('2026-09-15T21:30:00.000Z');
    expect(ymdInTimeZone(now, 'Europe/Helsinki')).toBe('2026-09-16');
    const tour = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-15',
      purchase_snapshot: {
        listingTitle: 'Aurora',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: 't',
      },
    };
    expect(shouldSendReviewRequest(tour, now)).toBe(true);
    expect(shouldSendReviewRequest(tour, Date.parse('2026-09-15T10:00:00.000Z'))).toBe(false);
  });

  it('stay review waits until day after check-out, not check-in', () => {
    const stay = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-10',
      check_out: '2026-09-13',
      purchase_snapshot: {
        listingTitle: 'Cabin',
        checkIn: '2026-09-10',
        checkOut: '2026-09-13',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: 't',
      },
    };
    expect(lifecycleReminderAnchorYmd(stay)).toBe('2026-09-10');
    expect(lifecycleReviewCompletionYmd(stay)).toBe('2026-09-13');
    // Day after check-in (Sep 11 Helsinki) — must NOT review.
    expect(shouldSendReviewRequest(stay, Date.parse('2026-09-10T21:30:00.000Z'))).toBe(false);
    // Day after check-out (Sep 14 Helsinki).
    expect(shouldSendReviewRequest(stay, Date.parse('2026-09-13T21:30:00.000Z'))).toBe(true);
  });

  it('nights-only stay review waits until day after computed check-out (Phase 1332)', () => {
    const stay = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-10',
      check_out: null as string | null,
      nights: 3,
      special_requests: null as string | null,
      purchase_snapshot: {
        listingTitle: 'Cabin',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: 't',
      },
    };
    expect(lifecycleBookingIsStay(stay)).toBe(true);
    expect(lifecycleReviewCompletionYmd(stay)).toBe('2026-09-13');
    // Phase 1523: notes-only check_out: must not classify as stay
    expect(
      lifecycleBookingIsStay({
        ...stay,
        nights: null,
        special_requests: 'check_out: 2026-09-13',
      })
    ).toBe(false);
    // Day after check-in — must NOT review (tour path would fire here).
    expect(shouldSendReviewRequest(stay, Date.parse('2026-09-10T21:30:00.000Z'))).toBe(false);
    expect(shouldSendReviewRequest(stay, Date.parse('2026-09-13T21:30:00.000Z'))).toBe(true);
  });

  it('Phase 1555: longer snapshot beats stale short nights for review completion', () => {
    const stay = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-12-01',
      check_out: null as string | null,
      nights: 2,
      purchase_snapshot: {
        checkOut: '2026-12-05',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: 't',
      },
    };
    expect(lifecycleStayCheckOutYmd(stay)).toBe('2026-12-05');
    expect(lifecycleReviewCompletionYmd(stay)).toBe('2026-12-05');
  });

  it('Phase 1564: longer snapshot beats stale short check_out column', () => {
    const stay = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-12-01',
      check_out: '2026-12-03' as string | null,
      nights: 2,
      purchase_snapshot: {
        checkOut: '2026-12-05',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: 't',
      },
    };
    expect(lifecycleStayCheckOutYmd(stay)).toBe('2026-12-05');
    expect(lifecycleReviewCompletionYmd(stay)).toBe('2026-12-05');
  });

  it('stay reminder is day before check-in', () => {
    const stay = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-20',
      check_out: '2026-09-22',
      purchase_snapshot: {
        listingTitle: 'Cabin',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: 't',
      },
    };
    expect(shouldSendExperienceReminder(stay, Date.parse('2026-09-18T21:30:00.000Z'))).toBe(true);
    expect(shouldSendExperienceReminder(stay, Date.parse('2026-09-19T21:30:00.000Z'))).toBe(false);
  });

  it('does not send reminder/review for unpaid or cancelled', () => {
    const base = {
      booking_date: '2026-09-17',
      purchase_snapshot: { listingTitle: 'x', departureTimezone: 'Europe/Helsinki', capturedAt: 't' },
    };
    const now = Date.parse('2026-09-15T22:30:00.000Z');
    expect(shouldSendExperienceReminder({ ...base, status: 'confirmed', payment_status: 'pending' }, now)).toBe(
      false
    );
    expect(shouldSendExperienceReminder({ ...base, status: 'cancelled', payment_status: 'paid' }, now)).toBe(
      false
    );
  });

  it('near-midnight tour: UTC date differs from Helsinki date', () => {
    // 2026-12-31 22:00 UTC → 2027-01-01 Helsinki. Reminder for Jan 2.
    const now = Date.parse('2026-12-31T22:00:00.000Z');
    expect(ymdInTimeZone(now, 'Europe/Helsinki')).toBe('2027-01-01');
    expect(
      shouldSendExperienceReminder(
        {
          status: 'confirmed',
          payment_status: 'paid',
          booking_date: '2027-01-02',
          purchase_snapshot: {
            listingTitle: 'NYE',
            departureTimezone: 'Europe/Helsinki',
            capturedAt: 't',
          },
        },
        now
      )
    ).toBe(true);
  });
});
