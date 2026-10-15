import { describe, expect, it } from 'vitest';
import { listingOriginHref } from './navReturn';

describe('listingOriginHref', () => {
  it('keeps a catalog URL that already matches the page, including filters', () => {
    expect(listingOriginHref('stays', '/stays', '?q=helsinki')).toBe('/stays?q=helsinki');
    expect(listingOriginHref('packages', '/packages', '?date=2026-10-20')).toBe(
      '/packages?date=2026-10-20'
    );
  });

  it('uses the canonical path when the visible page never updated the URL', () => {
    expect(listingOriginHref('packages', '/', '')).toBe('/packages');
    expect(listingOriginHref('wishlist', '/', '')).toBe('/wishlist');
    expect(listingOriginHref('home', '/', '')).toBe('/');
  });

  it('keeps destination guides', () => {
    expect(listingOriginHref('destination', '/destinations/helsinki', '')).toBe(
      '/destinations/helsinki'
    );
  });
});
