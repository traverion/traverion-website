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
  PARTNER_CANCEL_REQUEST_REFUND_POLICY,
  TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE,
  TRAVELER_SELF_CANCEL_DELIVERY_NOTE,
  TRAVELER_SELF_CANCEL_FULL_REFUND_POLICY,
  TRAVELER_ACCEPT_HOST_CANCEL_REFUND_POLICY,
  TRAVELER_SELF_CANCEL_EMAIL_DIFF_FULL_REFUND,
  TRAVELER_SELF_CANCEL_EMAIL_DIFF_NO_REFUND,
  TRAVELER_ACCEPT_CANCEL_SYSTEM_MESSAGE,
  SUPPLIER_BOOKING_CANCELLED_NOTIFY_SUB,
  SUPPLIER_HOST_SCHEDULE_UPDATED_NOTIFY_SUB,
  BOOKING_CONFIRMED_PAID_FOLLOWUP_NOTE,
  CONTACT_FORM_THANK_YOU,
  PARTNERSHIP_FORM_THANK_YOU,
  TERMS_MATERIAL_CHANGES_NOTE,
  PARTNER_TERMS_MATERIAL_CHANGES_NOTE,
  PRIVACY_COMMUNICATIONS_NOTE,
  PARTNER_PRIVACY_COMMUNICATIONS_NOTE,
  COOKIES_PREFERENCES_NOTE,
  PARTNER_LISTINGS_BUSINESS_REVIEW_NOTE,
  PARTNER_LISTINGS_PAYOUT_REVIEW_NOTE,
  PARTNER_MONEY_PAYOUT_STATUS_NOTE,
  PARTNER_PAYOUT_REVIEW_STATUS_NOTE,
  TRAVELER_BOOKING_THREAD_DELIVERY_NOTE,
  bookingConfirmationPromisesEmailSent,
  bookingConfirmationPhase,
  bookingConfirmationCancelledBody,
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

  it('partner cancel-request refund copy does not say a full refund is expected', () => {
    expect(PARTNER_CANCEL_REQUEST_REFUND_POLICY.toLowerCase()).toContain('full refund is due');
    expect(PARTNER_CANCEL_REQUEST_REFUND_POLICY.toLowerCase()).toContain('refund due');
    expect(PARTNER_CANCEL_REQUEST_REFUND_POLICY.toLowerCase()).not.toContain('full refund is expected');
    expect(bookingConfirmationPromisesEmailSent(PARTNER_CANCEL_REQUEST_REFUND_POLICY)).toBe(false);
  });

  it('traveler cancellation response copy does not promise the host was emailed', () => {
    expect(bookingConfirmationPromisesEmailSent(TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE)).toBe(false);
    expect(TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE.toLowerCase()).toContain('host');
    expect(TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE.toLowerCase()).toContain('does not treat email delivery as proof');
  });

  it('traveler self-cancel sheet copy does not promise the host was emailed', () => {
    expect(bookingConfirmationPromisesEmailSent(TRAVELER_SELF_CANCEL_DELIVERY_NOTE)).toBe(false);
    expect(TRAVELER_SELF_CANCEL_DELIVERY_NOTE.toLowerCase()).toContain('bookings');
    expect(TRAVELER_SELF_CANCEL_DELIVERY_NOTE.toLowerCase()).toContain('does not treat email delivery as proof');
  });

  it('traveler cancel refund copy does not promise money already moved', () => {
    expect(TRAVELER_SELF_CANCEL_FULL_REFUND_POLICY.toLowerCase()).toContain('refund is due');
    expect(TRAVELER_SELF_CANCEL_FULL_REFUND_POLICY.toLowerCase()).toContain('does not send stripe refunds automatically');
    expect(TRAVELER_SELF_CANCEL_FULL_REFUND_POLICY.toLowerCase()).not.toContain('you should receive');
    expect(TRAVELER_ACCEPT_HOST_CANCEL_REFUND_POLICY.toLowerCase()).toContain('full refund is due');
    expect(TRAVELER_ACCEPT_HOST_CANCEL_REFUND_POLICY.toLowerCase()).toContain('does not send stripe refunds automatically');
    expect(TRAVELER_ACCEPT_HOST_CANCEL_REFUND_POLICY.toLowerCase()).not.toContain('full refund is expected');
    expect(bookingConfirmationPromisesEmailSent(TRAVELER_SELF_CANCEL_FULL_REFUND_POLICY)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent(TRAVELER_ACCEPT_HOST_CANCEL_REFUND_POLICY)).toBe(false);
    expect(TRAVELER_SELF_CANCEL_EMAIL_DIFF_FULL_REFUND.toLowerCase()).toContain('refund due until stripe');
    expect(TRAVELER_SELF_CANCEL_EMAIL_DIFF_FULL_REFUND.toLowerCase()).not.toContain('per policy where applicable');
    expect(TRAVELER_SELF_CANCEL_EMAIL_DIFF_NO_REFUND.toLowerCase()).toContain('no refund');
    expect(bookingConfirmationPromisesEmailSent(TRAVELER_SELF_CANCEL_EMAIL_DIFF_FULL_REFUND)).toBe(false);
    expect(TRAVELER_ACCEPT_CANCEL_SYSTEM_MESSAGE.toLowerCase()).toContain('refund due');
    expect(TRAVELER_ACCEPT_CANCEL_SYSTEM_MESSAGE.toLowerCase()).toContain(
      'does not send stripe refunds automatically'
    );
    expect(TRAVELER_ACCEPT_CANCEL_SYSTEM_MESSAGE).toContain('Traveler accepted the cancellation');
    expect(TRAVELER_ACCEPT_CANCEL_SYSTEM_MESSAGE.length).toBeGreaterThan(
      'Traveler accepted the cancellation. This booking is cancelled.'.length
    );
    expect(SUPPLIER_BOOKING_CANCELLED_NOTIFY_SUB.toLowerCase()).toContain('traveler cancelled');
    expect(SUPPLIER_BOOKING_CANCELLED_NOTIFY_SUB.toLowerCase()).toContain('refund due');
    expect(SUPPLIER_BOOKING_CANCELLED_NOTIFY_SUB.toLowerCase()).toContain(
      'does not send refunds automatically'
    );
    expect(SUPPLIER_BOOKING_CANCELLED_NOTIFY_SUB.toLowerCase()).not.toBe('a booking was cancelled.');
    expect(bookingConfirmationPromisesEmailSent(SUPPLIER_BOOKING_CANCELLED_NOTIFY_SUB)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent(SUPPLIER_HOST_SCHEDULE_UPDATED_NOTIFY_SUB)).toBe(false);
    expect(SUPPLIER_HOST_SCHEDULE_UPDATED_NOTIFY_SUB.toLowerCase()).toContain('trips');
    expect(SUPPLIER_HOST_SCHEDULE_UPDATED_NOTIFY_SUB.toLowerCase()).toContain(
      'does not treat email delivery as proof'
    );
    expect(SUPPLIER_HOST_SCHEDULE_UPDATED_NOTIFY_SUB.toLowerCase()).not.toContain('receives the same summary by email');
    expect(SUPPLIER_HOST_SCHEDULE_UPDATED_NOTIFY_SUB.toLowerCase()).not.toContain('was sent the same');
    expect(bookingConfirmationPromisesEmailSent(BOOKING_CONFIRMED_PAID_FOLLOWUP_NOTE)).toBe(false);
    expect(BOOKING_CONFIRMED_PAID_FOLLOWUP_NOTE.toLowerCase()).toContain('trips');
    expect(BOOKING_CONFIRMED_PAID_FOLLOWUP_NOTE.toLowerCase()).toContain(
      'does not treat email delivery as proof'
    );
    expect(BOOKING_CONFIRMED_PAID_FOLLOWUP_NOTE.toLowerCase()).not.toContain('follow up by email');
  });

  it('marketing contact thank-you copy does not promise a reply email', () => {
    expect(bookingConfirmationPromisesEmailSent(CONTACT_FORM_THANK_YOU)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent(PARTNERSHIP_FORM_THANK_YOU)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent('Thank you. We will review your details and reply by email.')).toBe(true);
    expect(bookingConfirmationPromisesEmailSent('Thank you. We will get back to you by email.')).toBe(true);
    expect(CONTACT_FORM_THANK_YOU.toLowerCase()).toContain('message is saved');
    expect(PARTNERSHIP_FORM_THANK_YOU.toLowerCase()).toContain('application is saved');
    expect(CONTACT_FORM_THANK_YOU.toLowerCase()).toContain('do not treat email delivery as proof of a reply');
    expect(PARTNERSHIP_FORM_THANK_YOU.toLowerCase()).toContain('do not treat email delivery as proof of a reply');
  });

  it('Terms and partner marketing copy do not promise email as the only notice of changes', () => {
    expect(bookingConfirmationPromisesEmailSent(TERMS_MATERIAL_CHANGES_NOTE)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent(PARTNER_TERMS_MATERIAL_CHANGES_NOTE)).toBe(false);
    expect(
      bookingConfirmationPromisesEmailSent(
        'We will notify users of any material changes via email or through our website.'
      )
    ).toBe(true);
    expect(
      bookingConfirmationPromisesEmailSent(
        'material changes will be communicated through the portal or by email where appropriate.'
      )
    ).toBe(true);
    expect(TERMS_MATERIAL_CHANGES_NOTE.toLowerCase()).toContain('posted on this website');
    expect(PARTNER_TERMS_MATERIAL_CHANGES_NOTE.toLowerCase()).toContain('partner portal');
    expect(TERMS_MATERIAL_CHANGES_NOTE.toLowerCase()).toContain('does not treat email delivery as the only notice');
    expect(PARTNER_TERMS_MATERIAL_CHANGES_NOTE.toLowerCase()).toContain('does not treat email delivery as the only notice');
  });

  it('Privacy copy does not treat email delivery as proof of a notice', () => {
    expect(bookingConfirmationPromisesEmailSent(PRIVACY_COMMUNICATIONS_NOTE)).toBe(false);
    expect(bookingConfirmationPromisesEmailSent(PARTNER_PRIVACY_COMMUNICATIONS_NOTE)).toBe(false);
    expect(PRIVACY_COMMUNICATIONS_NOTE.toLowerCase()).toContain('trips');
    expect(PARTNER_PRIVACY_COMMUNICATIONS_NOTE.toLowerCase()).toContain('partner portal');
    expect(PRIVACY_COMMUNICATIONS_NOTE.toLowerCase()).toContain('does not treat email delivery as proof you received');
    expect(PARTNER_PRIVACY_COMMUNICATIONS_NOTE.toLowerCase()).toContain(
      'does not treat email delivery as proof you received'
    );
  });

  it('Cookies copy does not treat email delivery as proof of a preference update', () => {
    expect(bookingConfirmationPromisesEmailSent(COOKIES_PREFERENCES_NOTE)).toBe(false);
    expect(COOKIES_PREFERENCES_NOTE.toLowerCase()).toContain('saved on this website');
    expect(COOKIES_PREFERENCES_NOTE.toLowerCase()).toContain('does not treat email delivery as proof');
  });

  it('confirmation page phase must not treat cancelled+paid as Booking confirmed', () => {
    expect(
      bookingConfirmationPhase({ status: 'cancelled', payment_status: 'paid', amount_paid: 189 })
    ).toBe('cancelled');
    expect(
      bookingConfirmationPhase({ status: 'confirmed', payment_status: 'refunded', amount_paid: 189 })
    ).toBe('cancelled');
    expect(
      bookingConfirmationPhase({ status: 'confirmed', payment_status: 'paid', amount_paid: 189 })
    ).toBe('confirmed');
    expect(
      bookingConfirmationPhase({ status: 'pending', payment_status: 'pending' })
    ).toBe('confirming');
    const due = bookingConfirmationCancelledBody({
      status: 'cancelled',
      payment_status: 'paid',
      amount_paid: 189,
    });
    expect(due.toLowerCase()).toContain('refund due');
    expect(bookingConfirmationPromisesEmailSent(due)).toBe(false);
  });
});
