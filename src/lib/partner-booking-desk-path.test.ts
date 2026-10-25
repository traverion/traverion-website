import { describe, expect, it } from 'vitest';
import {
  partnerBookingDeskPath,
  partnerBookingDeskPathPreservingSearch,
  parsePartnerBookingIdFromPath,
  readPartnerBookingIdFromLocation,
} from './partner-booking-desk-path';

describe('partnerBookingDeskPath', () => {
  it('routes tours to Bookings, stays to Reservations, rentals to Rental bookings', () => {
    expect(partnerBookingDeskPath({ isStay: false, bookingId: 'b1' })).toBe('/partner/bookings/b1');
    expect(partnerBookingDeskPath({ isStay: true, bookingId: 'b2' })).toBe(
      '/partner/reservations/b2'
    );
    expect(partnerBookingDeskPath({ family: 'rental', bookingId: 'r1' })).toBe(
      '/partner/rental-bookings/r1'
    );
  });

  it('preserves ops filters when correcting the desk', () => {
    expect(
      partnerBookingDeskPathPreservingSearch({
        isStay: true,
        bookingId: 'stay-1',
        currentSearch: '?ops=cancel&view=all',
      })
    ).toBe('/partner/reservations/stay-1?ops=cancel&view=all');
  });

  it('reads booking ids from path and legacy query', () => {
    expect(parsePartnerBookingIdFromPath('/partner/bookings/abc-123')).toBe('abc-123');
    expect(parsePartnerBookingIdFromPath('/partner/reservations/stay-9')).toBe('stay-9');
    expect(parsePartnerBookingIdFromPath('/partner/rental-bookings/rent-1')).toBe('rent-1');
    expect(readPartnerBookingIdFromLocation('/partner/bookings', '?booking=legacy-1')).toBe(
      'legacy-1'
    );
    expect(readPartnerBookingIdFromLocation('/partner/bookings/path-1', '?booking=legacy-1')).toBe(
      'path-1'
    );
  });
});
