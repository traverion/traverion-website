import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stay = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');

describe('StayDetails Tour PDP shell parity', () => {
  it('uses shared layout tokens, Share, and ListingPdpPhotoGallery', () => {
    expect(stay).toContain('tv-pdp-layout');
    expect(stay).toContain('tv-pdp-main');
    expect(stay).toContain('tv-pdp-aside');
    expect(stay).toContain('tv-pdp-below');
    expect(stay).toContain('tv-pdp-section');
    expect(stay).toContain('ListingPdpPhotoGallery');
    expect(stay).toContain('Share2');
    expect(stay).toContain("className=\"tv-shell mx-auto");
  });

  it('places reviews before host in the below-grid block', () => {
    const reviewsIdx = stay.indexOf('id="stay-reviews"');
    const hostIdx = stay.indexOf('>Host</h2>');
    expect(reviewsIdx).toBeGreaterThan(-1);
    expect(hostIdx).toBeGreaterThan(-1);
    expect(reviewsIdx).toBeLessThan(hostIdx);
  });

  it('shows supplier propertyType without hardcoding Entire', () => {
    expect(stay).toContain('s?.propertyType?.trim()');
    expect(stay).not.toMatch(/Entire \$\{/);
    expect(stay).not.toMatch(/`Entire /);
  });
});
