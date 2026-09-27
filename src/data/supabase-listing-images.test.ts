import { describe, expect, it } from 'vitest';
import {
  collectListingStorageImageUrls,
  isListingImageStoragePublicUrl,
  listingImagePathFromPublicUrl,
} from './supabase-listing-images';

describe('listing image path ownership helpers', () => {
  const base = 'https://xcopqllkulxfkpunetbc.supabase.co/storage/v1/object/public/listing-images/';

  it('parses object path from public URL', () => {
    const path = listingImagePathFromPublicUrl(
      `${base}user-a/listing-photos/abc.jpg?width=800`
    );
    expect(path).toBe('user-a/listing-photos/abc.jpg');
    expect(isListingImageStoragePublicUrl(`${base}user-a/listing-photos/abc.jpg`)).toBe(true);
  });

  it('rejects non-bucket URLs', () => {
    expect(listingImagePathFromPublicUrl('https://cdn.example/photo.jpg')).toBeNull();
    expect(isListingImageStoragePublicUrl('https://cdn.example/photo.jpg')).toBe(false);
  });

  it('ownership check: path must be under the acting user id', () => {
    const path = listingImagePathFromPublicUrl(`${base}supplier-a/listing-photos/x.webp`);
    expect(path?.startsWith('supplier-a/')).toBe(true);
    expect(path?.startsWith('supplier-b/')).toBe(false);
  });

  it('collects hero + gallery bucket URLs and skips external', () => {
    const urls = collectListingStorageImageUrls({
      image: `${base}u1/listing-photos/hero.jpg`,
      listingExtras: {
        galleryImageUrls: [
          `${base}u1/listing-photos/g1.jpg`,
          'https://cdn.example/external.jpg',
          `${base}u1/listing-photos/hero.jpg`,
        ],
      },
    });
    expect(urls).toEqual([
      `${base}u1/listing-photos/hero.jpg`,
      `${base}u1/listing-photos/g1.jpg`,
    ]);
  });
});
