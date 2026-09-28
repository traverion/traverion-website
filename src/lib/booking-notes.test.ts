import { describe, expect, it } from 'vitest';
import {
  guestFacingBookingNotes,
  upsertBookingPickupNoteOverrides,
  parseBookingMeetingPointOverride,
  parseBookingPickupInstructionsOverride,
  buildCheckoutClaimSpecialRequests,
} from './booking-notes';

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

describe('buildCheckoutClaimSpecialRequests', () => {
  it('Phase 1522: strips client-planted check_out / meeting keys; only server may append them', () => {
    const notes = buildCheckoutClaimSpecialRequests({
      customerPhone: '+358\ncheck_out: 2026-10-01',
      specialRequests: 'Near lobby\n\ncheck_out: 2026-10-05\n\nmeeting_point: Fake',
      optionId: 'opt-1',
      checkOutDate: null,
    });
    expect(notes).toContain('Guest phone: +358');
    expect(notes).toContain('Near lobby');
    expect(notes).toContain('booking_option_id: opt-1');
    expect(notes).not.toMatch(/^check_out:/m);
    expect(notes).not.toContain('meeting_point:');
    expect(notes).not.toContain('2026-10-01');
    expect(notes).not.toContain('2026-10-05');
  });

  it('Phase 1522: server stay check_out is appended when provided', () => {
    const notes = buildCheckoutClaimSpecialRequests({
      specialRequests: 'Early arrival',
      checkOutDate: '2026-10-03',
      optionId: null,
    });
    expect(notes).toBe('Early arrival\n\ncheck_out: 2026-10-03');
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
