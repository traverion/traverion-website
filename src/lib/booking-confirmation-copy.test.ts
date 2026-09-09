import { describe, expect, it } from 'vitest';
import {
  BOOKING_CONFIRMATION_EMAIL_DISCLAIMER,
  STAY_LISTING_CONFIRMATION_NOTE,
  TOUR_LISTING_CONFIRMATION_NOTE,
  bookingConfirmationPromisesEmailSent,
} from './booking-confirmation-copy';

describe('booking confirmation copy', () => {
  it('does not promise that a confirmation email was sent', () => {
    expect(bookingConfirmationPromisesEmailSent(BOOKING_CONFIRMATION_EMAIL_DISCLAIMER)).toBe(false);
    expect(BOOKING_CONFIRMATION_EMAIL_DISCLAIMER.toLowerCase()).toContain('does not treat email delivery as booking proof');
    expect(bookingConfirmationPromisesEmailSent('We sent a confirmation email. Check your inbox.')).toBe(true);
  });

  it('stay listing copy does not promise a confirmation email', () => {
    expect(bookingConfirmationPromisesEmailSent(STAY_LISTING_CONFIRMATION_NOTE)).toBe(false);
    expect(STAY_LISTING_CONFIRMATION_NOTE.toLowerCase()).toContain('do not send a confirmation email');
    expect(STAY_LISTING_CONFIRMATION_NOTE.toLowerCase()).toContain('trips');
  });

  it('tour listing copy does not promise a confirmation email', () => {
    expect(bookingConfirmationPromisesEmailSent(TOUR_LISTING_CONFIRMATION_NOTE)).toBe(false);
    expect(TOUR_LISTING_CONFIRMATION_NOTE.toLowerCase()).toContain('do not send a confirmation email');
    expect(TOUR_LISTING_CONFIRMATION_NOTE.toLowerCase()).toContain('trips');
  });
});
