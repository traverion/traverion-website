import { describe, expect, it } from 'vitest';
import { sanitizePartnerReturnPath } from './partnerReturnPath';

describe('sanitizePartnerReturnPath', () => {
  it('keeps partner app paths and booking query', () => {
    expect(sanitizePartnerReturnPath('/partner/bookings?booking=abc')).toBe('/partner/bookings?booking=abc');
  });

  it('rejects off-host and traveler paths', () => {
    expect(sanitizePartnerReturnPath('https://evil.example/partner')).toBeNull();
    expect(sanitizePartnerReturnPath('//evil.example/partner')).toBeNull();
    expect(sanitizePartnerReturnPath('/trips')).toBeNull();
    expect(sanitizePartnerReturnPath('/partner/../login')).toBeNull();
  });
});
