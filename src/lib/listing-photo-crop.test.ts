import { describe, expect, it } from 'vitest';
import {
  EMPTY_LISTING_PHOTO_CROP,
  listingPhotoCropHasAdjustments,
  normalizePhotoCropSettings,
} from './listing-photo-crop';
import { compactPhotoSlotsAndLabels, reorderFilledPhotos } from './listingPhotoGrid';

describe('normalizePhotoCropSettings', () => {
  it('pads to twelve empty crop slots', () => {
    const out = normalizePhotoCropSettings([]);
    expect(out).toHaveLength(12);
    expect(out[0]).toEqual(EMPTY_LISTING_PHOTO_CROP);
  });

  it('parses zoom and areaPixels from saved extras', () => {
    const out = normalizePhotoCropSettings([
      {
        crop: { x: 12, y: -4 },
        zoom: 1.5,
        areaPixels: { x: 10, y: 20, width: 800, height: 600 },
      },
    ]);
    expect(out[0]?.zoom).toBe(1.5);
    expect(out[0]?.crop).toEqual({ x: 12, y: -4 });
    expect(out[0]?.areaPixels).toEqual({ x: 10, y: 20, width: 800, height: 600 });
  });
});

describe('listingPhotoCropHasAdjustments', () => {
  it('is false for defaults and true after zoom or area', () => {
    expect(listingPhotoCropHasAdjustments(EMPTY_LISTING_PHOTO_CROP)).toBe(false);
    expect(listingPhotoCropHasAdjustments({ ...EMPTY_LISTING_PHOTO_CROP, zoom: 1.2 })).toBe(true);
  });
});

describe('photo crops stay paired on reorder', () => {
  it('moves crop settings with the photo', () => {
    const crops = normalizePhotoCropSettings([
      { crop: { x: 0, y: 0 }, zoom: 1, areaPixels: null },
      { crop: { x: 1, y: 2 }, zoom: 2, areaPixels: { x: 0, y: 0, width: 100, height: 75 } },
      { crop: { x: 3, y: 4 }, zoom: 1.1, areaPixels: null },
    ]);
    const slots = ['cover.jpg', 'a.jpg', 'b.jpg', ...Array.from({ length: 9 }, () => '')];
    const labels = ['cover', 'a', 'b', ...Array.from({ length: 9 }, () => '')];
    const originals = ['c-m.jpg', 'a-m.jpg', 'b-m.jpg', ...Array.from({ length: 9 }, () => '')];
    const next = reorderFilledPhotos(slots, labels, 1, 0, originals, crops);
    expect(next.slots[0]).toBe('a.jpg');
    expect(next.crops[0]?.zoom).toBe(2);
    expect(next.crops[1]?.zoom).toBe(1);
  });

  it('compacts crops with filled slots', () => {
    const packed = compactPhotoSlotsAndLabels(
      ['', 'a.jpg', '', 'b.jpg', ...Array.from({ length: 8 }, () => '')],
      ['', 'a', '', 'b', ...Array.from({ length: 8 }, () => '')],
      ['', 'a-m.jpg', '', 'b-m.jpg', ...Array.from({ length: 8 }, () => '')],
      normalizePhotoCropSettings([
        {},
        { zoom: 1.8, crop: { x: 5, y: 5 } },
        {},
        { zoom: 1.2, crop: { x: 1, y: 1 } },
      ])
    );
    expect(packed.slots.slice(0, 2)).toEqual(['a.jpg', 'b.jpg']);
    expect(packed.crops[0]?.zoom).toBe(1.8);
    expect(packed.crops[1]?.zoom).toBe(1.2);
  });
});
