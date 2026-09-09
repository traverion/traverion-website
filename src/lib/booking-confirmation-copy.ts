/**
 * Booking proof is the paid booking row (Trips / confirmation page).
 * Resend is blocked until a valid key exists — never claim an email was sent.
 */

import { bookingIsCancelledTrip } from './trip-views';
import {
  isPaidPaymentStatus,
  normalizePaymentStatus,
  travelerPaymentLabel,
  REFUND_DUE_MANUAL_COPY,
  type MoneyBookingRow,
} from './payment-states';

export const BOOKING_CONFIRMATION_EMAIL_DISCLAIMER =
  'Trips is your confirmation. If an email arrives, keep it for your records — Traverion does not treat email delivery as booking proof.';

export type BookingConfirmationPhase = 'cancelled' | 'confirmed' | 'confirming' | 'received';

/** Post-checkout screen phase — cancelled must never read as Booking confirmed. */
export function bookingConfirmationPhase(b: MoneyBookingRow): BookingConfirmationPhase {
  if (bookingIsCancelledTrip(b)) return 'cancelled';
  if (isPaidPaymentStatus(b.payment_status)) return 'confirmed';
  const pay = normalizePaymentStatus(b.payment_status);
  if (pay === 'pending' || pay === '') return 'confirming';
  return 'received';
}

export function bookingConfirmationCancelledBody(b: MoneyBookingRow): string {
  const pay = travelerPaymentLabel(b);
  if (pay === 'Refund due') {
    return `This booking is cancelled. Status: Refund due. ${REFUND_DUE_MANUAL_COPY}`;
  }
  if (pay === 'Refunded') {
    return 'This booking is cancelled and marked Refunded in Stripe.';
  }
  if (pay === 'No refund') {
    return 'This booking is cancelled. No refund applies for this cancellation.';
  }
  return 'This booking is cancelled. Open Trips for the current status.';
}

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

/** Returned from Stripe without paying — nothing was booked, so nothing was emailed. */
export const STRIPE_CHECKOUT_CANCELLED_NO_EMAIL =
  'No confirmation email is sent for an unfinished checkout.';

export const STRIPE_CHECKOUT_CANCELLED_TOUR_COPY =
  `Checkout was cancelled. You were not charged. ${STRIPE_CHECKOUT_CANCELLED_NO_EMAIL} Open the tour again when you are ready.`;

export const STRIPE_CHECKOUT_CANCELLED_STAY_COPY =
  `Checkout was cancelled and no payment was taken. Any date hold is released. ${STRIPE_CHECKOUT_CANCELLED_NO_EMAIL} Choose dates again when you are ready.`;

/** Partner Inbox / booking thread: Resend is blocked — do not claim the traveler was emailed. */
export const PARTNER_INBOX_MESSAGE_DELIVERY_NOTE =
  'Messages are saved on this booking in Traverion. We do not treat email delivery as proof the traveler saw them.';

/** Traveler Trips thread: Resend is blocked — do not claim the host was emailed. */
export const TRAVELER_BOOKING_THREAD_DELIVERY_NOTE =
  'Messages are saved on this booking in Traverion. We do not treat email delivery as proof the host saw them.';

/** Partner business verification while Resend is blocked — status is this page, not mail. */
export const PARTNER_BUSINESS_REVIEW_STATUS_NOTE =
  'Traverion is reviewing your submission. Payout bank details are verified separately. Status updates appear on this page — Traverion does not treat email as the decision.';

/** Partner payout verification while Resend is blocked — status is this page, not mail. */
export const PARTNER_PAYOUT_REVIEW_STATUS_NOTE =
  'Traverion is reviewing your bank details. Status updates appear on this page — Traverion does not treat email as the decision.';

/** Partner Listings gate when business is under review — status in Settings, not mail. */
export const PARTNER_LISTINGS_BUSINESS_REVIEW_NOTE =
  'Your business details are under review. You can still add or update IBAN and BIC under Payment & payouts in Settings. Publishing requires both business verification and payout verification. Status updates appear in Settings — Traverion does not treat email as the decision.';

