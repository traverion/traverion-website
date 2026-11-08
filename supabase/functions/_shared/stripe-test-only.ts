/**
 * Compatibility surface — prefer resolveStripeSecretKey from stripe-payment-mode.ts.
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
  assertSecretMatchesPublishable,
} from './stripe-payment-mode.ts';
