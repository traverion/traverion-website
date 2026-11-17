import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

describe('P9.27 premium tour pages & booking form', () => {
  const packages = readFileSync(resolve(root, 'src/pages/Packages.tsx'), 'utf8');
  const tourDetails = readFileSync(resolve(root, 'src/pages/TourDetails.tsx'), 'utf8');
  const sections = readFileSync(
    resolve(root, 'src/components/tour-detail/TourListingSections.tsx'),
    'utf8'
  );
  const overview = readFileSync(resolve(root, 'src/components/tour-detail/TourOverview.tsx'), 'utf8');
  const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
  const css = readFileSync(resolve(root, 'src/index.css'), 'utf8');
  const card = readFileSync(resolve(root, 'src/components/PublicListingBrowseCard.tsx'), 'utf8');
  const datePicker = readFileSync(resolve(root, 'src/components/TourDatePicker.tsx'), 'utf8');

  it('keeps shared PDP primitives and progressive disclosure', () => {
    expect(sections).toContain('ListingPdpFaq');
    expect(sections).toContain('ListingPdpCollapsible');
    expect(overview).toContain('ListingPdpCollapsible');
    expect(tourDetails).toContain('tv-booking-field');
    expect(tourDetails).toContain('Book this tour');
    expect(datePicker).toContain('tv-booking-field');
    expect(css).toContain('.tv-booking-field');
  });

  it('refines tour browse presentation without inventing catalog copy', () => {
    expect(packages).toContain('hideFamilyChip');
    expect(packages).toContain('Live tours from independent operators will appear here');
    expect(packages).not.toContain('Traverion does not show a demo catalog');
    expect(card).toContain('hideFamilyChip');
  });

  it('mounts TourDetails for non-empty listing ids (seed + uuid)', () => {
    expect(app).toContain('<TourDetails');
    expect(app).toMatch(/if \(tourId\) \{/);
    const listings = readFileSync(resolve(root, 'src/data/listings.ts'), 'utf8');
    expect(listings).toContain('LISTING_UUID_RE');
    expect(listings).toContain('LISTING_UUID_RE.test(listingId)');
  });
});
