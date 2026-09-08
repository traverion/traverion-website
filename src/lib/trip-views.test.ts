import { describe, expect, it } from 'vitest';
import { bookingIsCancelledTrip, bookingMatchesTripView } from './trip-views';

const today = '2026-09-08';

describe('trip list views', () => {
  it('keeps refunded bookings out of Upcoming even if status is not cancelled', () => {
    const refundedStay = {
      status: 'confirmed',
      payment_status: 'refunded',
      booking_date: '2026-10-10',
    };
    expect(bookingIsCancelledTrip(refundedStay)).toBe(true);
    expect(bookingMatchesTripView(refundedStay, 'upcoming', today)).toBe(false);
    expect(bookingMatchesTripView(refundedStay, 'cancelled', today)).toBe(true);
  });

  it('keeps confirmed paid future trips in Upcoming', () => {
    const paid = { status: 'confirmed', payment_status: 'paid', booking_date: '2026-09-11' };
    expect(bookingMatchesTripView(paid, 'upcoming', today)).toBe(true);
    expect(bookingMatchesTripView(paid, 'cancelled', today)).toBe(false);
  });

  it('still lists unpaid checkout that is pending, not failed', () => {
    const pending = { status: 'pending', payment_status: 'pending', booking_date: '2026-10-10' };
    expect(bookingMatchesTripView(pending, 'upcoming', today)).toBe(true);
  });

  it('does not list payment-failed checkouts as Upcoming or Cancelled trips', () => {
    const failed = { status: 'pending', payment_status: 'failed', booking_date: '2026-10-10' };
    expect(bookingMatchesTripView(failed, 'upcoming', today)).toBe(false);
    expect(bookingMatchesTripView(failed, 'past', today)).toBe(false);
    expect(bookingMatchesTripView(failed, 'cancelled', today)).toBe(false);
  });
});
