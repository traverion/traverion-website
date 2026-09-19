import { describe, expect, it } from 'vitest';
import {
  filterPartnerListings,
  parsePartnerListingsWorkspaceFilter,
  partnerListingsWorkspaceCounts,
  partnerListingMatchesQuery,
} from './partner-listings-filter';

describe('partner listings filter', () => {
  const tour = {
    title: 'Fjord hike',
    city: 'Bergen',
    country: 'Norway',
    destination: 'Bergen',
    status: 'published',
    listingExtras: { inventoryFamily: 'tour' },
  };
  const stay = {
    title: 'Lake cabin',
    city: 'Tromsø',
    country: 'Norway',
    destination: 'Tromsø',
    status: 'draft',
    listingExtras: { inventoryFamily: 'stay' },
  };

  it('parses workspace filter from URL', () => {
    expect(parsePartnerListingsWorkspaceFilter('stay')).toBe('stay');
    expect(parsePartnerListingsWorkspaceFilter('bogus')).toBe('all');
    expect(parsePartnerListingsWorkspaceFilter(null)).toBe('all');
  });

  it('matches title and place query', () => {
    expect(partnerListingMatchesQuery(tour, 'fjord')).toBe(true);
    expect(partnerListingMatchesQuery(stay, 'troms')).toBe(true);
    expect(partnerListingMatchesQuery(tour, 'cabin')).toBe(false);
  });

  it('filters by workspace and query together', () => {
    const rows = [tour, stay];
    expect(filterPartnerListings(rows, 'stay', '').map((r) => r.title)).toEqual(['Lake cabin']);
    expect(filterPartnerListings(rows, 'draft', '').map((r) => r.title)).toEqual(['Lake cabin']);
    expect(filterPartnerListings(rows, 'all', 'bergen').map((r) => r.title)).toEqual(['Fjord hike']);
    expect(filterPartnerListings(rows, 'published', 'lake')).toEqual([]);
  });

  it('counts workspace tabs from inventory truth', () => {
    expect(partnerListingsWorkspaceCounts([tour, stay])).toEqual({
      all: 2,
      tour: 1,
      stay: 1,
      draft: 1,
      published: 1,
    });
  });
});
