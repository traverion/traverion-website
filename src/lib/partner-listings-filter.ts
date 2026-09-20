import { inventoryFamilyFromListing, type InventoryListingSlice } from './inventory';

export type PartnerListingsWorkspaceFilter = 'all' | 'tour' | 'stay' | 'draft' | 'published';

export function parsePartnerListingsWorkspaceFilter(raw: string | null | undefined): PartnerListingsWorkspaceFilter {
  if (raw === 'tour' || raw === 'stay' || raw === 'draft' || raw === 'published') return raw;
  return 'all';
}

export function partnerListingMatchesQuery(
  listing: InventoryListingSlice & {
    title?: string | null;
    city?: string | null;
    country?: string | null;
    destination?: string | null;
    status?: string | null;
  },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [listing.title, listing.city, listing.country, listing.destination]
    .map((v) => (v ?? '').toString().toLowerCase())
    .join(' ');
  return hay.includes(q);
}

export function filterPartnerListings<
  T extends InventoryListingSlice & {
    title?: string | null;
    city?: string | null;
    country?: string | null;
    destination?: string | null;
    status?: string | null;
  },
>(listings: T[], workspaceFilter: PartnerListingsWorkspaceFilter, query: string): T[] {
  return listings.filter((listing) => {
    if (!partnerListingMatchesQuery(listing, query)) return false;
    const family = inventoryFamilyFromListing(listing);
    const isLive = listing.status !== 'draft';
    if (workspaceFilter === 'tour') return family === 'tour';
    if (workspaceFilter === 'stay') return family === 'stay';
    if (workspaceFilter === 'draft') return !isLive;
    if (workspaceFilter === 'published') return isLive;
    return true;
  });
}

export function partnerListingsWorkspaceCounts(
  listings: Array<InventoryListingSlice & { status?: string | null }>
): Record<PartnerListingsWorkspaceFilter, number> {
  let tour = 0;
  let stay = 0;
  let draft = 0;
  let published = 0;
  for (const listing of listings) {
    const family = inventoryFamilyFromListing(listing);
    const isLive = listing.status !== 'draft';
    if (family === 'tour') tour += 1;
    if (family === 'stay') stay += 1;
    if (!isLive) draft += 1;
    else published += 1;
  }
  return {
    all: listings.length,
    tour,
    stay,
    draft,
    published,
  };
}

const WORKSPACE_FILTER_ORDER: PartnerListingsWorkspaceFilter[] = [
  'all',
  'tour',
  'stay',
  'draft',
  'published',
];

/** Hide empty family/status tabs unless that tab is currently selected. */
export function partnerListingsVisibleWorkspaceFilters(
  counts: Record<PartnerListingsWorkspaceFilter, number>,
  current: PartnerListingsWorkspaceFilter
): PartnerListingsWorkspaceFilter[] {
  return WORKSPACE_FILTER_ORDER.filter((id) => id === 'all' || counts[id] > 0 || current === id);
}
