import { describe, expect, it } from 'vitest';
import {
  buildPartnerUnifiedTourDepartureEvents,
  buildPartnerUnifiedStayBlockedEvents,
  buildPartnerUnifiedRentalOngoingEvents,
  buildPartnerUnifiedRentalBlockEvents,
  mergePartnerUnifiedVisibilityEvents,
} from './partner-unified-calendar-visibility';
import { buildPartnerUnifiedCalendarEvents } from './partner-unified-calendar';
import type { TourPackage } from '../types/tour';

function tourListing(): TourPackage {
  return {
    id: 'listing-tour',
    title: 'Aurora Tour',
    listingExtras: {
      inventoryFamily: 'tour',
      departureTimezone: 'Europe/Helsinki',
      bookingOptions: [
        {
          id: 'opt-a',
          name: 'Morning',
          availabilityDateFrom: '2026-10-01',
          availabilityDateTo: '2026-10-31',
          weekdays: [true, true, true, true, true, true, true],
          startTime: '09:00',
          maxSpotsPerSlot: 8,
        },
        {
          id: 'opt-b',
          name: 'Evening',
          availabilityDateFrom: '2026-10-01',
          availabilityDateTo: '2026-10-31',
          weekdays: [true, true, true, true, true, true, true],
          startTime: '20:00',
          maxSpotsPerSlot: 4,
        },
      ],
    },
  } as unknown as TourPackage;
}

function stayListing(): TourPackage {
  return {
    id: 'listing-stay',
    title: 'Cabin',
    listingExtras: { inventoryFamily: 'stay', departureTimezone: 'Europe/Helsinki' },
  } as unknown as TourPackage;
}

function rentalListing(): TourPackage {
  return {
    id: 'listing-rental',
    title: 'Camera',
    listingExtras: {
      inventoryFamily: 'rental',
      departureTimezone: 'Europe/Helsinki',
      rental: {
        variants: [{ id: 'v1', name: 'Body', quantity: 2 }],
        bufferMinutes: 60,
      },
    },
  } as unknown as TourPackage;
}

