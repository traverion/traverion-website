import { describe, expect, it } from 'vitest';
import {
  buildPriceChips,
  catalogHasParseableDurations,
  collectStayAmenities,
  collectStayPropertyTypes,
  listingLanguageCodes,
  matchesDestination,
  matchesDurationFilter,
  matchesPriceChip,
  matchesRatingFilter,
  nextStayDatePatch,
  marketplaceFamilySwitchPath,
  marketplaceSearchMinSelectableIso,
  parseMarketplaceSort,
  parsePriceChipId,
  stayHasAmenity,
  stayMatchesCatalogFilters,
  stayNightlyAmount,
  tourMatchesCatalogFilters,
} from './marketplaceBrowse';
import type { TourPackage } from '../types/tour';
import { ymdInTimeZone, addCalendarDaysYmd } from './booking-lifecycle-calendar';

function baseTour(overrides: Partial<TourPackage> = {}): TourPackage {
  return {
    id: 'tour-1',
    title: 'Northern Lights Hunting',
    destination: 'Rovaniemi',
    duration: '6 hours',
    style: '',
    startLocation: '',
    endLocation: '',
    price: {
      startingFrom: 149,
      currency: 'EUR',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: '',
    },
    category: '4*',
    tourType: 'adventure',
    validity: '',
    image: '',
    description: '',
    highlights: [],
    itinerary: [],
    includes: [],
    excludes: [],
    hotels: [],
    difficulty: 'Easy',
    groupSize: '8',
    bestTime: '',
    rating: 0,
    reviews: 0,
    isPopular: false,
    city: 'Rovaniemi',
    country: 'Finland',
    tags: ['free-cancellation'],
    ...overrides,
  };
}

function stay(overrides: Partial<TourPackage> = {}): TourPackage {
  return baseTour({
    id: 'stay-1',
    title: 'Arctic Glass Villa',
    listingExtras: {
      inventoryFamily: 'stay',
      stay: {
        propertyType: 'Cabin',
        maxGuests: 4,
        bedrooms: 1,
        nightlyPriceUsd: 189,
        amenities: ['wifi', 'kitchen'],
      },
    },
    ...overrides,
  });
}

