import { describe, expect, it } from 'vitest';
import { CHECKOUT_CONSENT_LABEL, checkoutPayBlockedByConsent } from './checkout-consent';

describe('checkoutConsent', () => {
  it('blocks pay until accepted', () => {
    expect(checkoutPayBlockedByConsent(false)).toBe(true);
    expect(checkoutPayBlockedByConsent(true)).toBe(false);
  });

  it('exposes a non-empty consent label', () => {
    expect(CHECKOUT_CONSENT_LABEL.length).toBeGreaterThan(20);
    expect(CHECKOUT_CONSENT_LABEL.toLowerCase()).toMatch(/cancellation/);
    expect(CHECKOUT_CONSENT_LABEL.toLowerCase()).toMatch(/terms/);
  });
});