describe('partner-unified-calendar-visibility', () => {
  it('shows scheduled tour departures with zero bookings', () => {
    const events = buildPartnerUnifiedTourDepartureEvents({
      listings: [tourListing()],
      bookings: [],
      dayCaps: new Map(),
      fromYmd: '2026-10-10',
      toYmd: '2026-10-10',
      nowMs: Date.parse('2026-10-01T12:00:00+03:00'),
    });
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.kind === 'tour_departure')).toBe(true);
    expect(events.every((e) => e.bookingId === null)).toBe(true);
    expect(events.some((e) => e.remainingCount === 8 && e.capacityCount === 8)).toBe(true);
  });

  it('aggregates multiple bookings on the same departure into one row', () => {
    const bookings = [
      {
        id: 'b1',
        listing_id: 'listing-tour',
        status: 'confirmed',
        payment_status: 'paid',
        booking_date: '2026-10-10',
        start_time: '09:00',
        guests: 2,
        purchase_snapshot: { startTimeHm: '09:00', departureTimezone: 'Europe/Helsinki' },
      },
      {
        id: 'b2',
        listing_id: 'listing-tour',
        status: 'confirmed',
        payment_status: 'paid',
        booking_date: '2026-10-10',
        start_time: '09:00',
        guests: 3,
        purchase_snapshot: { startTimeHm: '09:00', departureTimezone: 'Europe/Helsinki' },
      },
    ];
    const departures = buildPartnerUnifiedTourDepartureEvents({
      listings: [tourListing()],
      bookings,
      dayCaps: new Map(),
      fromYmd: '2026-10-10',
      toYmd: '2026-10-10',
      nowMs: Date.parse('2026-10-01T12:00:00+03:00'),
    });
    const morning = departures.find((e) => e.timeHm === '09:00');
    expect(morning?.bookedCount).toBe(5);
    expect(morning?.capacityCount).toBe(8);
    expect(morning?.remainingCount).toBe(3);
    expect(morning?.departureStatus).toBe('available');
    expect(morning?.cutoffLabel).toBeTruthy();

    const bookingEvents = buildPartnerUnifiedCalendarEvents({
      bookings,
      fromYmd: '2026-10-10',
      toYmd: '2026-10-10',
    });
    const merged = mergePartnerUnifiedVisibilityEvents({
      bookingEvents,
      tourDepartures: departures,
      stayBlocked: [],
      rentalOngoing: [],
      rentalBlocks: [],
    });
    expect(merged.filter((e) => e.kind === 'tour')).toHaveLength(0);
    expect(merged.filter((e) => e.kind === 'tour_departure' && e.timeHm === '09:00')).toHaveLength(1);
  });

  it('marks closed and full departures from day caps and occupancy', () => {
    const caps = new Map([['listing-tour', new Map([['2026-10-10', 0]])]]);
    const closed = buildPartnerUnifiedTourDepartureEvents({
      listings: [tourListing()],
      bookings: [],
      dayCaps: caps,
      fromYmd: '2026-10-10',
      toYmd: '2026-10-10',
      nowMs: Date.parse('2026-10-01T12:00:00+03:00'),
    });
    expect(closed.every((e) => e.departureStatus === 'closed')).toBe(true);

    const full = buildPartnerUnifiedTourDepartureEvents({
      listings: [tourListing()],
      bookings: [
        {
          id: 'full',
          listing_id: 'listing-tour',
          status: 'confirmed',
          payment_status: 'paid',
          booking_date: '2026-10-10',
          start_time: '20:00',
          guests: 4,
          purchase_snapshot: { startTimeHm: '20:00', departureTimezone: 'Europe/Helsinki' },
        },
      ],
      dayCaps: new Map(),
      fromYmd: '2026-10-10',
      toYmd: '2026-10-10',
      nowMs: Date.parse('2026-10-01T12:00:00+03:00'),
    });
    const evening = full.find((e) => e.timeHm === '20:00');
    expect(evening?.departureStatus).toBe('sold_out');
  });

  it('emits stay blocked nights only when caps say blocked', () => {
    const events = buildPartnerUnifiedStayBlockedEvents({
      listing: stayListing(),
      bookings: [],
      caps: [
        { listing_id: 'listing-stay', available_date: '2026-10-12', capacity: 0 },
        { listing_id: 'listing-stay', available_date: '2026-10-13', capacity: 1 },
      ],
      fromYmd: '2026-10-12',
      toYmd: '2026-10-13',
      nowMs: Date.parse('2026-10-01T12:00:00Z'),
    });
    expect(events.map((e) => e.ymd)).toEqual(['2026-10-12']);
    expect(events[0]?.kind).toBe('stay_blocked');
  });

  it('adds rental ongoing days between collection and return', () => {
    const events = buildPartnerUnifiedRentalOngoingEvents({
      listing: rentalListing(),
      bookings: [
        {
          id: 'r1',
          listing_id: 'listing-rental',
          status: 'confirmed',
          payment_status: 'paid',
          guest_name: 'Alex',
          booking_date: '2026-10-10',
          check_out: '2026-10-13',
          purchase_snapshot: {
            inventoryFamily: 'rental',
            variantName: 'Body',
            quantity: 1,
            pickupAt: '2026-10-10T09:00:00+03:00',
            returnAt: '2026-10-13T18:00:00+03:00',
            departureTimezone: 'Europe/Helsinki',
          },
        },
      ],
      fromYmd: '2026-10-10',
      toYmd: '2026-10-13',
      nowMs: Date.parse('2026-10-01T12:00:00+03:00'),
    });
    expect(events.map((e) => e.ymd)).toEqual(['2026-10-11', '2026-10-12']);
    expect(events.every((e) => e.kind === 'rental_ongoing')).toBe(true);
  });

  it('marks rental blocked dates from availability blocks', () => {
    const events = buildPartnerUnifiedRentalBlockEvents({
      listing: rentalListing(),
      blocks: [
        {
          id: 'blk',
          listing_id: 'listing-rental',
          variant_id: null,
          starts_at: '2026-10-15T00:00:00.000Z',
          ends_at: '2026-10-17T00:00:00.000Z',
          note: null,
          created_at: '',
        },
      ],
      fromYmd: '2026-10-14',
      toYmd: '2026-10-17',
    });
    expect(events.map((e) => e.ymd)).toEqual(['2026-10-15', '2026-10-16']);
  });
});