describe('marketplace browse filters', () => {
  it('parses known chip ids and rejects unknown values', () => {
    expect(parsePriceChipId('under100')).toBe('under100');
    expect(parsePriceChipId('nope')).toBe('all');
    expect(parseMarketplaceSort('price-asc')).toBe('price-asc');
    expect(parseMarketplaceSort('popular')).toBe('recommended');
  });

  it('buckets headline amounts without inventing a currency', () => {
    expect(matchesPriceChip(99, 'under100')).toBe(true);
    expect(matchesPriceChip(100, 'under100')).toBe(false);
    expect(matchesPriceChip(500, '100-500')).toBe(false);
    expect(matchesPriceChip(500, '500-1000')).toBe(true);
    expect(matchesPriceChip(1001, '1000plus')).toBe(true);
    expect(buildPriceChips(null, () => '€0').map((c) => c.label)).toContain('Under 100');
    expect(buildPriceChips('EUR', (n, c) => `${c}${n}`)[1].label).toBe('Under EUR100');
  });

  it('does not let unreviewed listings pass a minimum-rating filter', () => {
    expect(matchesRatingFilter(null, 'all')).toBe(true);
    expect(matchesRatingFilter(null, '4')).toBe(false);
    expect(matchesRatingFilter(4.2, '4')).toBe(true);
    expect(matchesRatingFilter(4.2, '45')).toBe(false);
    expect(matchesRatingFilter(4.5, '45')).toBe(true);
  });

  it('filters duration only when the listing duration is parseable', () => {
    expect(matchesDurationFilter('6 hours', '6plus')).toBe(true);
    expect(matchesDurationFilter('2 hours', 'under3')).toBe(true);
    expect(matchesDurationFilter('4 hours', '3to6')).toBe(true);
    expect(matchesDurationFilter('Half day', 'under3')).toBe(false);
    expect(catalogHasParseableDurations([baseTour({ duration: 'Half day' })])).toBe(false);
    expect(catalogHasParseableDurations([baseTour()])).toBe(true);
  });

  it('matches destination by city or country, not by free-text coincidence', () => {
    const opts = [
      { id: 'all', label: 'All', type: 'world' as const },
      { id: 'finland', label: 'Finland', type: 'region' as const },
      { id: 'rovaniemi', label: 'Rovaniemi', type: 'city' as const },
    ];
    expect(matchesDestination(baseTour(), 'rovaniemi', opts)).toBe(true);
    expect(matchesDestination(baseTour({ city: 'Levi' }), 'rovaniemi', opts)).toBe(false);
    expect(matchesDestination(baseTour(), 'finland', opts)).toBe(true);
  });

  it('reads stay nightly price and property facts from extras', () => {
    expect(stayNightlyAmount(stay())).toBe(189);
    expect(collectStayPropertyTypes([stay()])).toEqual(['Cabin']);
    expect(collectStayAmenities([stay()])).toEqual(['Kitchen', 'Wifi']);
    expect(stayHasAmenity(stay(), 'Wifi')).toBe(true);
    expect(stayHasAmenity(stay(), 'Parking')).toBe(false);
  });

  it('filters stays by guests, type, amenities, and nightly price', () => {
    const cabin = stay();
    expect(
      stayMatchesCatalogFilters(cabin, {
        q: 'arctic',
        guests: '4',
        propertyType: 'Cabin',
        price: '100-500',
        amenities: ['Wifi'],
        rating: 'all',
        ratingScore: null,
      })
    ).toBe(true);
    expect(
      stayMatchesCatalogFilters(cabin, {
        q: '',
        guests: '8',
        propertyType: 'all',
        price: 'all',
        amenities: [],
        rating: 'all',
        ratingScore: null,
      })
    ).toBe(false);
    expect(
      stayMatchesCatalogFilters(cabin, {
        q: '',
        guests: '',
        propertyType: 'Dome',
        price: 'all',
        amenities: [],
        rating: 'all',
        ratingScore: null,
      })
    ).toBe(false);
  });

  it('filters tours by language codes actually stored on the listing', () => {
    const tour = baseTour({
      experienceLanguage: 'en',
      listingExtras: { additionalLanguages: ['fi'] },
    });
    expect(listingLanguageCodes(tour)).toEqual(['en', 'fi']);
    expect(
      tourMatchesCatalogFilters(tour, {
        q: '',
        destinationId: 'all',
        destinationOptions: [{ id: 'all', label: 'All', type: 'world' }],
        tags: [],
        price: 'all',
        date: '',
        guests: '',
        privateOnly: false,
        rating: 'all',
        duration: 'all',
        language: 'fi',
        ratingScore: null,
        partyMax: 8,
        runsOnDate: true,
      })
    ).toBe(true);
    expect(
      tourMatchesCatalogFilters(tour, {
        q: '',
        destinationId: 'all',
        destinationOptions: [{ id: 'all', label: 'All', type: 'world' }],
        tags: [],
        price: 'all',
        date: '',
        guests: '',
        privateOnly: false,
        rating: 'all',
        duration: 'all',
        language: 'de',
        ratingScore: null,
        partyMax: 8,
        runsOnDate: true,
      })
    ).toBe(false);
  });

  it('bumps stay check-out when check-in would invert the range', () => {
    expect(nextStayDatePatch({ date: '2026-09-20', checkout: '2026-09-21' }, '2026-09-22')).toEqual({
      date: '2026-09-22',
      checkout: '2026-09-23',
    });
    expect(nextStayDatePatch({ date: '2026-09-20', checkout: '2026-09-25' }, '2026-09-21')).toEqual({
      date: '2026-09-21',
    });
  });

  it('carries where/when/who when switching browse families', () => {
    expect(
      marketplaceFamilySwitchPath('stays', { q: 'Rovaniemi', date: '2026-09-22', guests: '2' })
    ).toBe('/stays?q=Rovaniemi&date=2026-09-22&checkout=2026-09-23&guests=2');
    expect(
      marketplaceFamilySwitchPath('tours', { q: 'Rovaniemi', date: '2026-09-22', checkout: '2026-09-25', guests: '2' })
    ).toBe('/packages?q=Rovaniemi&date=2026-09-22&guests=2');
    expect(marketplaceFamilySwitchPath('tours', {})).toBe('/packages');
  });

  it('browse date floor is UTC-yesterday, not browser-local today (Phase 1095)', () => {
    // 2026-09-15 22:30 UTC → UTC today Sep 15 → floor Sep 14
    const now = Date.UTC(2026, 8, 15, 22, 30, 0);
    const utcToday = ymdInTimeZone(now, 'UTC');
    expect(utcToday).toBe('2026-09-15');
    expect(marketplaceSearchMinSelectableIso(now)).toBe(addCalendarDaysYmd('2026-09-15', -1));
    expect(marketplaceSearchMinSelectableIso(now)).toBe('2026-09-14');
  });
});
