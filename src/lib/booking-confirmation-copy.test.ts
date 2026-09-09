import { describe, expect, it } from 'vitest';
import {
  BOOKING_CONFIRMATION_EMAIL_DISCLAIMER,
  BOOKING_CONTACT_EMAIL_FIELD_NOTE,
  STAY_LISTING_CONFIRMATION_NOTE,
  TOUR_LISTING_CONFIRMATION_NOTE,
  STRIPE_CHECKOUT_CANCELLED_STAY_COPY,
  STRIPE_CHECKOUT_CANCELLED_TOUR_COPY,
  PARTNER_INBOX_MESSAGE_DELIVERY_NOTE,
  PARTNER_BUSINESS_REVIEW_STATUS_NOTE,
  PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE,
  TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE,
  PARTNER_LISTINGS_BUSINESS_REVIEW_NOTE,
  PARTNER_LISTINGS_PAYOUT_REVIEW_NOTE,
  PARTNER_MONEY_PAYOUT_STATUS_NOTE,
  PARTNER_PAYOUT_REVIEW_STATUS_NOTE,
  TRAVELER_BOOKING_THREAD_DELIVERY_NOTE,
  bookingConfirmationPromisesEmailSent,
  bookingContactIntroCopy,
  bookingPayConfirmAfterPayCopy,
  readStripeCheckoutReturnBanner,
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

  it('Stripe cancel return copy does not promise a confirmation email', () => {
    expect(bookingConfirmationPromisesEmailSent(STRIPE_CHECKOUT_CANCELLED_TOUR_COPY)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent(STRIPE_CHECKOUT_CANCELLED_STAY_COPY)).toBe(false);
    expect(STRIPE_CHECKOUT_CANCELLED_TOUR_COPY.toLowerCase()).toContain('no confirmation email is sent');
    expect(STRIPE_CHECKOUT_CANCELLED_STAY_COPY.toLowerCase()).toContain('no confirmation email is sent');
    expect(STRIPE_CHECKOUT_CANCELLED_TOUR_COPY.toLowerCase()).toContain('you were not charged');
    expect(STRIPE_CHECKOUT_CANCELLED_STAY_COPY.toLowerCase()).toContain('no payment was taken');
    expect(readStripeCheckoutReturnBanner('?payment=cancelled')).toBe('cancelled');
    expect(readStripeCheckoutReturnBanner('?payment=success')).toBe('success');
    expect(readStripeCheckoutReturnBanner('')).toBe(null);
  });

  it('partner Inbox copy does not promise the traveler was emailed', () => {
    expect(bookingConfirmationPromisesEmailSent(PARTNER_INBOX_MESSAGE_DELIVERY_NOTE)).toBe(false);
    expect(PARTNER_INBOX_MESSAGE_DELIVERY_NOTE.toLowerCase()).toContain('do not treat email delivery as proof');
    expect(PARTNER_INBOX_MESSAGE_DELIVERY_NOTE.toLowerCase()).toContain('traveler');
  });

  it('traveler booking-thread copy does not promise the host was emailed', () => {
    expect(bookingConfirmationPromisesEmailSent(TRAVELER_BOOKING_THREAD_DELIVERY_NOTE)).toBe(false);
    expect(TRAVELER_BOOKING_THREAD_DELIVERY_NOTE.toLowerCase()).toContain('do not treat email delivery as proof');
    expect(TRAVELER_BOOKING_THREAD_DELIVERY_NOTE.toLowerCase()).toContain('host');
  });

  it('partner review and payout copy does not promise Traverion will email', () => {
    expect(bookingConfirmationPromisesEmailSent(PARTNER_BUSINESS_REVIEW_STATUS_NOTE)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent(PARTNER_PAYOUT_REVIEW_STATUS_NOTE)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent('We will email you when there is an update.')).toBe(true);
    expect(PARTNER_BUSINESS_REVIEW_STATUS_NOTE.toLowerCase()).toContain('status updates appear on this page');
    expect(PARTNER_PAYOUT_REVIEW_STATUS_NOTE.toLowerCase()).toContain('status updates appear on this page');
    expect(PARTNER_BUSINESS_REVIEW_STATUS_NOTE.toLowerCase()).toContain('does not treat email as the decision');
    expect(PARTNER_PAYOUT_REVIEW_STATUS_NOTE.toLowerCase()).toContain('does not treat email as the decision');
  });

  it('partner Listings and Money copy does not promise Traverion will email updates', () => {
    expect(bookingConfirmationPromisesEmailSent(PARTNER_LISTINGS_BUSINESS_REVIEW_NOTE)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent(PARTNER_LISTINGS_PAYOUT_REVIEW_NOTE)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent(PARTNER_MONEY_PAYOUT_STATUS_NOTE)).toBe(false);
    expect(PARTNER_LISTINGS_BUSINESS_REVIEW_NOTE.toLowerCase()).toContain('status updates appear in settings');
    expect(PARTNER_LISTINGS_PAYOUT_REVIEW_NOTE.toLowerCase()).toContain('status updates appear in settings');
    expect(PARTNER_MONEY_PAYOUT_STATUS_NOTE.toLowerCase()).toContain('status appears on this page');
    expect(PARTNER_MONEY_PAYOUT_STATUS_NOTE.toLowerCase()).toContain('does not treat email as proof of transfer');
  });

  it('partner cancellation request copy does not promise the traveler was emailed', () => {
    expect(bookingConfirmationPromisesEmailSent(PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE)).toBe(false);
    expect(PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE.toLowerCase()).toContain('trips');
    expect(PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE.toLowerCase()).toContain('does not treat email delivery as proof');
  });

  it('traveler cancellation response copy does not promise the host was emailed', () => {
    expect(bookingConfirmationPromisesEmailSent(TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE)).toBe(false);
    expect(TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE.toLowerCase()).toContain('host');
    expect(TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE.toLowerCase()).toContain('does not treat email delivery as proof');
  });
});
