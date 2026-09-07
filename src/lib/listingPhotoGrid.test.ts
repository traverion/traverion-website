import { describe, expect, it } from 'vitest';
import { LISTING_PLACEHOLDER_IMAGE } from './listingQualityScore';
import { listingHeroImageSrc } from './listingPhotoGrid';

describe('listingHeroImageSrc', () => {
  it('returns null for empty or stock placeholder URLs', () => {
    expect(listingHeroImageSrc(undefined)).toBeNull();
    expect(listingHeroImageSrc('')).toBeNull();
    expect(listingHeroImageSrc(LISTING_PLACEHOLDER_IMAGE)).toBeNull();
    expect(listingHeroImageSrc('https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg')).toBeNull();
  });

  it('keeps a real listing photo URL', () => {
    expect(listingHeroImageSrc('https://cdn.example.com/tour.jpg')).toBe('https://cdn.example.com/tour.jpg');
  });
});
