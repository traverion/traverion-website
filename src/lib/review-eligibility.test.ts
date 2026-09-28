import { describe, expect, it } from 'vitest';
import { bookingEligibleForReview } from './review-eligibility';

describe('bookingEligibleForReview', () => {
  const pastTour = {
    status: 'confirmed',
    payment_status: 'paid',
    booking_date: '2026-09-01',
    start_time: '20:00:00',
    purchase_snapshot: {
      listingTitle: 'Aurora',
      startTimeHm: '20:00',
      departureTimezone: 'Europe/Helsinki',
      capturedAt: '2026-08-01T00:00:00.000Z',
    },
  };

  it('allows paid confirmed tour after experience-local start', () => {
    // 20:00 Helsinki on 2026-09-01 is 17:00 UTC; after that instant → eligible.
    const now = Date.parse('2026-09-01T17:01:00.000Z');
    expect(bookingEligibleForReview(pastTour, now)).toBe(true);
  });

  it('rejects before experience-local start even if browser TZ would already be past', () => {
    // 16:30 UTC is still 19:30 Helsinki — not started yet.
    const now = Date.parse('2026-09-01T16:30:00.000Z');
    expect(bookingEligibleForReview(pastTour, now)).toBe(false);
  });

  it('rejects cancelled bookings (even if paid)', () => {
    expect(
      bookingEligibleForReview({ ...pastTour, status: 'cancelled' }, Date.parse('2026-09-02T00:00:00.000Z'))
    ).toBe(false);
  });

  it('rejects unpaid confirmed bookings', () => {
    expect(
      bookingEligibleForReview({ ...pastTour, payment_status: 'pending' }, Date.parse('2026-09-02T00:00:00.000Z'))
    ).toBe(false);
  });

  it('rejects future departures', () => {
    expect(bookingEligibleForReview(pastTour, Date.parse('2026-08-01T00:00:00.000Z'))).toBe(false);
  });

  it('uses snapshotted start time over live booking start_time', () => {
    const row = {
      ...pastTour,
      start_time: '10:00:00',
      purchase_snapshot: {
        ...pastTour.purchase_snapshot,
        startTimeHm: '22:00',
      },
    };
    // 21:30 Helsinki = 18:30 UTC — before snapshotted 22:00.
    expect(bookingEligibleForReview(row, Date.parse('2026-09-01T18:30:00.000Z'))).toBe(false);
    // 22:01 Helsinki = 19:01 UTC.
    expect(bookingEligibleForReview(row, Date.parse('2026-09-01T19:01:00.000Z'))).toBe(true);
  });

  it('unlocks stay review on/after check-out day (column)', () => {
    const row = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-01',
      check_out: '2026-09-03',
      purchase_snapshot: {
        listingTitle: 'Cabin',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: '2026-08-01T00:00:00.000Z',
      },
    };
    expect(bookingEligibleForReview(row, Date.parse('2026-09-02T12:00:00.000Z'))).toBe(false);
    expect(bookingEligibleForReview(row, Date.parse('2026-09-03T12:00:00.000Z'))).toBe(true);
  });

  it('treats nights-only stays like SQL stay_booking_check_out (Phase 1328)', () => {
    const row = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-01',
      check_out: null as string | null,
      nights: 2,
      special_requests: null as string | null,
      purchase_snapshot: {
        listingTitle: 'Cabin',
        startTimeHm: '20:00',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: '2026-08-01T00:00:00.000Z',
      },
    };
    // Mid-stay must not unlock via tour startTimeHm
    expect(bookingEligibleForReview(row, Date.parse('2026-09-01T19:01:00.000Z'))).toBe(false);
    expect(bookingEligibleForReview(row, Date.parse('2026-09-02T12:00:00.000Z'))).toBe(false);
    // check-out = 2026-09-03
    expect(bookingEligibleForReview(row, Date.parse('2026-09-03T12:00:00.000Z'))).toBe(true);
  });

  it('falls back to listing departureTimezone when snapshot lacks TZ (SQL parity)', () => {
    const row = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-01',
      start_time: '20:00:00',
      purchase_snapshot: {
        listingTitle: 'City tour',
        startTimeHm: '20:00',
        capturedAt: '2026-08-01T00:00:00.000Z',
      },
    };
    // Legacy default without listing TZ: Europe/Helsinki → 20:00 local = 17:00 UTC.
    expect(bookingEligibleForReview(row, Date.parse('2026-09-01T17:01:00.000Z'))).toBe(true);
    // Listing extras TZ must win over Helsinki when snapshot has no departureTimezone.
    expect(
      bookingEligibleForReview(
        { ...row, departureTimezone: 'America/New_York' },
        Date.parse('2026-09-01T17:01:00.000Z')
      )
    ).toBe(false);
    expect(
      bookingEligibleForReview(
        { ...row, departureTimezone: 'America/New_York' },
        Date.parse('2026-09-02T00:01:00.000Z')
      )
    ).toBe(true);
  });

  it('unlocks stay review from check_out: notes when column is null (Phase 1328)', () => {
    const row = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-01',
      check_out: null as string | null,
      special_requests: 'check_out: 2026-09-03',
      purchase_snapshot: {
        listingTitle: 'Cabin',
        startTimeHm: '20:00',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: '2026-08-01T00:00:00.000Z',
      },
    };
    expect(bookingEligibleForReview(row, Date.parse('2026-09-02T12:00:00.000Z'))).toBe(false);
    expect(bookingEligibleForReview(row, Date.parse('2026-09-03T12:00:00.000Z'))).toBe(true);
  });
});
