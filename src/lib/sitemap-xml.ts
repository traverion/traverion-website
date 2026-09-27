/**
 * Pure sitemap.xml builders — published inventory only; no drafts/experiences/packages.
 */

import { listingHasUpcomingBookableSeason } from './booking-quote';

export type SitemapListingRow = {
  id: string;
  status?: string | null;
  listing_extras?: unknown;
  is_holiday_package?: boolean | null;
};

export type SitemapUrlEntry = {
  loc: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: string;
};

const STATIC_ENTRIES: SitemapUrlEntry[] = [
  { loc: 'https://traverion.com/', changefreq: 'weekly', priority: '1' },
  { loc: 'https://traverion.com/packages', changefreq: 'daily', priority: '0.9' },
  { loc: 'https://traverion.com/stays', changefreq: 'daily', priority: '0.9' },
  { loc: 'https://traverion.com/about', changefreq: 'monthly', priority: '0.6' },
  { loc: 'https://traverion.com/blog', changefreq: 'weekly', priority: '0.6' },
  { loc: 'https://traverion.com/contact', changefreq: 'monthly', priority: '0.6' },
  { loc: 'https://traverion.com/privacy', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://traverion.com/terms', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://traverion.com/cookies', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://traverion.com/legal-notice', changefreq: 'yearly', priority: '0.3' },
  { loc: 'https://traverion.com/affiliate', changefreq: 'monthly', priority: '0.4' },
  { loc: 'https://traverion.com/content-creator', changefreq: 'monthly', priority: '0.4' },
  { loc: 'https://partner.traverion.com/', changefreq: 'monthly', priority: '0.5' },
  { loc: 'https://traverion.com/sitemap', changefreq: 'monthly', priority: '0.4' },
];

function familyFromExtras(extras: unknown): string | null {
  if (!extras || typeof extras !== 'object' || Array.isArray(extras)) return null;
  const raw = (extras as { inventoryFamily?: unknown }).inventoryFamily;
  return typeof raw === 'string' ? raw : null;
}

/** Tour or stay path for a published traveler-catalog listing; null if not indexable. */
export function sitemapPathForListing(row: SitemapListingRow, todayIso?: string): string | null {
  if ((row.status ?? '').trim().toLowerCase() !== 'published') return null;
  if (row.is_holiday_package) return null;
  const family = familyFromExtras(row.listing_extras) ?? 'tour';
  if (family === 'stay') return `/stays/${row.id}`;
  if (family === 'tour') {
    // Phase 1261: do not index tours whose every season has already ended.
    if (
      !listingHasUpcomingBookableSeason(
        { listingExtras: row.listing_extras } as never,
        todayIso
      )
    ) {
      return null;
    }
    return `/tours/${row.id}`;
  }
  return null;
}

export function buildSitemapEntries(listings: SitemapListingRow[]): SitemapUrlEntry[] {
  const inventory: SitemapUrlEntry[] = [];
  const seen = new Set<string>();
  for (const row of listings) {
    const path = sitemapPathForListing(row);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    inventory.push({
      loc: `https://traverion.com${path}`,
      changefreq: 'weekly',
      priority: '0.8',
    });
  }
  inventory.sort((a, b) => a.loc.localeCompare(b.loc));
  // Static shell first (home/catalogs), then inventory, then rest of static — match prior human layout:
  const head = STATIC_ENTRIES.slice(0, 3);
  const tail = STATIC_ENTRIES.slice(3);
  return [...head, ...inventory, ...tail];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderSitemapXml(entries: SitemapUrlEntry[], generatedAtIso?: string): string {
  const stamp = generatedAtIso ?? new Date().toISOString().slice(0, 10);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <!-- Generated ${stamp}. Published traveler catalog only (tour + stay). No drafts. -->`,
  ];
  for (const e of entries) {
    lines.push(
      `  <url><loc>${escapeXml(e.loc)}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`
    );
  }
  lines.push('</urlset>', '');
  return lines.join('\n');
}
