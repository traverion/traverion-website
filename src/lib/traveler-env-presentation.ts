/**
 * Centralized traveler/supplier environment presentation for launch readiness.
 *
 * Marketing / browse surfaces sell travel — no Stripe/TEST/QA language unless
 * the publishable key is genuinely TEST (honest sandbox disclosure).
 *
 * Payment-critical surfaces call these helpers instead of hardcoding TEST copy.
 * When live keys are eventually authorized, production UI stays clean automatically.
 */

import {
  STRIPE_TEST_UNTIL_LIVE,
  TRAVELER_OPENING_CHECKOUT_CTA,
  TRAVELER_PAY_NOW_TEST_CTA,
} from './booking-confirmation-copy';
import { appStripeIsTestMode, isStripeTestCheckoutSession } from './money';

/** Short status for the traveler Test mode banner (not marketing copy). */
export const TRAVELER_TEST_MODE_LABEL = 'Test mode';

/** Supporting line under the Test mode label. */
export const TRAVELER_TEST_MODE_DETAIL =
  'Checkout is sandbox — no live charges. Listing browse is real published inventory.';

/** Compact amount badge next to paid totals (never glued into money text). */
export const STRIPE_TEST_AMOUNT_BADGE = 'TEST';

/** True when the configured Stripe publishable key is TEST. */
export function travelerShowsTestModeBanner(): boolean {
  return appStripeIsTestMode();
}

/** True when UI must disclose sandbox payment behavior. */
export function showStripeTestPaymentDisclosure(): boolean {
  return appStripeIsTestMode();
}

/**
 * Payment-critical disclosure, or null in live mode.
 * Call sites should omit the line entirely when null — never invent soft substitutes.
 */
export function stripeTestPaymentDisclosure(): string | null {
  return showStripeTestPaymentDisclosure() ? STRIPE_TEST_UNTIL_LIVE : null;
}

/** Secure-checkout footnote for listing / review surfaces. */
export function stripeSecureCheckoutFootnote(suffix?: string): string {
  const test = stripeTestPaymentDisclosure();
  if (test) {
    return suffix ? `${test} · ${suffix}` : `Secure checkout · ${test}`;
  }
  return suffix ? `Secure payment · ${suffix}` : 'Secure checkout';
}

/** Sticky / mobile pay line for stays (and similar). */
export function stayStickyPaymentHint(freeCancellation: boolean): string {
  const test = stripeTestPaymentDisclosure();
  if (test) {
    return freeCancellation ? `Free cancellation · ${test}` : `Pay via ${test}`;
  }
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
