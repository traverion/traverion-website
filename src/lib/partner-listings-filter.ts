import { inventoryFamilyFromListing, type InventoryListingSlice } from './inventory';

export type PartnerListingsWorkspaceFilter = 'all' | 'tour' | 'stay' | 'draft' | 'published';

/** Experience / inventory type chips — only show when supported by data. */
export type PartnerListingsTypeFilter = 'all' | 'tour' | 'ticket' | 'transportation' | 'stay';

export function parsePartnerListingsWorkspaceFilter(raw: string | null | undefined): PartnerListingsWorkspaceFilter {
  if (raw === 'tour' || raw === 'stay' || raw === 'draft' || raw === 'published') return raw;
  return 'all';
}

export function parsePartnerListingsTypeFilter(raw: string | null | undefined): PartnerListingsTypeFilter {
  if (raw === 'tour' || raw === 'ticket' || raw === 'transportation' || raw === 'stay') return raw;
  return 'all';
}

export function partnerListingExperienceKind(
  listing: InventoryListingSlice & { experienceKind?: string | null }
): 'tour' | 'ticket' | 'transportation' | 'stay' {
  if (inventoryFamilyFromListing(listing) === 'stay') return 'stay';
  const kind = (listing.experienceKind ?? 'tour').toString().trim().toLowerCase();
  if (kind === 'ticket') return 'ticket';
  if (kind === 'transportation' || kind === 'transport') return 'transportation';
  return 'tour';
}

export function partnerListingMatchesQuery(
  listing: InventoryListingSlice & {
    id?: string | null;
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
  const hay = [listing.title, listing.city, listing.country, listing.destination, listing.id]
    .map((v) => (v ?? '').toString().toLowerCase())
    .join(' ');
  return hay.includes(q);
}

export function filterPartnerListings<
  T extends InventoryListingSlice & {
    id?: string | null;
    title?: string | null;
    city?: string | null;
    country?: string | null;
    destination?: string | null;
    status?: string | null;
    experienceKind?: string | null;
  },
>(
  listings: T[],
  workspaceFilter: PartnerListingsWorkspaceFilter,
  query: string,
  typeFilter: PartnerListingsTypeFilter = 'all'
): T[] {
  return listings.filter((listing) => {
    if (!partnerListingMatchesQuery(listing, query)) return false;
    const family = inventoryFamilyFromListing(listing);
    const isLive = listing.status !== 'draft';
    if (workspaceFilter === 'tour') {
      if (family !== 'tour') return false;
    } else if (workspaceFilter === 'stay') {
      if (family !== 'stay') return false;
    } else if (workspaceFilter === 'draft') {
      if (isLive) return false;
    } else if (workspaceFilter === 'published') {
      if (!isLive) return false;
    }
    if (typeFilter !== 'all' && partnerListingExperienceKind(listing) !== typeFilter) return false;
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

export function partnerListingsTypeCounts(
  listings: Array<InventoryListingSlice & { experienceKind?: string | null; status?: string | null }>
): Record<PartnerListingsTypeFilter, number> {
  const counts: Record<PartnerListingsTypeFilter, number> = {
    all: listings.length,
    tour: 0,
    ticket: 0,
    transportation: 0,
    stay: 0,
  };
  for (const listing of listings) {
    counts[partnerListingExperienceKind(listing)] += 1;
  }
  return counts;
}

const WORKSPACE_FILTER_ORDER: PartnerListingsWorkspaceFilter[] = [
  'all',
  'published',
  'draft',
  'tour',
  'stay',
];

/** Hide empty family/status tabs unless that tab is currently selected. */
export function partnerListingsVisibleWorkspaceFilters(
  counts: Record<PartnerListingsWorkspaceFilter, number>,
  current: PartnerListingsWorkspaceFilter
): PartnerListingsWorkspaceFilter[] {
  return WORKSPACE_FILTER_ORDER.filter((id) => id === 'all' || counts[id] > 0 || current === id);
}

const TYPE_FILTER_ORDER: PartnerListingsTypeFilter[] = [
  'all',
  'tour',
  'ticket',
  'transportation',
  'stay',
];

export function partnerListingsVisibleTypeFilters(
  counts: Record<PartnerListingsTypeFilter, number>,
  current: PartnerListingsTypeFilter
): PartnerListingsTypeFilter[] {
  return TYPE_FILTER_ORDER.filter((id) => id === 'all' || counts[id] > 0 || current === id);
}

export type PartnerListingsSort =
  | 'updated'
  | 'title'
  | 'title_desc'
  | 'created'
  | 'price'
  | 'status'
  | 'family';

function listingTimeMs(raw: string | null | undefined): number {
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function listingPriceValue(listing: { price?: { startingFrom?: number } | null }): number {
  const amount = listing.price?.startingFrom;
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0
    ? amount
    : Number.POSITIVE_INFINITY;
}

/** Stable operator sorts for the partner listings hub. */
export function sortPartnerListings<
  T extends InventoryListingSlice & {
    title?: string | null;
    status?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    price?: { startingFrom?: number } | null;
    listingExtras?: unknown;
  },
>(listings: T[], sort: PartnerListingsSort): T[] {
  const copy = [...listings];
  copy.sort((a, b) => {
    if (sort === 'updated') {
      const diff = listingTimeMs(b.updatedAt) - listingTimeMs(a.updatedAt);
      if (diff !== 0) return diff;
    }
    if (sort === 'created') {
      const diff = listingTimeMs(b.createdAt) - listingTimeMs(a.createdAt);
      if (diff !== 0) return diff;
    }
    if (sort === 'price') {
      const diff = listingPriceValue(a) - listingPriceValue(b);
      if (diff !== 0) return diff;
    }
    if (sort === 'status') {
      const aLive = a.status !== 'draft' ? 0 : 1;
      const bLive = b.status !== 'draft' ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
    }
    if (sort === 'family') {
      const aFam = inventoryFamilyFromListing(a) === 'tour' ? 0 : 1;
      const bFam = inventoryFamilyFromListing(b) === 'tour' ? 0 : 1;
      if (aFam !== bFam) return aFam - bFam;
    }
    const titleCmp = (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' });
    if (sort === 'title_desc') return -titleCmp;
    return titleCmp;
  });
  return copy;
}

export function partnerListingTypeLabel(kind: PartnerListingsTypeFilter): string {
  if (kind === 'ticket') return 'Ticket';
  if (kind === 'transportation') return 'Transport';
  if (kind === 'stay') return 'Stay';
  if (kind === 'tour') return 'Tour';
  return 'All types';
}
