import { describe, expect, it } from 'vitest';
import {
  BOOKING_CONFIRMATION_EMAIL_DISCLAIMER,
  BOOKING_CONTACT_EMAIL_FIELD_NOTE,
  STAY_LISTING_CONFIRMATION_NOTE,
  TOUR_LISTING_CONFIRMATION_NOTE,
  bookingConfirmationPromisesEmailSent,
  bookingContactIntroCopy,
  bookingPayConfirmAfterPayCopy,
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

  it('checkout contact copy includes the no-email disclaimer when not signed in', () => {
    const signedOut = bookingContactIntroCopy(false);
    const signedIn = bookingContactIntroCopy(true);
    expect(bookingConfirmationPromisesEmailSent(signedOut)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent(signedIn)).toBe(false);
    expect(signedOut.toLowerCase()).toContain('does not treat email delivery as booking proof');
    expect(signedIn.toLowerCase()).toContain('does not treat email delivery as booking proof');
    expect(signedOut.toLowerCase()).not.toContain('email is fixed to your account');
    expect(signedIn.toLowerCase()).toContain('email is fixed to your account');
    expect(bookingConfirmationPromisesEmailSent(BOOKING_CONTACT_EMAIL_FIELD_NOTE)).toBe(false);
    expect(BOOKING_CONTACT_EMAIL_FIELD_NOTE.toLowerCase()).toContain('do not send a confirmation email');
  });

  it('pay-to-confirm copy does not promise a confirmation email', () => {
    const copy = bookingPayConfirmAfterPayCopy(15);
    expect(bookingConfirmationPromisesEmailSent(copy)).toBe(false);
    expect(copy.toLowerCase()).toContain('do not send a confirmation email');
    expect(copy.toLowerCase()).toContain('trips');
    expect(copy.toLowerCase()).toContain('does not treat email delivery as booking proof');
    expect(copy).toContain('15 minutes');
  });
});
