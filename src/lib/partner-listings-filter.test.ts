import { describe, expect, it } from 'vitest';
import {
  filterPartnerListings,
  parsePartnerListingsTypeFilter,
  parsePartnerListingsWorkspaceFilter,
  partnerListingsTypeCounts,
  partnerListingsVisibleTypeFilters,
  partnerListingsVisibleWorkspaceFilters,
  partnerListingsWorkspaceCounts,
  partnerListingExperienceKind,
  partnerListingMatchesQuery,
  sortPartnerListings,
} from './partner-listings-filter';

describe('partner listings filter', () => {
  const tour = {
    id: 'abc-123',
    title: 'Fjord hike',
    city: 'Bergen',
    country: 'Norway',
    destination: 'Bergen',
    status: 'published',
    experienceKind: 'tour' as const,
    listingExtras: { inventoryFamily: 'tour' },
    price: { startingFrom: 120 },
    updatedAt: '2026-10-10T12:00:00.000Z',
    createdAt: '2026-09-01T12:00:00.000Z',
  };
  const ticket = {
    id: 'ticket-9',
    title: 'Museum entry',
    city: 'Oslo',
    country: 'Norway',
    destination: 'Oslo',
    status: 'published',
    experienceKind: 'ticket' as const,
    listingExtras: { inventoryFamily: 'tour' },
    price: { startingFrom: 25 },
    updatedAt: '2026-10-12T12:00:00.000Z',
    createdAt: '2026-09-10T12:00:00.000Z',
  };
  const stay = {
    id: 'stay-1',
    title: 'Lake cabin',
    city: 'Tromsø',
    country: 'Norway',
    destination: 'Tromsø',
    status: 'draft',
    listingExtras: { inventoryFamily: 'stay' },
    price: { startingFrom: 200 },
    updatedAt: '2026-10-01T12:00:00.000Z',
    createdAt: '2026-08-01T12:00:00.000Z',
  };

  it('parses workspace filter from URL', () => {
    expect(parsePartnerListingsWorkspaceFilter('stay')).toBe('stay');
    expect(parsePartnerListingsWorkspaceFilter('bogus')).toBe('all');
    expect(parsePartnerListingsWorkspaceFilter(null)).toBe('all');
    expect(parsePartnerListingsTypeFilter('ticket')).toBe('ticket');
    expect(parsePartnerListingsTypeFilter('nope')).toBe('all');
  });

  it('matches title, place, and reference query', () => {
    expect(partnerListingMatchesQuery(tour, 'fjord')).toBe(true);
    expect(partnerListingMatchesQuery(stay, 'troms')).toBe(true);
    expect(partnerListingMatchesQuery(tour, 'cabin')).toBe(false);
    expect(partnerListingMatchesQuery(tour, 'abc-123')).toBe(true);
  });

  it('filters by workspace, type, and query together', () => {
    const rows = [tour, ticket, stay];
    expect(filterPartnerListings(rows, 'stay', '').map((r) => r.title)).toEqual(['Lake cabin']);
    expect(filterPartnerListings(rows, 'draft', '').map((r) => r.title)).toEqual(['Lake cabin']);
    expect(filterPartnerListings(rows, 'all', 'bergen').map((r) => r.title)).toEqual(['Fjord hike']);
    expect(filterPartnerListings(rows, 'published', 'lake')).toEqual([]);
    expect(filterPartnerListings(rows, 'tour', '', 'ticket').map((r) => r.title)).toEqual(['Museum entry']);
    expect(partnerListingExperienceKind(ticket)).toBe('ticket');
  });

  it('counts workspace tabs from inventory truth', () => {
    expect(partnerListingsWorkspaceCounts([tour, stay])).toEqual({
      all: 2,
      tour: 1,
      stay: 1,
      draft: 1,
      published: 1,
    });
    expect(partnerListingsTypeCounts([tour, ticket, stay])).toMatchObject({
      all: 3,
      tour: 1,
      ticket: 1,
      stay: 1,
    });
  });

  it('hides empty workspace tabs unless they are selected', () => {
    const tourOnly = partnerListingsWorkspaceCounts([tour]);
    expect(partnerListingsVisibleWorkspaceFilters(tourOnly, 'all')).toEqual([
      'all',
      'published',
      'tour',
    ]);
    expect(partnerListingsVisibleWorkspaceFilters(tourOnly, 'stay')).toEqual([
      'all',
      'published',
      'tour',
      'stay',
    ]);
    const types = partnerListingsTypeCounts([tour, ticket]);
    expect(partnerListingsVisibleTypeFilters(types, 'all')).toEqual(['all', 'tour', 'ticket']);
  });

  it('sorts by updated, title direction, and price', () => {
    const byUpdated = sortPartnerListings([stay, tour, ticket], 'updated');
    expect(byUpdated.map((l) => l.title)).toEqual(['Museum entry', 'Fjord hike', 'Lake cabin']);
    const byTitleDesc = sortPartnerListings([stay, tour], 'title_desc');
    expect(byTitleDesc.map((l) => l.title)).toEqual(['Lake cabin', 'Fjord hike']);
    const byPrice = sortPartnerListings([stay, tour, ticket], 'price');
    expect(byPrice.map((l) => l.title)).toEqual(['Museum entry', 'Fjord hike', 'Lake cabin']);
    const byStatus = sortPartnerListings([stay, tour], 'status');
    expect(byStatus.map((l) => l.title)).toEqual(['Fjord hike', 'Lake cabin']);
  });
});
