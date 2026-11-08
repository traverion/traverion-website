import { describe, expect, it } from 'vitest';
import {
  isStripeTestSecretKey,
  resolveStripeSecretKey,
  stripeLivePublishableBlockedMessage,
  stripeLiveSecretBlockedMessage,
} from './stripe-test-only';

describe('stripe-test-only (compat)', () => {
  it('accepts sk_test_ and blocks sk_live_ without enablement flag', () => {
    expect(isStripeTestSecretKey('sk_test_abc')).toBe(true);
    expect(isStripeTestSecretKey(' sk_test_abc ')).toBe(true);
    expect(isStripeTestSecretKey('sk_live_abc')).toBe(false);
    expect(
      resolveStripeSecretKey({ secret: 'sk_live_abc', livePaymentsEnabledRaw: null }).ok
    ).toBe(false);
  });

  it('exposes clear blocked messages', () => {
    expect(stripeLiveSecretBlockedMessage()).toMatch(/LIVE/);
    expect(stripeLiveSecretBlockedMessage()).toMatch(/STRIPE_LIVE_PAYMENTS_ENABLED/);
    expect(stripeLivePublishableBlockedMessage()).toMatch(/pk_test_/);
  });
});
