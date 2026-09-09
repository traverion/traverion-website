import { describe, expect, it } from 'vitest';
import { bookingOccupiesInventory, bookingOccupiesPublicStayCalendar, CHECKOUT_HOLD_MINUTES, tourCheckoutOccupiedGuests } from './booking-hold';
import { bookingOccupiesInventory as checkoutSessionOccupiesInventory, tourCheckoutOccupiedGuests as checkoutTourOccupiedGuests } from '../../supabase/functions/_shared/booking-hold';

describe('booking inventory holds', () => {
  const now = Date.parse('2026-09-08T12:00:00.000Z');

  it('treats paid bookings as occupying until cancelled or refunded', () => {
    expect(
      bookingOccupiesInventory({ status: 'confirmed', payment_status: 'paid' }, now)
    ).toBe(true);
    expect(
      bookingOccupiesInventory({ status: 'confirmed', payment_status: 'complete' }, now)
    ).toBe(true);
    expect(
      bookingOccupiesInventory({ status: 'confirmed', payment_status: 'succeeded' }, now)
    ).toBe(true);
    expect(
      bookingOccupiesInventory({ status: 'cancelled', payment_status: 'paid' }, now)
    ).toBe(false);
    expect(
      bookingOccupiesInventory({ status: 'confirmed', payment_status: 'refunded' }, now)
    ).toBe(false);
  });

  it('does not let refunded or failed guests fill tour checkout capacity', () => {
    const rows = [
      { id: '5', status: 'confirmed', payment_status: 'paid', booking_date: '2026-09-11', guests: 1 },
      { id: 'refunded', status: 'confirmed', payment_status: 'refunded', booking_date: '2026-10-15', guests: 8 },
      { id: '15', status: 'pending', payment_status: 'failed', booking_date: '2026-10-15', guests: 8 },
      { id: '19', status: 'cancelled', payment_status: 'paid', booking_date: '2026-11-04', guests: 1 },
    ];
    expect(tourCheckoutOccupiedGuests(rows, '2026-10-15', null, now)).toBe(0);
    expect(tourCheckoutOccupiedGuests(rows, '2026-11-04', null, now)).toBe(0);
    expect(tourCheckoutOccupiedGuests(rows, '2026-09-11', null, now)).toBe(1);
    expect(checkoutTourOccupiedGuests(rows, '2026-10-15', null, now)).toBe(
      tourCheckoutOccupiedGuests(rows, '2026-10-15', null, now)
    );
  });

  it('keeps checkout-session occupancy in sync with the app helper', () => {
    const rows = [
      { status: 'confirmed', payment_status: 'paid' },
      { status: 'confirmed', payment_status: 'complete' },
      { status: 'confirmed', payment_status: 'succeeded' },
      { status: 'cancelled', payment_status: 'paid' },
      { status: 'confirmed', payment_status: 'refunded' },
      { status: 'pending', payment_status: 'pending', hold_expires_at: '2026-09-08T12:20:00.000Z' },
      { status: 'pending', payment_status: 'failed' },
    ];
    for (const row of rows) {
      expect(checkoutSessionOccupiesInventory(row, now)).toBe(bookingOccupiesInventory(row, now));
    }
  });

  it('releases pending holds after hold_expires_at', () => {
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: '2026-09-08T12:20:00.000Z',
        },
        now
      )
    ).toBe(true);
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: '2026-09-08T11:59:00.000Z',
        },
        now
      )
    ).toBe(false);
  });

  it('does not let failed or expired-legacy pending occupy inventory', () => {
    expect(
      bookingOccupiesInventory({ status: 'pending', payment_status: 'failed' }, now)
    ).toBe(false);
    expect(CHECKOUT_HOLD_MINUTES).toBe(30);
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: null,
          created_at: '2026-09-08T10:00:00.000Z',
        },
        now
      )
    ).toBe(false);
  });

  it('does not paint unpaid, failed, or refunded bookings on the public stay calendar', () => {
    expect(
      bookingOccupiesPublicStayCalendar({ status: 'pending', payment_status: 'pending' })
    ).toBe(false);
    expect(
      bookingOccupiesPublicStayCalendar({ status: 'pending', payment_status: 'failed' })
    ).toBe(false);
    expect(
      bookingOccupiesPublicStayCalendar({ status: 'confirmed', payment_status: 'paid' })
    ).toBe(true);
    expect(
      bookingOccupiesPublicStayCalendar({ status: 'cancelled', payment_status: 'paid' })
    ).toBe(false);
    expect(
      bookingOccupiesPublicStayCalendar({ status: 'confirmed', payment_status: 'refunded' })
    ).toBe(false);
  });
});
