import { describe, expect, it } from 'vitest';
import { rowToTourPackage, tourPackageToRow, type ListingRow } from './supabase-listings';

function minimalRow(overrides: Partial<ListingRow> = {}): ListingRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    supplier_id: '22222222-2222-4222-8222-222222222222',
    title: 'Aurora',
    destination: 'Rovaniemi',
    duration: '3 hours',
    style: 'Tour',
    start_location: null,
    end_location: null,
    price_starting_from: 99,
    price_currency: 'EUR',
    category: null,
    tour_type: null,
    validity: null,
    image: 'https://example.com/hero.jpg',
    description: 'Hunt',
    highlights: [],
    itinerary: [],
    includes: [],
    excludes: [],
    difficulty: null,
    group_size: null,
    best_time: null,
    rating: 0,
    reviews: 0,
    is_popular: false,
    city: null,
    region: null,
    country: null,
    tags: null,
    status: 'published',
    cancellation_policy: null,
    meeting_point: null,
    pickup_instructions: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Phase 1236: group_size mapping fail-closed', () => {
  it('does not invent 2-12 People when DB group_size is null', () => {
    const tour = rowToTourPackage(minimalRow({ group_size: null }));
    expect(tour.groupSize).toBe('');
  });

  it('preserves an explicit group_size from the DB', () => {
    const tour = rowToTourPackage(minimalRow({ group_size: '1-6 People' }));
    expect(tour.groupSize).toBe('1-6 People');
  });

  it('does not invent 2-12 People when writing a blank groupSize', () => {
    const row = tourPackageToRow({
      title: 'Aurora',
      destination: 'Rovaniemi',
      duration: '3 hours',
      price: { startingFrom: 99 },
      groupSize: '',
    });
    expect(row.group_size).toBeNull();
  });

  it('Phase 1253: does not invent pickup window 0/30 when unset', () => {
    const tour = rowToTourPackage(minimalRow());
    expect(tour.pickupWindowMinutesBeforeMin).toBeUndefined();
    expect(tour.pickupWindowMinutesBeforeMax).toBeUndefined();
    const row = tourPackageToRow({
      title: 'Aurora',
      destination: 'Rovaniemi',
      duration: '3 hours',
      price: { startingFrom: 99 },
    });
    expect(row.pickup_window_minutes_before_min).toBeNull();
    expect(row.pickup_window_minutes_before_max).toBeNull();
  });
});
