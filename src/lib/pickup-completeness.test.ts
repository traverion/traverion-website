import { describe, expect, it } from 'vitest';
import {
  bookingIsStayNight,
  bookingNeedsPickupCopy,
  listingPickupCopyIncomplete,
} from './pickup-completeness';

describe('pickup completeness', () => {
  it('treats thin listing copy as incomplete for tours', () => {
    expect(listingPickupCopyIncomplete('Meet', '')).toBe(true);
    expect(listingPickupCopyIncomplete('Hotel lobby, 07:30, look for the Traverion sign', 'Van')).toBe(
      false
    );
  });

  it('does not treat stay nights as pickup work', () => {
    const stayCol = { check_out: '2026-09-22', special_requests: null };
    const stayNotes = { check_out: null, special_requests: 'check_out: 2026-09-22' };
    const tour = { check_out: null, special_requests: 'Guest phone: +358' };
    expect(bookingIsStayNight(stayCol)).toBe(true);
    expect(bookingIsStayNight(stayNotes)).toBe(true);
    expect(bookingIsStayNight(tour)).toBe(false);
    expect(bookingNeedsPickupCopy(stayCol, '', '')).toBe(false);
    expect(bookingNeedsPickupCopy(tour, 'Meet', '')).toBe(true);
  });
});
