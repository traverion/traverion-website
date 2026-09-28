import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1662: Accept terms focuses consent without pay error', () => {
  it('StayDetails clears payError and focuses stay-checkout-consent', () => {
    const src = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1662');
    const block = src.slice(
      src.indexOf('if (checkoutPayBlockedByConsent(checkoutConsentAccepted))'),
      src.indexOf('// Re-fetch inventory so a concurrent hold')
    );
    expect(block).toContain('setPayError(null)');
    expect(block).not.toContain('Confirm the cancellation policy and Terms before paying.');
    expect(block).toContain("getElementById('stay-checkout-consent')");
  });

  it('BookingPage clears error and focuses booking-checkout-consent', () => {
    const src = readFileSync(resolve(__dirname, 'BookingPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1662');
    const block = src.slice(
      src.indexOf('if (checkoutPayBlockedByConsent(checkoutConsentAccepted))'),
      src.indexOf('if (capacityBlocksPay)')
    );
    expect(block).toContain('setError(null)');
    expect(block).not.toContain('Confirm the cancellation policy and Terms before paying.');
  });
});
