import { describe, expect, it } from 'vitest';
import {
  occupyingGuestsForBookingOption,
  occupyingGuestsForOptionDeparture,
  removeBookingOptionOccupancyNotice,
  removeScheduleOccupancyNotice,
} from './schedule-edit-impact';

const listingId = 'listing-1';
const optionId = 'opt-1';

describe('occupyingGuestsForOptionDeparture', () => {
  it('sums occupying guests for matching option + departure', () => {
    const n = occupyingGuestsForOptionDeparture({
      listingId,
      optionId,
      startTimeHm: '08:00',
      bookings: [
        {
          listing_id: listingId,
          booking_option_id: optionId,
          start_time: '08:00:00',
          guests: 3,
          status: 'confirmed',
          payment_status: 'paid',
        },
        {
          listing_id: listingId,
          booking_option_id: optionId,
          start_time: '20:00:00',
          guests: 2,
          status: 'confirmed',
          payment_status: 'paid',
        },
        {
          listing_id: listingId,
          booking_option_id: 'other',
          start_time: '08:00:00',
          guests: 4,
          status: 'confirmed',
          payment_status: 'paid',
        },
      ],
    });
    expect(n).toBe(3);
  });

  it('keeps occupancy on purchased departure when ops edited start_time (Phase 1072)', () => {
    const n = occupyingGuestsForOptionDeparture({
      listingId,
      optionId,
      startTimeHm: '08:00',
      bookings: [
        {
          listing_id: listingId,
          booking_option_id: optionId,
          start_time: '14:00:00',
          purchase_snapshot: {
            listingTitle: 'Tour',
            startTimeHm: '08:00',
            capturedAt: '2026-09-01T00:00:00.000Z',
          },
          guests: 3,
          status: 'confirmed',
          payment_status: 'paid',
        },
      ],
    });
    expect(n).toBe(3);
    expect(
      occupyingGuestsForOptionDeparture({
        listingId,
        optionId,
        startTimeHm: '14:00',
        bookings: [
          {
            listing_id: listingId,
            booking_option_id: optionId,
            start_time: '14:00:00',
            purchase_snapshot: {
              listingTitle: 'Tour',
              startTimeHm: '08:00',
              capturedAt: '2026-09-01T00:00:00.000Z',
            },
            guests: 3,
            status: 'confirmed',
            payment_status: 'paid',
          },
        ],
      })
    ).toBe(0);
  });

  it('ignores cancelled and non-occupying payment states', () => {
    const n = occupyingGuestsForOptionDeparture({
      listingId,
      optionId,
      startTimeHm: '08:00',
      bookings: [
        {
          listing_id: listingId,
          booking_option_id: optionId,
          start_time: '08:00',
          guests: 5,
          status: 'cancelled',
          payment_status: 'paid',
        },
        {
          listing_id: listingId,
          booking_option_id: optionId,
          start_time: '08:00',
          guests: 2,
          status: 'confirmed',
          payment_status: 'failed',
        },
      ],
    });
    expect(n).toBe(0);
  });
});

describe('occupyingGuestsForBookingOption', () => {
  it('sums across departures for the option', () => {
    const n = occupyingGuestsForBookingOption({
      listingId,
      optionId,
      bookings: [
        {
          listing_id: listingId,
          booking_option_id: optionId,
          start_time: '08:00',
          guests: 3,
          status: 'confirmed',
          payment_status: 'paid',
        },
        {
          listing_id: listingId,
          booking_option_id: optionId,
          start_time: '20:00',
          guests: 2,
          status: 'confirmed',
          payment_status: 'paid',
        },
      ],
    });
    expect(n).toBe(5);
  });
});

describe('removeScheduleOccupancyNotice', () => {
  it('returns null when nobody occupies', () => {
    expect(removeScheduleOccupancyNotice(0)).toBeNull();
  });

  it('names the departure when guests occupy', () => {
    expect(removeScheduleOccupancyNotice(2, '08:00')).toMatch(/2 guests/);
    expect(removeScheduleOccupancyNotice(2, '08:00')).toMatch(/08:00/);
    expect(removeScheduleOccupancyNotice(2, '08:00')).toMatch(/will not cancel/);
  });
});

describe('removeBookingOptionOccupancyNotice', () => {
  it('warns when option still has guests', () => {
    expect(removeBookingOptionOccupancyNotice(1)).toMatch(/1 guest/);
    expect(removeBookingOptionOccupancyNotice(0)).toBeNull();
  });
});
