import { describe, expect, it } from 'vitest';
import { sanitizeCheckoutReturnPath } from './checkout-paths';

describe('sanitizeCheckoutReturnPath', () => {
  const fallback = '/booking-confirmed';

  it('keeps same-site paths', () => {
    expect(sanitizeCheckoutReturnPath('/booking-confirmed', fallback)).toBe('/booking-confirmed');
    expect(sanitizeCheckoutReturnPath('/bookings?payment=cancelled', fallback)).toBe(
      '/bookings?payment=cancelled'
    );
  });

  it('rejects open redirects', () => {
    expect(sanitizeCheckoutReturnPath('https://evil.example/phish', fallback)).toBe(fallback);
    expect(sanitizeCheckoutReturnPath('//evil.example', fallback)).toBe(fallback);
    expect(sanitizeCheckoutReturnPath('/\\evil.example', fallback)).toBe(fallback);
    expect(sanitizeCheckoutReturnPath('/https://evil.example/phish', fallback)).toBe(fallback);
    expect(sanitizeCheckoutReturnPath(undefined, fallback)).toBe(fallback);
  });
});
