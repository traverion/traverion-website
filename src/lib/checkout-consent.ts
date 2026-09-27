/**
 * Checkout consent gate — traveler must acknowledge cancellation + platform terms
 * before Stripe TEST redirect. UI blocks pay; create-booking-checkout-session also
 * requires checkoutConsentAccepted and stamps purchase_snapshot.termsAcceptedAt.
 */

export const CHECKOUT_CONSENT_LABEL =
  'I understand the cancellation policy and agree to the Traverion Terms of Service.';

export function checkoutPayBlockedByConsent(accepted: boolean): boolean {
  return !accepted;
}
