import { describe, expect, it } from 'vitest';
import {
  bookingIsCancelledTrip,
  bookingMatchesTripView,
  partnerBookingIsLiveTrip,
  partnerBookingIsOperatingTrip,
  partnerBookingNeedsLook,
  partnerBookingIsTodaySchedule,
  partnerBookingIsUpcomingSchedule,
  partnerBookingIsPastSchedule,
  travelerTripIsLive,
  bookingAppearsInTravelerTrips,
  travelerBookingNeedsPayNow,
  travelerTripReferenceLabel,
  partnerBookingIsUnpaidCheckout,
  partnerBookingIsActiveUnpaidCheckout,
  partnerBookingShowsCancelAction,
  sortTravelerCancelledTrips,
  scheduleTodayIsoForBooking,
  partnerTourMatchesExperienceDayOffset,
  pickupMissingIsUrgentSoon,
  tripAllowsBrowseLiveListing,
  tripAllowsLeaveReview,
} from './trip-views';

const today = '2026-09-08';

describe('trip list views', () => {
  it('counts cancelled and refund-due trips for Account hub (Phase 1372)', () => {
    const refundDue = { status: 'cancelled', payment_status: 'paid', booking_date: '2026-10-01' };
    const refunded = { status: 'confirmed', payment_status: 'refunded', booking_date: '2026-09-05' };
    const nowMs = Date.parse(`${today}T12:00:00.000Z`);
    expect(travelerTripIsLive(refundDue)).toBe(false);
    expect(travelerTripIsLive(refunded)).toBe(false);
    expect(bookingAppearsInTravelerTrips(refundDue, nowMs)).toBe(true);
    expect(bookingAppearsInTravelerTrips(refunded, nowMs)).toBe(true);
    const failedConfirmed = { status: 'confirmed', payment_status: 'failed', booking_date: '2026-10-10' };
    expect(bookingAppearsInTravelerTrips(failedConfirmed, nowMs)).toBe(false);
  });

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
    const nowMs = Date.parse(`${today}T12:00:00.000Z`);
    expect(
      partnerBookingIsActiveUnpaidCheckout(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: new Date(nowMs + 15 * 60 * 1000).toISOString(),
        },
        nowMs
      )
    ).toBe(true);
    expect(
      partnerBookingIsActiveUnpaidCheckout(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: new Date(nowMs - 5 * 60 * 1000).toISOString(),
        },
        nowMs
      )
    ).toBe(false);
    expect(travelerTripIsLive({ status: 'pending', payment_status: 'pending' })).toBe(true);
    expect(travelerTripIsLive({ status: 'confirmed', payment_status: 'paid' })).toBe(true);
    expect(travelerBookingNeedsPayNow({ status: 'pending', payment_status: 'pending' })).toBe(true);
    expect(travelerBookingNeedsPayNow({ status: 'confirmed', payment_status: 'paid' })).toBe(false);
    expect(travelerBookingNeedsPayNow({ status: 'pending', payment_status: 'failed' })).toBe(true);
    expect(travelerTripReferenceLabel(42)).toBe('Ref #42');
    expect(travelerTripReferenceLabel(0)).toBe(null);
    expect(travelerTripReferenceLabel(null)).toBe(null);
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

  it('keeps mid-stay nights on Today and future check-ins on Upcoming', () => {
    const stay = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-20',
      check_out: '2026-09-23',
    };
    expect(partnerBookingIsTodaySchedule(stay, '2026-09-20')).toBe(true);
    expect(partnerBookingIsTodaySchedule(stay, '2026-09-21')).toBe(true);
    expect(partnerBookingIsTodaySchedule(stay, '2026-09-22')).toBe(true);
    expect(partnerBookingIsTodaySchedule(stay, '2026-09-23')).toBe(true);
    expect(partnerBookingIsTodaySchedule(stay, '2026-09-24')).toBe(false);
    expect(partnerBookingIsUpcomingSchedule(stay, '2026-09-19')).toBe(true);
    expect(partnerBookingIsUpcomingSchedule(stay, '2026-09-20')).toBe(false);
    expect(partnerBookingIsUpcomingSchedule(stay, '2026-09-21')).toBe(false);
  });

  it('puts only finished stays in Past — not cancelled mid-stays', () => {
    const midCancelled = {
      status: 'cancelled',
      payment_status: 'paid',
      booking_date: '2026-09-20',
      check_out: '2026-09-25',
    };
    const finishedCancelled = {
      status: 'cancelled',
      payment_status: 'paid',
      booking_date: '2026-09-10',
      check_out: '2026-09-12',
    };
    const operatingFinished = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-10',
      check_out: '2026-09-12',
    };
    expect(partnerBookingIsPastSchedule(midCancelled, '2026-09-22')).toBe(false);
    expect(partnerBookingIsPastSchedule(finishedCancelled, '2026-09-22')).toBe(true);
    expect(partnerBookingIsPastSchedule(operatingFinished, '2026-09-22')).toBe(true);
    expect(partnerBookingIsPastSchedule(operatingFinished, '2026-09-12')).toBe(false);
    expect(partnerBookingIsTodaySchedule(operatingFinished, '2026-09-12')).toBe(true);
    expect(
      partnerBookingIsPastSchedule(
        { status: 'cancelled', payment_status: 'paid', booking_date: '2026-09-30' },
        '2026-09-22'
      )
    ).toBe(false);
  });

  it('keeps traveler mid-stay trips in Upcoming until after check-out day', () => {
    const stay = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-18',
      check_out: '2026-09-23',
    };
    expect(bookingMatchesTripView(stay, 'upcoming', '2026-09-20')).toBe(true);
    expect(bookingMatchesTripView(stay, 'past', '2026-09-20')).toBe(false);
    expect(bookingMatchesTripView(stay, 'upcoming', '2026-09-23')).toBe(true);
    expect(bookingMatchesTripView(stay, 'past', '2026-09-23')).toBe(false);
    expect(bookingMatchesTripView(stay, 'upcoming', '2026-09-24')).toBe(false);
    expect(bookingMatchesTripView(stay, 'past', '2026-09-24')).toBe(true);
  });

  it('classifies nights-only stays as stays for Trips Upcoming/Past (Phase 1324)', () => {
    const stayNightsOnly = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-18',
      check_out: null as string | null,
      nights: 5,
      special_requests: null as string | null,
    };
    // check-out derived as 2026-09-23; mid-stay must stay Upcoming
    expect(bookingMatchesTripView(stayNightsOnly, 'upcoming', '2026-09-20')).toBe(true);
    expect(bookingMatchesTripView(stayNightsOnly, 'past', '2026-09-20')).toBe(false);
    expect(bookingMatchesTripView(stayNightsOnly, 'upcoming', '2026-09-23')).toBe(true);
    expect(bookingMatchesTripView(stayNightsOnly, 'past', '2026-09-24')).toBe(true);
    expect(partnerBookingIsTodaySchedule(stayNightsOnly, '2026-09-20')).toBe(true);
    expect(partnerBookingIsPastSchedule(stayNightsOnly, '2026-09-20')).toBe(false);
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

  it('buckets trips with experience-local today when snapshot TZ differs from UTC (Phase 1074)', () => {
    const nowMs = Date.parse('2026-09-15T22:30:00.000Z');
    const helsinkiTour = {
      status: 'confirmed',
      payment_status: 'paid',
      booking_date: '2026-09-16',
      purchase_snapshot: {
        listingTitle: 'Aurora',
        departureTimezone: 'Europe/Helsinki',
        capturedAt: 't',
      },
    };
    expect(scheduleTodayIsoForBooking(helsinkiTour, nowMs)).toBe('2026-09-16');
    expect(bookingMatchesTripView(helsinkiTour, 'upcoming', undefined, nowMs)).toBe(true);
    expect(bookingMatchesTripView(helsinkiTour, 'past', undefined, nowMs)).toBe(false);
    expect(
      partnerBookingIsTodaySchedule(helsinkiTour, scheduleTodayIsoForBooking(helsinkiTour, nowMs), nowMs)
    ).toBe(true);
  });

  it('matches pickup Today/Tomorrow to experience-local day, not browser UTC (Phase 1085)', () => {
    // 22:30 UTC = already 01:30 next calendar day in Helsinki.
    const nowMs = Date.parse('2026-09-15T22:30:00.000Z');
    const snap = {
      listingTitle: 'Aurora',
      departureTimezone: 'Europe/Helsinki',
      capturedAt: 't',
    };
    expect(
      partnerTourMatchesExperienceDayOffset(
        { booking_date: '2026-09-16', purchase_snapshot: snap },
        0,
        nowMs
      )
    ).toBe(true);
    expect(
      partnerTourMatchesExperienceDayOffset(
        { booking_date: '2026-09-15', purchase_snapshot: snap },
        0,
        nowMs
      )
    ).toBe(false);
    expect(
      partnerTourMatchesExperienceDayOffset(
        { booking_date: '2026-09-17', purchase_snapshot: snap },
        1,
        nowMs
      )
    ).toBe(true);
  });

  it('flags pickup urgency on experience-local today/tomorrow, not browser hours (Phase 1116)', () => {
    const nowMs = Date.parse('2026-09-15T22:30:00.000Z');
    const snap = {
      listingTitle: 'Aurora',
      departureTimezone: 'Europe/Helsinki',
      capturedAt: 't',
    };
    expect(
      pickupMissingIsUrgentSoon({ booking_date: '2026-09-16', purchase_snapshot: snap }, true, nowMs)
    ).toBe(true);
    expect(
      pickupMissingIsUrgentSoon({ booking_date: '2026-09-17', purchase_snapshot: snap }, true, nowMs)
    ).toBe(true);
    expect(
      pickupMissingIsUrgentSoon({ booking_date: '2026-09-15', purchase_snapshot: snap }, true, nowMs)
    ).toBe(false);
    expect(
      pickupMissingIsUrgentSoon({ booking_date: '2026-09-16', purchase_snapshot: snap }, false, nowMs)
    ).toBe(false);
    expect(
      pickupMissingIsUrgentSoon({ booking_date: '2026-09-22', purchase_snapshot: snap }, true, nowMs)
    ).toBe(false);
  });

  it('only offers browse-live from Trips when listing is published (Phase 1086)', () => {
    expect(tripAllowsBrowseLiveListing({ status: 'published' })).toBe(true);
    expect(tripAllowsBrowseLiveListing({ status: 'draft' })).toBe(false);
    expect(tripAllowsBrowseLiveListing({ status: null })).toBe(false);
    expect(tripAllowsBrowseLiveListing(undefined)).toBe(false);
  });

  it('hides browse-live for published tours with ended seasons (Phase 1277)', () => {
    expect(
      tripAllowsBrowseLiveListing({
        status: 'published',
        listing_extras: {
          inventoryFamily: 'tour',
          departureTimezone: 'Europe/Helsinki',
          bookingOptions: [
            {
              id: 'ended',
              name: 'Ended',
              priceUsd: 99,
              startTime: '20:00',
              weekdays: [true, true, true, true, true, true, true],
              schedules: [
                {
                  id: 'sch-1',
                  name: 'Past',
                  availabilityDateFrom: '2020-01-01',
                  availabilityDateTo: '2020-12-31',
                  weekdays: [true, true, true, true, true, true, true],
                  startTime: '20:00',
                  priceUsd: 99,
                  minPersons: 1,
                  maxPersons: 8,
                  maxSpotsPerSlot: 8,
                  status: 'ready',
                },
              ],
            },
          ],
        },
      })
    ).toBe(false);
    expect(
      tripAllowsBrowseLiveListing({
        status: 'published',
        listing_extras: { inventoryFamily: 'stay' },
      })
    ).toBe(true);
  });

  it('Phase 1709: Leave a review allowed for published tours even when season ended', () => {
    expect(tripAllowsLeaveReview({ status: 'published' })).toBe(true);
    expect(tripAllowsLeaveReview({ status: 'draft' })).toBe(false);
    expect(tripAllowsLeaveReview(null)).toBe(false);
  });
});
