import { describe, expect, it } from 'vitest';
import { bookingOccupiesInventory, bookingOccupiesPublicStayCalendar, CHECKOUT_HOLD_MINUTES, tourCheckoutOccupiedGuests, formatPartnerCheckoutHoldLabel } from './booking-hold';
import { partnerTourRemainingSpots } from './availability-ops';
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
    expect(partnerTourRemainingSpots(8, tourCheckoutOccupiedGuests(rows, '2026-10-15', null, now))).toBe(8);
    expect(partnerTourRemainingSpots(8, tourCheckoutOccupiedGuests(rows, '2026-11-04', null, now))).toBe(8);
    expect(partnerTourRemainingSpots(8, tourCheckoutOccupiedGuests(rows, '2026-09-11', null, now))).toBe(7);
  });

  it('scopes same-day occupancy to the selected departure time', () => {
    const rows = [
      {
        id: 'am',
        status: 'confirmed',
        payment_status: 'paid',
        booking_date: '2026-09-15',
        guests: 4,
        start_time: '09:00:00',
      },
      {
        id: 'pm',
        status: 'confirmed',
        payment_status: 'paid',
        booking_date: '2026-09-15',
        guests: 3,
        start_time: '19:00',
      },
    ];
    expect(tourCheckoutOccupiedGuests(rows, '2026-09-15', null, now)).toBe(7);
    expect(tourCheckoutOccupiedGuests(rows, '2026-09-15', null, now, '09:00')).toBe(4);
    expect(tourCheckoutOccupiedGuests(rows, '2026-09-15', null, now, '19:00')).toBe(3);
    expect(checkoutTourOccupiedGuests(rows, '2026-09-15', null, now, '09:00')).toBe(4);
  });

  it('keeps occupancy on purchased departure when ops edits start_time (Phase 1072)', () => {
    const rows = [
      {
        id: 'moved',
        status: 'confirmed',
        payment_status: 'paid',
        booking_date: '2026-09-15',
        guests: 4,
        start_time: '14:00:00',
        purchase_snapshot: {
          listingTitle: 'Aurora',
          startTimeHm: '09:00',
          capturedAt: '2026-09-01T00:00:00.000Z',
        },
      },
    ];
    expect(tourCheckoutOccupiedGuests(rows, '2026-09-15', null, now, '09:00')).toBe(4);
    expect(tourCheckoutOccupiedGuests(rows, '2026-09-15', null, now, '14:00')).toBe(0);
    expect(checkoutTourOccupiedGuests(rows, '2026-09-15', null, now, '09:00')).toBe(4);
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

  it('honors resumed checkout hold_expires_at even when created_at is old', () => {
    // Resume refreshes Stripe expiry without rewriting created_at.
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'pending',
          created_at: '2026-09-08T09:00:00.000Z',
          hold_expires_at: '2026-09-08T12:25:00.000Z',
        },
        now
      )
    ).toBe(true);
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'pending',
          created_at: '2026-09-08T09:00:00.000Z',
          hold_expires_at: '2026-09-08T11:50:00.000Z',
        },
        now
      )
    ).toBe(false);
    // Without hold_expires_at, created_at + 30m would wrongly release a live resume.
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'pending',
          created_at: '2026-09-08T09:00:00.000Z',
          hold_expires_at: null,
        },
        now
      )
    ).toBe(false);
  });

  it('formats partner checkout hold labels for live vs expired holds', () => {
    expect(
      formatPartnerCheckoutHoldLabel(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: '2026-09-08T12:20:00.000Z',
        },
        now
      )
    ).toMatch(/Checkout hold · until /);
    expect(
      formatPartnerCheckoutHoldLabel(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: '2026-09-08T11:50:00.000Z',
        },
        now
      )
    ).toBe('Hold expired · inventory released');
    expect(
      formatPartnerCheckoutHoldLabel({ status: 'confirmed', payment_status: 'paid' }, now)
    ).toBeNull();
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

  it('public stay calendar matches checkout occupancy (paid + live holds)', () => {
    const now = Date.parse('2026-09-27T12:00:00.000Z');
    expect(
      bookingOccupiesPublicStayCalendar(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: '2026-09-27T12:20:00.000Z',
        },
        now
      )
    ).toBe(true);
    expect(
      bookingOccupiesPublicStayCalendar(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: '2026-09-27T11:59:00.000Z',
        },
        now
      )
    ).toBe(false);
    expect(
      bookingOccupiesPublicStayCalendar({ status: 'pending', payment_status: 'failed' }, now)
    ).toBe(false);
    expect(
      bookingOccupiesPublicStayCalendar({ status: 'confirmed', payment_status: 'paid' }, now)
    ).toBe(true);
    expect(
      bookingOccupiesPublicStayCalendar({ status: 'cancelled', payment_status: 'paid' }, now)
    ).toBe(false);
    expect(
      bookingOccupiesPublicStayCalendar({ status: 'confirmed', payment_status: 'refunded' }, now)
    ).toBe(false);
  });
});
