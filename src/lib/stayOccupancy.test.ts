import { describe, expect, it } from 'vitest';
import {
  nightsOccupiedByStay,
  parseStayCheckOutFromNotes,
  stayDateRangesOverlap,
  stayNightIsOperatorBlocked,
  stayRangeFromBooking,
  partnerStayDayKind,
} from './stayOccupancy';
import { stayNightIsOperatorBlocked as checkoutStayNightIsOperatorBlocked } from '../../supabase/functions/_shared/booking-quote';

describe('stay occupancy', () => {
  it('occupies nights exclusive of check-out', () => {
    expect(nightsOccupiedByStay('2026-09-10', '2026-09-13')).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
  });

  it('parses check_out from booking notes', () => {
    expect(parseStayCheckOutFromNotes('Guest phone: +1\n\ncheck_out: 2026-09-13')).toBe('2026-09-13');
    expect(parseStayCheckOutFromNotes('no dates')).toBeNull();
  });

  it('detects overlapping stay ranges and allows back-to-back check-out/check-in', () => {
    expect(stayDateRangesOverlap('2026-09-10', '2026-09-13', '2026-09-12', '2026-09-14')).toBe(true);
    expect(stayDateRangesOverlap('2026-09-10', '2026-09-13', '2026-09-13', '2026-09-15')).toBe(false);
  });

  it('prefers a first-class check_out column over notes', () => {
    expect(
      stayRangeFromBooking({
        booking_date: '2026-09-10',
        check_out: '2026-09-14',
        special_requests: 'check_out: 2026-09-12',
      })
    ).toEqual({ checkIn: '2026-09-10', checkOut: '2026-09-14' });
  });

  it('treats a stay booking without check_out as one night', () => {
    expect(stayRangeFromBooking({ booking_date: '2026-09-10', special_requests: null })).toEqual({
      checkIn: '2026-09-10',
      checkOut: '2026-09-11',
    });
  });

  it('treats capacity 0 as an operator block, not listing_availability.booked', () => {
    expect(stayNightIsOperatorBlocked(0)).toBe(true);
    expect(stayNightIsOperatorBlocked(1)).toBe(false);
    expect(stayNightIsOperatorBlocked(8)).toBe(false);
    expect(checkoutStayNightIsOperatorBlocked(0)).toBe(stayNightIsOperatorBlocked(0));
    expect(checkoutStayNightIsOperatorBlocked(1)).toBe(stayNightIsOperatorBlocked(1));
  });

  it('marks partner stay days from occupying bookings, not the booked column', () => {
    expect(partnerStayDayKind({ occupying: true, capacity: 1 })).toBe('occupied');
    expect(partnerStayDayKind({ occupying: true, capacity: 0 })).toBe('occupied');
    expect(partnerStayDayKind({ occupying: false, capacity: 0 })).toBe('blocked');
    expect(partnerStayDayKind({ occupying: false, capacity: 1 })).toBe('available');
    expect(partnerStayDayKind({ occupying: false, capacity: null })).toBe('available');
  });
});
