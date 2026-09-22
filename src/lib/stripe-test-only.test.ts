import { describe, expect, it } from 'vitest';
import { isStripeTestSecretKey, stripeLiveSecretBlockedMessage } from './stripe-test-only';

describe('stripe-test-only', () => {
  it('accepts only sk_test_ secrets', () => {
    expect(isStripeTestSecretKey('sk_test_abc')).toBe(true);
    expect(isStripeTestSecretKey(' sk_test_abc ')).toBe(true);
    expect(isStripeTestSecretKey('sk_live_abc')).toBe(false);
    expect(isStripeTestSecretKey('')).toBe(false);
    expect(isStripeTestSecretKey(null)).toBe(false);
  });

  it('exposes a clear blocked message', () => {
    expect(stripeLiveSecretBlockedMessage()).toMatch(/LIVE/);
    expect(stripeLiveSecretBlockedMessage()).toMatch(/sk_test_/);
  });
});
