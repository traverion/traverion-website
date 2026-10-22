import { describe, expect, it } from 'vitest';
import { HERO_IMG } from './heroImages';
import { destinationCoverSrc, destinationParentCountrySlug } from './destinationCover';

describe('destinationCover', () => {
  it('uses listing photos for Finland and Rovaniemi instead of unrelated stock', () => {
    const finlandListing = 'https://cdn.example-listings.test/finland-lakes.jpg';
    const rovaniemiListing = 'https://cdn.example-listings.test/rovaniemi-aurora.jpg';
    expect(destinationCoverSrc('finland', { candidates: [finlandListing] })).toBe(finlandListing);
    expect(destinationCoverSrc('rovaniemi', { candidates: [rovaniemiListing] })).toBe(
      rovaniemiListing
    );
    expect(destinationCoverSrc('finland', { candidates: [finlandListing] })).not.toBe(
      HERO_IMG.vacation
    );
    expect(destinationCoverSrc('rovaniemi', { candidates: [rovaniemiListing] })).not.toBe(
      HERO_IMG.banner
    );
  });

  it('keeps geographically accurate curated SEA covers', () => {
    expect(destinationCoverSrc('thailand')).toBe(HERO_IMG.thailand);
    expect(destinationCoverSrc('laos')).toBe(HERO_IMG.laos);
    expect(destinationCoverSrc('vietnam')).toBe(HERO_IMG.vietnam);
    expect(destinationCoverSrc('halong-bay')).toBe(HERO_IMG.banner);
  });

  it('falls back to vacation only when no curated or listing image exists', () => {
    expect(destinationCoverSrc('unknown-city')).toBe(HERO_IMG.vacation);
    expect(destinationCoverSrc('finland')).toBe(HERO_IMG.vacation);
  });

  it('ignores unusable listing candidates', () => {
    expect(
      destinationCoverSrc('rovaniemi', {
        candidates: ['', 'data:image/png;base64,abc', 'https://example.com/aurora-hero.jpg'],
      })
    ).toBe(HERO_IMG.vacation);
  });

  it('resolves parent country slug for a city destination', () => {
    expect(destinationParentCountrySlug('rovaniemi', 'Finland')).toBe('finland');
    expect(destinationParentCountrySlug('finland', 'Finland')).toBeNull();
  });
});
