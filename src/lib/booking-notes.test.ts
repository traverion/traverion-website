import { describe, expect, it } from 'vitest';
import { guestFacingBookingNotes } from './booking-notes';

describe('guestFacingBookingNotes', () => {
  it('hides booking_option_id and check_out machine lines', () => {
    expect(
      guestFacingBookingNotes('booking_option_id: 4f92ff72-3491-48e1-9a94-48d7f0558f06')
    ).toBe('');
    expect(
      guestFacingBookingNotes(
        'Guest phone: +358 40 000\n\nbooking_option_id: 4f92ff72-3491-48e1-9a94-48d7f0558f06\n\ncheck_out: 2026-09-22'
      )
    ).toBe('Guest phone: +358 40 000');
  });

  it('keeps traveler notes such as place of stay', () => {
    expect(guestFacingBookingNotes('Place of stay: Arctic Hotel\n\nNear the river')).toBe(
      'Place of stay: Arctic Hotel\n\nNear the river'
    );
    expect(guestFacingBookingNotes(null)).toBe('');
  });
});
