import { describe, expect, it } from 'vitest';
import {
  composeStayCheckInAddress,
  parseLegacyStayAddress,
  stayAddressFromGoogleComponents,
  stayAddressKey,
  stayPinMatchesAddress,
} from './stay-address';

describe('stay address', () => {
  it('fills structured fields from a street address and does not invent coordinates', () => {
    const parts = stayAddressFromGoogleComponents(
      [
        { longText: '2', types: ['street_number'] },
        { longText: 'Siljotie', types: ['route'] },
        { longText: '96200', types: ['postal_code'] },
        { longText: 'Rovaniemi', types: ['locality'] },
        { longText: 'Finland', shortText: 'FI', types: ['country'] },
      ],
      'Siljotie 2, 96200 Rovaniemi, Finland'
    );
    expect(parts.street).toBe('Siljotie 2');
    expect(parts.postal).toBe('96200');
    expect(parts.city).toBe('Rovaniemi');
    expect(parts.countryCode).toBe('FI');
    expect(parts).not.toHaveProperty('lat');
  });

  it('writes the city and postal code once', () => {
    expect(
      composeStayCheckInAddress({
        street: 'Siljotie 2, 96200, Rovaniemi',
        unit: '',
        postal: '96200',
        city: 'Rovaniemi',
      })
    ).toBe('Siljotie 2, 96200 Rovaniemi');
    expect(
      composeStayCheckInAddress({
        street: 'Siljotie 2',
        unit: '4B',
        postal: '96200',
        city: 'Rovaniemi',
      })
    ).toBe('Siljotie 2, Unit 4B, 96200 Rovaniemi');
  });

  it('splits an older duplicated line back into street and postal code', () => {
    expect(parseLegacyStayAddress('Siljotie 2, 96200, Rovaniemi, 96200, Rovaniemi', 'Rovaniemi')).toEqual({
      street: 'Siljotie 2',
      unit: '',
      postal: '96200',
    });
  });

  it('keeps a resolved pin only for the address it belongs to', () => {
    const key = stayAddressKey('Siljotie 2', '96200', 'Rovaniemi');
    expect(
      stayPinMatchesAddress({
        source: 'address',
        addressKey: key,
        street: 'Siljotie 2',
        postal: '96200',
        city: 'Rovaniemi',
        lat: 66.5,
        lng: 25.72,
      })
    ).toBe(true);
    expect(
      stayPinMatchesAddress({
        source: 'address',
        addressKey: key,
        street: 'Koskikatu 12',
        postal: '96200',
        city: 'Rovaniemi',
        lat: 66.5,
        lng: 25.72,
      })
    ).toBe(false);
    expect(
      stayPinMatchesAddress({
        source: '',
        addressKey: '',
        street: 'Siljotie 2',
        postal: '96200',
        city: 'Rovaniemi',
        lat: 66.5,
        lng: 25.72,
      })
    ).toBe(false);
  });

  it('treats a dragged pin as the current address without rewriting that address', () => {
    const key = stayAddressKey('Siljotie 2', '96200', 'Rovaniemi');
    const patch = {
      stayPinLat: 66.51,
      stayPinLng: 25.73,
      stayPinSource: 'adjusted' as const,
      stayPinAddressKey: key,
    };
    expect(patch).not.toHaveProperty('stayAddressStreet');
    expect(
      stayPinMatchesAddress({
        source: patch.stayPinSource,
        addressKey: patch.stayPinAddressKey,
        street: 'Siljotie 2',
        postal: '96200',
        city: 'Rovaniemi',
        lat: patch.stayPinLat,
        lng: patch.stayPinLng,
      })
    ).toBe(true);
  });
});
