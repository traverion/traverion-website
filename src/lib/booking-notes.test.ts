import { describe, expect, it } from 'vitest';
import { guestFacingBookingNotes, upsertBookingPickupNoteOverrides, parseBookingMeetingPointOverride, parseBookingPickupInstructionsOverride } from './booking-notes';

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

  it('hides per-booking meeting and pickup instruction overrides', () => {
    expect(
      guestFacingBookingNotes(
        'Guest phone: +358\n\nmeeting_point: Lobby A\n\npickup_instructions: Blue van'
      )
    ).toBe('Guest phone: +358');
  });
});

describe('upsertBookingPickupNoteOverrides', () => {
  it('writes and clears meeting/pickup overrides without wiping guest notes', () => {
    const base = 'Guest phone: +358\nbooking_option_id: abc';
    const withOverrides = upsertBookingPickupNoteOverrides(base, 'Lobby A', 'Blue van');
    expect(withOverrides).toContain('Guest phone: +358');
    expect(withOverrides).toContain('booking_option_id: abc');
    expect(withOverrides).toContain('meeting_point: Lobby A');
    expect(withOverrides).toContain('pickup_instructions: Blue van');
    expect(parseBookingMeetingPointOverride(withOverrides)).toBe('Lobby A');
    expect(parseBookingPickupInstructionsOverride(withOverrides)).toBe('Blue van');

    const cleared = upsertBookingPickupNoteOverrides(withOverrides, '', '');
    expect(cleared).toContain('Guest phone: +358');
    expect(cleared).toContain('booking_option_id: abc');
    expect(parseBookingMeetingPointOverride(cleared)).toBeNull();
    expect(parseBookingPickupInstructionsOverride(cleared)).toBeNull();
  });
});
