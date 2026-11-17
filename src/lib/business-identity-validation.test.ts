import { describe, expect, it } from 'vitest';
import {
  isValidFinnishBusinessId,
  isValidFinnishVatId,
  normalizeFinnishBusinessId,
  normalizeFinnishVatId,
  parseDirectors,
  serializeDirectors,
  validateDirectorsList,
} from './business-identity-validation';

describe('Finnish business identity', () => {
  it('validates and normalizes Y-tunnus', () => {
    expect(isValidFinnishBusinessId('1234567-1')).toBe(true);
    expect(isValidFinnishBusinessId('12345671')).toBe(true);
    expect(normalizeFinnishBusinessId('12345671')).toBe('1234567-1');
    expect(isValidFinnishBusinessId('3123456-7')).toBe(false);
  });

  it('validates Finnish VAT', () => {
    expect(normalizeFinnishVatId('fi12345671')).toBe('FI12345671');
    expect(isValidFinnishVatId('FI12345671')).toBe(true);
    expect(isValidFinnishVatId('FI12345678')).toBe(false);
  });

  it('parses and serializes directors', () => {
    expect(serializeDirectors([' Ada Lovelace ', '', 'Grace Hopper'])).toBe(
      'Ada Lovelace\nGrace Hopper'
    );
    expect(parseDirectors('Ada Lovelace\nGrace Hopper')).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
    ]);
    expect(validateDirectorsList(['', '  '])).toMatch(/director/i);
    expect(validateDirectorsList(['Ada Lovelace'])).toBeNull();
  });
});
