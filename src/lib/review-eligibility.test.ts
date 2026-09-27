import { describe, expect, it } from 'vitest';
import { bookingEligibleForReview } from './review-eligibility';

describe('bookingEligibleForReview', () => {
  const pastTour = {
    status: 'confirmed',
    payment_status: 'paid',
    booking_date: '2026-09-01',
    start_time: '20:00:00',
  };

  it('allows paid confirmed tour after start', () => {
    const now = Date.parse('2026-09-02T00:00:00.000Z');
    expect(bookingEligibleForReview(pastTour, now)).toBe(true);
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
    expect(
      bookingEligibleForReview(pastTour, Date.parse('2026-08-01T00:00:00.000Z'))
    ).toBe(false);
  });
});
