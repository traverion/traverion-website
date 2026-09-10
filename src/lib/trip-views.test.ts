import { describe, expect, it } from 'vitest';
import {
  bookingIsCancelledTrip,
  bookingMatchesTripView,
  partnerBookingIsLiveTrip,
  partnerBookingIsOperatingTrip,
  partnerBookingNeedsLook,
  partnerBookingIsTodaySchedule,
  partnerBookingIsUpcomingSchedule,
  travelerTripIsLive,
  travelerBookingNeedsPayNow,
  partnerBookingIsUnpaidCheckout,
  partnerBookingShowsCancelAction,
  sortTravelerCancelledTrips,
} from './trip-views';

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
    expect(travelerTripIsLive(refundedStay)).toBe(false);
    expect(partnerBookingIsUnpaidCheckout(refundedStay)).toBe(false);
    expect(partnerBookingIsUnpaidCheckout({ status: 'pending', payment_status: 'pending' })).toBe(true);
    expect(partnerBookingIsUnpaidCheckout({ status: 'cancelled', payment_status: 'pending' })).toBe(false);
    expect(travelerTripIsLive({ status: 'pending', payment_status: 'pending' })).toBe(true);
    expect(travelerTripIsLive({ status: 'confirmed', payment_status: 'paid' })).toBe(true);
    expect(travelerBookingNeedsPayNow({ status: 'pending', payment_status: 'pending' })).toBe(true);
    expect(travelerBookingNeedsPayNow({ status: 'confirmed', payment_status: 'paid' })).toBe(false);
    expect(travelerBookingNeedsPayNow({ status: 'pending', payment_status: 'failed' })).toBe(true);
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

  it('lists recoverable payment-failed holds in Upcoming for Pay now', () => {
    const failed = { status: 'pending', payment_status: 'failed', booking_date: '2026-10-10' };
    expect(bookingMatchesTripView(failed, 'upcoming', today)).toBe(true);
    expect(bookingMatchesTripView(failed, 'cancelled', today)).toBe(false);
    expect(travelerBookingNeedsPayNow(failed)).toBe(true);
    expect(travelerTripIsLive(failed)).toBe(true);
    expect(partnerBookingIsLiveTrip(failed)).toBe(false);
  });

  it('does not list non-pending payment-failed rows as trips', () => {
    const failedConfirmed = { status: 'confirmed', payment_status: 'failed', booking_date: '2026-10-10' };
    expect(bookingMatchesTripView(failedConfirmed, 'upcoming', today)).toBe(false);
    expect(travelerBookingNeedsPayNow(failedConfirmed)).toBe(false);
  });

  it('does not treat payment-failed checkouts as live partner trips', () => {
    expect(partnerBookingIsLiveTrip({ payment_status: 'failed' })).toBe(false);
    expect(partnerBookingIsLiveTrip({ payment_status: 'pending' })).toBe(true);
    expect(partnerBookingIsLiveTrip({ payment_status: 'paid' })).toBe(true);
  });

  it('does not treat refunded, cancelled, or unpaid checkouts as partner operating work', () => {
    expect(
      partnerBookingIsOperatingTrip({ status: 'confirmed', payment_status: 'refunded' })
    ).toBe(false);
    expect(
      partnerBookingIsOperatingTrip({ status: 'cancelled', payment_status: 'paid' })
    ).toBe(false);
    expect(
      partnerBookingIsOperatingTrip({ status: 'confirmed', payment_status: 'paid' })
    ).toBe(true);
    expect(
      partnerBookingIsOperatingTrip({ status: 'pending', payment_status: 'pending' })
    ).toBe(false);
    expect(
      partnerBookingNeedsLook({
        acknowledged_at: null,
        status: 'pending',
        payment_status: 'pending',
      })
    ).toBe(false);
  });

  it('does not put unpaid checkout holds on Today or the upcoming strip', () => {
    const unpaidToday = {
      status: 'pending',
      payment_status: 'pending',
      booking_date: '2026-09-11',
      hold_expires_at: '2099-01-01T00:00:00.000Z',
    };
    expect(partnerBookingIsTodaySchedule(unpaidToday, '2026-09-11')).toBe(false);
    expect(partnerBookingIsUpcomingSchedule(unpaidToday, '2026-09-09')).toBe(false);
    expect(travelerTripIsLive(unpaidToday)).toBe(true);
    expect(partnerBookingShowsCancelAction(unpaidToday)).toBe(true);
    expect(
      partnerBookingShowsCancelAction({ status: 'confirmed', payment_status: 'paid' })
    ).toBe(true);
    expect(
      partnerBookingShowsCancelAction({ status: 'cancelled', payment_status: 'pending' })
    ).toBe(false);
  });

  it('does not ask the partner to look at cancelled or refunded trips', () => {
    expect(
      partnerBookingNeedsLook({
        acknowledged_at: null,
        status: 'confirmed',
        payment_status: 'refunded',
      })
    ).toBe(false);
    expect(
      partnerBookingNeedsLook({
        acknowledged_at: null,
        status: 'cancelled',
        payment_status: 'paid',
      })
    ).toBe(false);
    expect(
      partnerBookingNeedsLook({
        acknowledged_at: null,
        status: 'confirmed',
        payment_status: 'paid',
      })
    ).toBe(true);
    expect(
      partnerBookingNeedsLook({
        acknowledged_at: '2026-09-08T12:00:00Z',
        status: 'confirmed',
        payment_status: 'paid',
      })
    ).toBe(false);
  });

  it('does not put refunded bookings on Today or the upcoming strip', () => {
    const refundedToday = {
      status: 'confirmed',
      payment_status: 'refunded',
      booking_date: '2026-10-10',
    };
    expect(partnerBookingIsTodaySchedule(refundedToday, '2026-10-10')).toBe(false);
    expect(partnerBookingIsUpcomingSchedule(refundedToday, '2026-09-09')).toBe(false);
    expect(
      partnerBookingIsTodaySchedule(
        { status: 'confirmed', payment_status: 'paid', booking_date: '2026-09-11' },
        '2026-09-11'
      )
    ).toBe(true);
  });

  it('sorts Refund due cancelled trips before other cancelled rows', () => {
    const sorted = sortTravelerCancelledTrips([
      { status: 'cancelled', payment_status: 'refunded', booking_date: '2026-12-01' },
      { status: 'cancelled', payment_status: 'paid', booking_date: '2026-11-11' },
      { status: 'cancelled', payment_status: 'paid', booking_date: '2026-11-18' },
      {
        status: 'cancelled',
        payment_status: 'paid',
        booking_date: '2026-10-01',
        refund_choice: 'no_refund',
      },
    ]);
    expect(sorted.map((r) => r.booking_date)).toEqual([
      '2026-11-18',
      '2026-11-11',
      '2026-12-01',
      '2026-10-01',
    ]);
  });
});
