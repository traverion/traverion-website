import { describe, expect, it } from 'vitest';
import {
  buildSitemapEntries,
  renderSitemapXml,
  sitemapPathForListing,
} from './sitemap-xml';

describe('sitemap-xml', () => {
  it('indexes published tours and stays only', () => {
    expect(
      sitemapPathForListing({ id: 't1', status: 'published', listing_extras: null })
    ).toBe('/tours/t1');
    expect(
      sitemapPathForListing({
        id: 's1',
        status: 'published',
        listing_extras: { inventoryFamily: 'stay' },
      })
    ).toBe('/stays/s1');
  });

  it('excludes drafts, packages, experiences', () => {
    expect(sitemapPathForListing({ id: 'd1', status: 'draft' })).toBeNull();
    expect(
      sitemapPathForListing({
        id: 'p1',
        status: 'published',
        is_holiday_package: true,
      })
    ).toBeNull();
    expect(
      sitemapPathForListing({
        id: 'e1',
        status: 'published',
        listing_extras: { inventoryFamily: 'experience' },
      })
    ).toBeNull();
  });

  it('builds XML without draft URLs', () => {
    const xml = renderSitemapXml(
      buildSitemapEntries([
        { id: 'aaa', status: 'published' },
        { id: 'bbb', status: 'draft' },
        { id: 'ccc', status: 'published', listing_extras: { inventoryFamily: 'stay' } },
      ]),
      '2026-09-27'
    );
    expect(xml).toContain('https://traverion.com/tours/aaa');
    expect(xml).toContain('https://traverion.com/stays/ccc');
    expect(xml).not.toContain('bbb');
    expect(xml).toContain('Generated 2026-09-27');
  });
});
