import { describe, expect, it } from 'vitest';
import { LISTING_PLACEHOLDER_IMAGE } from './listingQualityScore';
import {
  listingHeroImageSrc,
  reorderFilledPhotos,
  remainingListingPhotoSlots,
  takeListingPhotoFiles,
} from './listingPhotoGrid';

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

describe('photo reorder and cover', () => {
  const slots = ['cover.jpg', 'a.jpg', 'b.jpg', ...Array.from({ length: 9 }, () => '')];
  const labels = ['cover', 'a', 'b', ...Array.from({ length: 9 }, () => '')];

  it('makes a supporting photo the cover when moved to index 0', () => {
    const next = reorderFilledPhotos(slots, labels, 2, 0);
    expect(next.slots[0]).toBe('b.jpg');
    expect(next.slots[1]).toBe('cover.jpg');
    expect(next.slots[2]).toBe('a.jpg');
    expect(next.labels.slice(0, 3)).toEqual(['b', 'cover', 'a']);
  });

  it('preserves cover when reordering later photos', () => {
    const next = reorderFilledPhotos(slots, labels, 1, 2);
    expect(next.slots[0]).toBe('cover.jpg');
    expect(next.slots[1]).toBe('b.jpg');
    expect(next.slots[2]).toBe('a.jpg');
  });

  it('ignores out-of-range moves without dropping photos', () => {
    const next = reorderFilledPhotos(slots, labels, 0, 9);
    expect(next.slots.slice(0, 3)).toEqual(['cover.jpg', 'a.jpg', 'b.jpg']);
  });
});

describe('photo add limits', () => {
  it('rejects a 13th filename without accepting it', () => {
    expect(remainingListingPhotoSlots(12)).toBe(0);
    const result = takeListingPhotoFiles(['extra.jpg'], 0);
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]?.reason).toMatch(/12/);
  });

  it('accepts files that fit and rejects only the overflow', () => {
    const result = takeListingPhotoFiles(['one.jpg', 'two.jpg', 'three.jpg'], 2);
    expect(result.accepted).toEqual(['one.jpg', 'two.jpg']);
    expect(result.rejected.map((item) => item.name)).toEqual(['three.jpg']);
  });
});
