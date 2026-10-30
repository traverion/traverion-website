/**
 * Centralized environment presentation for launch readiness.
 *
 * Marketing / browse surfaces sell travel — no Stripe/TEST/QA language.
 * Global honesty while Stripe is TEST comes from:
 *   - TravelerTestModeBanner (header chip)
 *   - Pay-now CTAs / amount badges / checkout footnotes on payment-critical surfaces
 *
 * When live publishable keys are authorized, all of these hide automatically.
 */

import {
  STRIPE_TEST_UNTIL_LIVE,
  TRAVELER_OPENING_CHECKOUT_CTA,
  TRAVELER_PAY_NOW_TEST_CTA,
} from './booking-confirmation-copy';
import { appStripeIsTestMode, isStripeTestCheckoutSession } from './money';

/** Short status for the traveler Test mode banner (not marketing copy). */
export const TRAVELER_TEST_MODE_LABEL = 'Test mode';

/** Supporting line under the Test mode label (chip title / bar detail). */
export const TRAVELER_TEST_MODE_DETAIL =
  'Checkout is sandbox — no live charges. Listing browse is real published inventory.';

/** Compact amount badge next to paid totals (never glued into money text). */
export const STRIPE_TEST_AMOUNT_BADGE = 'TEST';

/** Partner Income badge while Stripe publishable key is TEST. */
export const SUPPLIER_TEST_DATA_LABEL = 'Test data';

/** Admin sidebar / compact chip. */
export const ADMIN_STRIPE_TEST_LABEL = 'Stripe TEST';

/** Admin panel notice title. */
export const ADMIN_STRIPE_TEST_NOTICE_TITLE = 'Stripe TEST mode';

/** Admin panel notice body — internal diagnostics only. */
export const ADMIN_STRIPE_TEST_NOTICE_BODY =
  'Payments and Money are sandbox. No live charges until you explicitly go LIVE.';

/** True when the configured Stripe publishable key is TEST. */
export function travelerShowsTestModeBanner(): boolean {
  return appStripeIsTestMode();
}

/** True when UI must disclose sandbox payment behavior on payment-critical surfaces. */
export function showStripeTestPaymentDisclosure(): boolean {
  return appStripeIsTestMode();
}

/**
 * Payment-critical disclosure, or null in live mode.
 * Use on checkout / pay CTAs — not on browse marketing footnotes.
 */
export function stripeTestPaymentDisclosure(): string | null {
  return showStripeTestPaymentDisclosure() ? STRIPE_TEST_UNTIL_LIVE : null;
}

/**
 * Listing / review secure-checkout footnote.
 * Browse stays visually production-ready; Test mode lives in the header chip + pay surfaces.
 */
export function stripeSecureCheckoutFootnote(suffix?: string): string {
  return suffix ? `Secure checkout · ${suffix}` : 'Secure checkout';
}

/** Sticky / mobile pay line for stays (and similar). */
export function stayStickyPaymentHint(freeCancellation: boolean): string {
  return freeCancellation ? 'Free cancellation' : 'Secure payment';
}

/** Pay-now button label — keeps “test mode” only while publishable key is TEST. */
export function travelerPayNowCtaLabel(opening: boolean): string {
  if (opening) return TRAVELER_OPENING_CHECKOUT_CTA;
  return appStripeIsTestMode() ? TRAVELER_PAY_NOW_TEST_CTA : 'Pay now';
}

/** Amount / status badge when the booking session or app key is TEST. */
export function showStripeTestAmountBadge(checkoutSessionId?: string | null): boolean {
  return isStripeTestCheckoutSession(checkoutSessionId) || appStripeIsTestMode();
}

/** Document meta for booking-confirmed — honest in TEST, clean in live. */
export function bookingConfirmedMetaDescription(): string {
  const test = stripeTestPaymentDisclosure();
  if (test) {
    return `Your tour or stay payment was successful. Checkout used ${test}.`;
  }
  return 'Your tour or stay payment was successful. Manage the booking from My bookings.';
}

/** True when admin/supplier finance UI should show TEST diagnostics. */
export function showAdminStripeTestDiagnostics(): boolean {
  return appStripeIsTestMode();
}
