import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1668: Stay gallery lightbox', () => {
  it('uses shared ListingPdpPhotoGallery (Tour PDP parity)', () => {
    const src = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');
    const gallery = readFileSync(resolve(__dirname, '../components/ListingPdpPhotoGallery.tsx'), 'utf8');
    expect(src).toContain("import ListingPdpPhotoGallery from '../components/ListingPdpPhotoGallery'");
    expect(src).toContain('ListingPdpPhotoGallery');
    expect(src).toContain('emptyLabel="No photos yet for this stay"');
    expect(gallery).toContain('View all photos');
    expect(gallery).toContain('useDialogFocus');
    expect(gallery).toContain('tv-gallery-lightbox');
    expect(gallery).toContain('role="dialog"');
    expect(gallery).toContain('aria-label={`${title} photos`}');
  });
});
