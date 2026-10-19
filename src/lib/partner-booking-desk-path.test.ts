import { describe, expect, it } from 'vitest';
import {
  partnerBookingDeskPath,
  partnerBookingDeskPathPreservingSearch,
} from './partner-booking-desk-path';

describe('partnerBookingDeskPath', () => {
  it('routes tours to Bookings and stays to Reservations', () => {
    expect(partnerBookingDeskPath({ isStay: false, bookingId: 'b1' })).toBe(
      '/partner/bookings?booking=b1'
    );
    expect(partnerBookingDeskPath({ isStay: true, bookingId: 'b2' })).toBe(
      '/partner/reservations?booking=b2'
    );
  });

  it('preserves ops filters when correcting the desk', () => {
    expect(
      partnerBookingDeskPathPreservingSearch({
        isStay: true,
        bookingId: 'stay-1',
        currentSearch: '?ops=cancel&view=all',
      })
    ).toBe('/partner/reservations?ops=cancel&view=all&booking=stay-1');
  });
});
