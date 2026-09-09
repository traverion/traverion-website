/**
 * Booking proof is the paid booking row (Trips / confirmation page).
 * Resend is blocked until a valid key exists — never claim an email was sent.
 */

export const BOOKING_CONFIRMATION_EMAIL_DISCLAIMER =
  'Trips is your confirmation. If an email arrives, keep it for your records — Traverion does not treat email delivery as booking proof.';

/** Stay listing / checkout panel: confirmation is Trips, not mail. */
export const STAY_LISTING_CONFIRMATION_NOTE =
  'After you pay, the stay appears in Trips. We do not send a confirmation email from this checkout.';

/** Tour listing booking panel: confirmation is Trips, not mail. */
export const TOUR_LISTING_CONFIRMATION_NOTE =
  'After you pay, the tour appears in Trips. We do not send a confirmation email from this checkout.';

/** Checkout contact step: always honest about email, including when not signed in. */
export function bookingContactIntroCopy(signedInWithEmail: boolean): string {
  const details =
    'Your details are stored on the booking. You are not charged on this page — payment happens on the next step.';
  const account = signedInWithEmail
    ? ' Email is fixed to your account so this booking stays on your trips.'
    : '';
  return `${details}${account} ${BOOKING_CONFIRMATION_EMAIL_DISCLAIMER}`;
}

export const BOOKING_CONTACT_EMAIL_FIELD_NOTE =
  'This email is for the booking record. We do not send a confirmation email from this checkout.';

/** Checkout pay step: confirmation is Trips / Booking confirmed, not mail. */
export function bookingPayConfirmAfterPayCopy(holdMinutes: number): string {
  return (
    `After Stripe confirms payment, Traverion shows Booking confirmed with your reference. Manage the trip from Trips. ` +
    `We do not send a confirmation email from this checkout. ${BOOKING_CONFIRMATION_EMAIL_DISCLAIMER} ` +
    `If you leave Stripe without paying, the hold expires after ${holdMinutes} minutes and nothing is charged.`
  );
}

export function bookingConfirmationPromisesEmailSent(copy: string): boolean {
  const t = copy.trim().toLowerCase();
  return (
    t.includes('we sent') ||
    t.includes('we have sent') ||
    t.includes("we've sent") ||
    t.includes('check your email') ||
    t.includes('check your inbox') ||
    t.includes('confirmation email has been sent') ||
    t.includes('email has been sent')
  );
}