/** Partner Listings gate when payout is under review — status in Settings, not mail. */
export const PARTNER_LISTINGS_PAYOUT_REVIEW_NOTE =
  'Your bank details are under review. After Traverion verifies your payout, you can publish (business must already be verified). Status updates appear in Settings — Traverion does not treat email as the decision.';

/** Partner Money page — payouts are manual; status here, not mail. */
export const PARTNER_MONEY_PAYOUT_STATUS_NOTE =
  'Payouts are reviewed by Traverion. There is no automatic transfer date until payouts are enabled for your account. Status appears on this page and in Settings — Traverion does not treat email as proof of transfer.';

/** Partner cancellation request: Resend is blocked — do not claim the traveler was emailed. */
export const PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE =
  'The request appears on the traveler’s Trips. Traverion does not treat email delivery as proof they saw it.';

/**
 * Partner cancel-request modal — traveler refund is due, not already paid out.
 * Do not say “a full refund is expected” as if Stripe already moved money.
 */
export const PARTNER_CANCEL_REQUEST_REFUND_POLICY =
  'Traveler refund: a full refund is due. Traverion does not send the Stripe refund automatically; status becomes Refund due until Stripe records Refunded.';

/** Traveler cancellation response: Resend is blocked — do not claim the host was emailed. */
export const TRAVELER_CANCELLATION_RESPONSE_DELIVERY_NOTE =
  'Your response is saved on this booking. Traverion does not treat email delivery as proof the host saw it.';

/** Traveler self-cancel sheet: Resend is blocked — do not claim the host was emailed. */
export const TRAVELER_SELF_CANCEL_DELIVERY_NOTE =
  'If you cancel, the host sees it on their Bookings. Traverion does not treat email delivery as proof they saw it.';

/**
 * Traveler self-cancel when inside free-cancel window — refund is due, not already paid out.
 * Do not say “you should receive a full refund” as if Stripe already moved money.
 */
export const TRAVELER_SELF_CANCEL_FULL_REFUND_POLICY =
  'A full refund is due under the cancellation window. Status becomes Refund due until Stripe records the refund. Traverion does not send Stripe refunds automatically.';

/** Email / notify fieldDiff after traveler self-cancel with a refund due. */
export const TRAVELER_SELF_CANCEL_EMAIL_DIFF_FULL_REFUND =
  'Cancelled — full refund due until Stripe records it (not automatic)';

/** Email / notify fieldDiff after traveler self-cancel with no refund. */
export const TRAVELER_SELF_CANCEL_EMAIL_DIFF_NO_REFUND =
  'Cancelled — no refund for this traveler-initiated cancellation';

/**
 * Traveler accepting a host cancellation request — same Refund due honesty.
 * Do not promise an automatic payout as if money already moved.
 */
export const TRAVELER_ACCEPT_HOST_CANCEL_REFUND_POLICY =
  'If you accept, this booking is cancelled and a full refund is due. Status becomes Refunded only after Stripe records it. Traverion does not send Stripe refunds automatically, and does not cancel automatically if you do nothing';

/** System thread after traveler accepts host cancel — Refund due honesty. */
export const TRAVELER_ACCEPT_CANCEL_SYSTEM_MESSAGE =
  'Traveler accepted the cancellation. This booking is cancelled. Status: Refund due until Stripe records a refund. Traverion does not send Stripe refunds automatically.';

/** System thread after traveler self-cancel with refund due — keep in sync with cancel_booking_as_traveler. */
export const TRAVELER_SELF_CANCEL_SYSTEM_MESSAGE_FULL_REFUND =
  'Traveler cancelled this booking. Status: Refund due until Stripe records a refund. Traverion does not send Stripe refunds automatically.';

