/**
 * Stripe Recipient Agreement presentation for dashboard-none payout accounts.
 * The agreement text lives at Stripe's URL. This file only records which
 * official page Traverion shows and the disclosure Stripe publishes for recipients.
 */
export const STRIPE_RECIPIENT_AGREEMENT = {
  version: 'stripe-recipient-notice-2026-11-16',
  url: 'https://stripe.com/legal/connect-account/recipient',
  privacyUrl: 'https://stripe.com/privacy',
} as const;

/** Stripe's published recipient disclosure, with Traverion's name in the placeholders. */
export const STRIPE_RECIPIENT_DISCLOSURE =
  'Traverion uses Stripe to make payouts to suppliers. The Stripe Recipient Agreement applies to your receipt of such payouts. To receive payouts from Traverion, you must provide Traverion accurate and complete information about you and your business, and you authorize Traverion to share it and transaction information related to your payout with Stripe.';
