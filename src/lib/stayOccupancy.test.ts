import { describe, expect, it } from 'vitest';
import {
  nightsOccupiedByStay,
  parseStayCheckOutFromNotes,
  stayDateRangesOverlap,
  stayRangeFromBooking,
} from './stayOccupancy';

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
});