/** System thread after traveler self-cancel with no refund — keep in sync with cancel_booking_as_traveler. */
export const TRAVELER_SELF_CANCEL_SYSTEM_MESSAGE_NO_REFUND =
  'Traveler cancelled this booking. No refund applies for this traveler-initiated cancellation.';

/**
 * Partner notify-supplier-event for traveler self-cancel (booking_cancelled).
 * Keep in sync with supabase/functions/notify-supplier-event HTML subcopy.
 */
export const SUPPLIER_BOOKING_CANCELLED_NOTIFY_SUB =
  'The traveler cancelled this booking. When a refund applies, traveler status is Refund due until Stripe records a refund — Traverion does not send refunds automatically. Inventory is released; check Bookings and Money.';

/**
 * Partner notify after host saves schedule — do not claim the guest was emailed.
 * Keep in sync with supabase/functions/notify-supplier-event host_schedule_updated copy.
 */
export const SUPPLIER_HOST_SCHEDULE_UPDATED_NOTIFY_SUB =
  'You just updated start or pickup times for this booking. Below is a record of what changed. The guest sees the update on Trips; Traverion does not treat email delivery as proof they saw it.';

/**
 * Partner notify after guest updates notes — Bookings is durable; do not treat email as proof.
 * Keep in sync with supabase/functions/notify-supplier-event guest_message subcopy.
 */
export const SUPPLIER_GUEST_DETAILS_UPDATED_NOTIFY_SUB =
  'A guest changed notes or meeting / place-of-stay information. Compare previous vs new values below. Bookings is the durable record; Traverion does not treat email delivery as proof you saw the update.';

/**
 * Partner notify when booking details change — Bookings is durable.
 * Keep in sync with notify-supplier-event booking_detail_changed subcopy.
 */
export const SUPPLIER_BOOKING_DETAIL_CHANGED_NOTIFY_SUB =
  'Details changed for a booking — review in Bookings. Traverion does not treat email delivery as proof you saw the update.';

/**
 * Partner notify for a new review — Reviews is durable.
 * Keep in sync with notify-supplier-event new_review subcopy.
 */
export const SUPPLIER_NEW_REVIEW_NOTIFY_SUB =
  'Someone left a review on your tour. Open Reviews in the partner portal — Traverion does not treat email delivery as proof you saw it.';

/** Paid confirmation UI — Trips is durable; do not imply host follow-up arrives by email. */
export const BOOKING_CONFIRMED_UI_FOLLOWUP_NOTE =
  'Watch Trips for schedule, meeting, or arrival updates from the host.';

/**
 * Paid confirmation email footer — Trips is durable; do not imply host follow-up is by email.
 * Keep in sync with notify-customer-booking booking_confirmed_paid footerNote.
 */
export const BOOKING_CONFIRMED_PAID_FOLLOWUP_NOTE =
  'Watch Trips for schedule or meeting updates from the host. Traverion does not treat email delivery as proof you received a notice.';

/**
 * Legacy booking_request email footer — do not promise a later confirmation email.
 * Keep in sync with notify-customer-booking booking_request footerNote.
 */
export const BOOKING_REQUEST_EMAIL_FOLLOWUP_NOTE =
  'Watch Trips for payment and confirmation status. Traverion does not treat email delivery as proof of a later confirmation.';

/**
 * Host → traveler new_booking_message email footer — Trips thread is durable.
 * Keep in sync with notify-customer-booking new_booking_message footerNote.
 */
export const TRAVELER_NEW_BOOKING_MESSAGE_EMAIL_NOTE =
  'Open Trips for the durable message thread. Traverion does not treat email delivery as proof you saw the message.';

/**
 * Host schedule update email footer — Trips is durable for meeting times.
 * Keep in sync with notify-customer-booking host_updated_schedule footerNote.
 */
export const TRAVELER_HOST_SCHEDULE_UPDATED_EMAIL_NOTE =
  'Updated times appear in Trips. Traverion does not treat email delivery as proof you received this update. Reply to the host in Trips if you need help.';

