/**
 * Traveler environment presentation (Phase 801+).
 *
 * Marketing / browse surfaces sell travel — no Stripe/TEST/QA language.
 * Payment-critical surfaces keep STRIPE_TEST_UNTIL_LIVE and Pay now · test mode.
 * When the app publishable key is TEST, show one calm global Test mode indicator.
 */

import { appStripeIsTestMode } from './money';

/** Short status for the traveler Test mode banner (not marketing copy). */
export const TRAVELER_TEST_MODE_LABEL = 'Test mode';

/** Supporting line under the Test mode label. */
export const TRAVELER_TEST_MODE_DETAIL =
  'Checkout is sandbox — no live charges. Listing browse is real published inventory.';

/** True when the configured Stripe publishable key is TEST. */
export function travelerShowsTestModeBanner(): boolean {
  return appStripeIsTestMode();
}
