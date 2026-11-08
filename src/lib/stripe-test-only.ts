/**
 * Compatibility surface for Stripe TEST/LIVE guards.
 * Prefer resolveStripeSecretKey / resolveStripePublishableKey from stripe-payment-mode.
 */
export {
  isStripeTestSecretKey,
  isStripeLiveSecretKey,
  isStripeTestPublishableKey,
  isStripeLivePublishableKey,
  isStripeLivePaymentsEnabledFlag,
  stripeLiveSecretBlockedMessage,
  stripeLivePublishableBlockedMessage,
  resolveStripeSecretKey,
  resolveStripePublishableKey,
} from './stripe-payment-mode';