/**
 * Traveler details-saved email footer — Trips is durable for booking notes.
 * Keep in sync with notify-customer-booking your_details_updated footerNote.
 */
export const TRAVELER_DETAILS_UPDATED_EMAIL_NOTE =
  'Your updates are saved on this booking in Trips. Traverion does not treat email delivery as proof of the change. If you did not make this change, contact the host or Traverion support immediately.';

/**
 * Traveler declined host cancel — Trips is durable for the active booking.
 * Keep in sync with notify-customer-booking cancellation_declined footerNote.
 */
export const TRAVELER_CANCELLATION_DECLINED_EMAIL_NOTE =
  'Your booking stays active in Trips. Traverion does not treat email delivery as proof of this update.';

/**
 * Pickup still needed — Trips is durable when host fills meeting details.
 * Keep in sync with notify-customer-booking pickup_action_required footerNote.
 */
export const TRAVELER_PICKUP_ACTION_EMAIL_NOTE =
  'Pickup and meeting details appear in Trips when the host confirms them. Traverion does not treat email delivery as proof you received an update.';

/** Contact form success: inquiry is saved; do not promise a reply email. */
export const CONTACT_FORM_THANK_YOU =
  'Thank you. Your message is saved with Traverion. We do not treat email delivery as proof of a reply.';

/** Affiliate / content-creator application success: saved; do not promise a reply email. */
export const PARTNERSHIP_FORM_THANK_YOU =
  'Thank you. Your application is saved with Traverion. We do not treat email delivery as proof of a reply.';

/** Traveler Terms — material changes: website notice, not email-as-sole-proof. */
export const TERMS_MATERIAL_CHANGES_NOTE =
  'TRAVERION reserves the right to modify these terms at any time. Material changes are posted on this website. Traverion does not treat email delivery as the only notice of a change.';

/** Traveler Terms — last-minute supplier contact: Trips is durable, not email delivery. */
export const TERMS_LAST_MINUTE_CHANGES_NOTE =
  'Suppliers may attempt to reach you about last-minute changes using the contact details on your booking, but Trips is the durable record. Traverion does not treat email delivery as proof you received a notice.';

/** Partner marketing terms — material changes: portal first, not email-as-sole-proof. */
export const PARTNER_TERMS_MATERIAL_CHANGES_NOTE =
  'Features, fees, and payout schedules may evolve; material changes are shown in the partner portal. Traverion does not treat email delivery as the only notice of a change.';

/** Traveler Privacy — notices may be attempted by email; Trips/site are the durable record. */
export const PRIVACY_COMMUNICATIONS_NOTE =
  'Account and booking notices may be attempted by email, but Trips and this website are the durable record. Traverion does not treat email delivery as proof you received a notice.';

/** Partner Privacy — account notices may be attempted by email; the portal is the durable record. */
export const PARTNER_PRIVACY_COMMUNICATIONS_NOTE =
  'We may attempt to contact you about your partner account by email, but the partner portal is the durable record. Traverion does not treat email delivery as proof you received a notice.';

/** Cookies / marketing preferences — changes are on-site; email is not proof. */
export const COOKIES_PREFERENCES_NOTE =
  'Marketing preference changes are saved on this website. Traverion does not treat email delivery as proof of a preference update.';

export function readStripeCheckoutReturnBanner(search: string): 'success' | 'cancelled' | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const payment = (new URLSearchParams(raw).get('payment') ?? '').trim().toLowerCase();
  if (payment === 'success' || payment === 'cancelled') return payment;
  return null;
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
    t.includes('email has been sent') ||
    t.includes('we will email') ||
    t.includes('will email you') ||
    t.includes('you will receive another email') ||
    t.includes('reply by email') ||
    t.includes('get back to you by email') ||
    t.includes('via email') ||
    t.includes('by email where appropriate')
  );
}
