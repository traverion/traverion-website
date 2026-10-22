import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1662: Accept terms focuses consent without pay error', () => {
  it('StayBookingConfirm clears payError and focuses stay-book-consent', () => {
    const src = readFileSync(resolve(__dirname, 'StayBookingConfirm.tsx'), 'utf8');
    expect(src).toContain('checkoutPayBlockedByConsent');
    const block = src.slice(
      src.indexOf('if (checkoutPayBlockedByConsent(checkoutConsentAccepted))'),
      src.indexOf('if (occupancyError)')
    );
    expect(block).toContain('setPayError(null)');
    expect(block).not.toContain('Confirm the cancellation policy and Terms before paying.');
    expect(block).toContain("getElementById('stay-book-consent')");
  });

  it('BookingPage clears error and focuses booking-checkout-consent', () => {
    const src = readFileSync(resolve(__dirname, 'BookingPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1662');
    const start = src.indexOf('const handleConfirmBooking = async () => {');
    const block = src.slice(start, src.indexOf('if (capacityBlocksPay)', start));
    expect(block).toContain('setError(null)');
    expect(block).toContain('booking-checkout-consent');
    expect(block).not.toContain('Confirm the cancellation policy and Terms before paying.');
  });
});
