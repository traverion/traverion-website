import { describe, expect, it } from 'vitest';
import { HERO_IMG } from './heroImages';
import { destinationCoverSrc, destinationParentCountrySlug } from './destinationCover';

describe('destinationCover', () => {
  it('uses distinct covers for Finland vs Rovaniemi', () => {
    expect(destinationCoverSrc('finland')).toBe(HERO_IMG.vacation);
    expect(destinationCoverSrc('rovaniemi')).toBe(HERO_IMG.banner);
    expect(destinationCoverSrc('finland')).not.toBe(destinationCoverSrc('rovaniemi'));
  });

  it('falls back to vacation for unknown places', () => {
    expect(destinationCoverSrc('unknown-city')).toBe(HERO_IMG.vacation);
  });

  it('resolves parent country slug for a city destination', () => {
    expect(destinationParentCountrySlug('rovaniemi', 'Finland')).toBe('finland');
    expect(destinationParentCountrySlug('finland', 'Finland')).toBeNull();
  });
});
