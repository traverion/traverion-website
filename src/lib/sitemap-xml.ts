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

/** Canonical public origin. Apex redirects to www. */
const SITEMAP_ORIGIN = 'https://www.traverion.com';

const STATIC_ENTRIES: SitemapUrlEntry[] = [
  { loc: `${SITEMAP_ORIGIN}/`, changefreq: 'weekly', priority: '1' },
  { loc: `${SITEMAP_ORIGIN}/packages`, changefreq: 'daily', priority: '0.9' },
  { loc: `${SITEMAP_ORIGIN}/stays`, changefreq: 'daily', priority: '0.9' },
  { loc: `${SITEMAP_ORIGIN}/rentals`, changefreq: 'daily', priority: '0.9' },
  { loc: `${SITEMAP_ORIGIN}/about`, changefreq: 'monthly', priority: '0.6' },
  { loc: `${SITEMAP_ORIGIN}/blog`, changefreq: 'weekly', priority: '0.6' },
  { loc: `${SITEMAP_ORIGIN}/contact`, changefreq: 'monthly', priority: '0.6' },
  { loc: `${SITEMAP_ORIGIN}/privacy`, changefreq: 'yearly', priority: '0.3' },
  { loc: `${SITEMAP_ORIGIN}/terms`, changefreq: 'yearly', priority: '0.3' },
  { loc: `${SITEMAP_ORIGIN}/cookies`, changefreq: 'yearly', priority: '0.3' },
  { loc: `${SITEMAP_ORIGIN}/legal-notice`, changefreq: 'yearly', priority: '0.3' },
  { loc: `${SITEMAP_ORIGIN}/affiliate`, changefreq: 'monthly', priority: '0.4' },
  { loc: `${SITEMAP_ORIGIN}/content-creator`, changefreq: 'monthly', priority: '0.4' },
  { loc: 'https://partner.traverion.com/', changefreq: 'monthly', priority: '0.5' },
  { loc: `${SITEMAP_ORIGIN}/sitemap`, changefreq: 'monthly', priority: '0.4' },
];

function familyFromExtras(extras: unknown): string | null {
  if (!extras || typeof extras !== 'object' || Array.isArray(extras)) return null;
  const raw = (extras as { inventoryFamily?: unknown }).inventoryFamily;
  return typeof raw === 'string' ? raw : null;
}

/** Multi-unit stays are not a public product. Keep them out of the sitemap. */
function stayAccommodationMode(extras: unknown): string | null {
  if (!extras || typeof extras !== 'object' || Array.isArray(extras)) return null;
  const record = extras as { accommodationMode?: unknown; stay?: { accommodationMode?: unknown } };
  const nested = record.stay?.accommodationMode;
  const top = record.accommodationMode;
  const mode = typeof nested === 'string' ? nested : top;
  return typeof mode === 'string' ? mode : null;
}

/** Tour or stay path for a published traveler-catalog listing; null if not indexable. */
export function sitemapPathForListing(row: SitemapListingRow, todayIso?: string): string | null {
  if ((row.status ?? '').trim().toLowerCase() !== 'published') return null;
  if (row.is_holiday_package) return null;
  const family = familyFromExtras(row.listing_extras) ?? 'tour';
  if (family === 'stay') {
    if (stayAccommodationMode(row.listing_extras) === 'multi') return null;
    return `/stays/${row.id}`;
  }
  if (family === 'rental') return `/rentals/${row.id}`;
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
      loc: `${SITEMAP_ORIGIN}${path}`,
      changefreq: 'weekly',
      priority: '0.8',
    });
  }
  inventory.sort((a, b) => a.loc.localeCompare(b.loc));
  // Static shell first (home/catalogs), then inventory, then rest of static — match prior human layout:
  const head = STATIC_ENTRIES.slice(0, 4);
  const tail = STATIC_ENTRIES.slice(4);
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
    `  <!-- Generated ${stamp}. Published tours, stays, and rentals. No drafts. -->`,
  ];
  for (const e of entries) {
    lines.push(
      `  <url><loc>${escapeXml(e.loc)}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`
    );
  }
  lines.push('</urlset>', '');
  return lines.join('\n');
}
