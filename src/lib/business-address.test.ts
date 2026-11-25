import { describe, expect, it } from 'vitest';
import { addressFieldErrors, businessCountryName, businessCountryOptions, missingBusinessAddressField, structuredBusinessAddress } from './business-address';

describe('structured business address', () => {
  it('keeps only the components the provider returned', () => {
    expect(
      structuredBusinessAddress({
        street: 'Siljotie 2',
        postal: '96100',
        city: 'Rovaniemi',
        country: 'Finland',
        countryCode: 'FI',
      })
    ).toEqual({
      street: 'Siljotie 2',
      postal: '96100',
      city: 'Rovaniemi',
      country: 'Finland',
    });
  });

  it('does not fill a missing postal code or country from other text', () => {
    expect(structuredBusinessAddress({ street: 'Siljotie 2', city: 'Rovaniemi' })).toEqual({
      street: 'Siljotie 2',
      postal: '',
      city: 'Rovaniemi',
      country: '',
    });
    expect(missingBusinessAddressField(structuredBusinessAddress({ street: 'Siljotie 2' }))).toBe('postal');
    expect(addressFieldErrors(structuredBusinessAddress({ street: 'Siljotie 2' }))['address-postal']).toMatch(/postal/i);
  });

  it('names a stored country code and keeps Finland selectable', () => {
    expect(businessCountryName('FI')).toBe('Finland');
    expect(businessCountryName('Finland')).toBe('Finland');
    expect(businessCountryOptions('FI').some((option) => option.value === 'Finland')).toBe(true);
  });
});
