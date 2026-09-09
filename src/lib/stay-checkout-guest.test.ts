import { describe, expect, it } from 'vitest';
import { stayCheckoutLeadGuestNameReady } from './stay-checkout-guest';

describe('stayCheckoutLeadGuestNameReady', () => {
  it('requires a real lead guest name before Stripe', () => {
    expect(stayCheckoutLeadGuestNameReady('')).toBe(false);
    expect(stayCheckoutLeadGuestNameReady('A')).toBe(false);
    expect(stayCheckoutLeadGuestNameReady('  ')).toBe(false);
    expect(stayCheckoutLeadGuestNameReady('Alex')).toBe(true);
  });
});
