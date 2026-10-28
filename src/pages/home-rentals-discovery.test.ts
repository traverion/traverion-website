import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Home rentals discovery section', () => {
  const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');

  it('places rentals after stays and hides when empty', () => {
    const staysIdx = src.indexOf('Places to stay');
    const rentalsIdx = src.indexOf('Need to rent equipment or a vehicle?');
    const whyIdx = src.indexOf('Why book with Traverion');
    expect(staysIdx).toBeGreaterThan(-1);
    expect(rentalsIdx).toBeGreaterThan(staysIdx);
    expect(whyIdx).toBeGreaterThan(rentalsIdx);
    expect(src).toContain('displayedRentalRows.length > 0');
    expect(src).toContain('Explore all rentals');
    expect(src).toContain('EXPLORE MORE WITH TRAVERION');
    expect(src).toContain('prefetchRentalsPage');
    expect(src).toContain('goToRentals()');
  });

  it('uses rental browse cards with real from-price helpers', () => {
    expect(src).toContain('rentalBrowse');
    expect(src).toContain('rentalFromPrice');
    expect(src).toContain('rentalCategoryTitle');
    expect(src).toContain('normalizeRentalDetails');
    expect(src).toContain("filterCatalogByFamily(catalogBase, 'rental')");
    expect(src).toContain('PublicListingBrowseCard');
  });
});
