import { describe, expect, it } from 'vitest';
import { applyPartnerBookingsDesk, comparePartnerBookingsDesk, type PartnerBookingsDeskRow } from './partner-bookings-desk';

function row(over: Partial<PartnerBookingsDeskRow> & Pick<PartnerBookingsDeskRow, 'id' | 'created_at'>): PartnerBookingsDeskRow {
  return {
    listing_id: 'listing-1',
    guest_name: 'Ada Lovelace',
    guest_email: 'ada@example.com',
    booking_date: '2026-11-02',
    status: 'confirmed',
    payment_status: 'paid',
    booking_number: 42,
    public_reference: 'TV-AB23CD45',
    amount_paid: 120,
    ...over,
  };
}

const baseQuery = {
  search: '',
  travel: 'all' as const,
  travelFrom: '',
  travelTo: '',
  purchaseFrom: '',
  purchaseTo: '',
  status: '',
  payment: '' as const,
  listingId: '',
  ops: 'all' as const,
  sort: 'newest' as const,
};

const extras = {
  nowMs: Date.UTC(2026, 9, 17, 9, 0, 0),
  isStay: () => false,
  pickupAttention: () => false,
  openCancel: () => false,
  title: () => 'Northern lights',
  startHm: () => '18:00',
};

describe('partner bookings desk', () => {
  const rows = [
    row({ id: 'b', created_at: '2026-10-01T10:00:00.000Z', amount_paid: 80, booking_date: '2026-12-01' }),
    row({ id: 'a', created_at: '2026-10-02T10:00:00.000Z', guest_name: 'Grace Hopper', guest_email: 'grace@example.com', amount_paid: 200 }),
    row({ id: 'c', created_at: '2026-10-02T10:00:00.000Z', status: 'cancelled', payment_status: 'refunded', amount_paid: 50 }),
  ];

  it('defaults to every booking, newest first, with a stable id tie-break', () => {
    const ordered = applyPartnerBookingsDesk(rows, baseQuery, extras);
    expect(ordered.map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('searches name, email, reference, and booking id across the full set', () => {
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, search: 'grace' }, extras).map((r) => r.id)).toEqual(['a']);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, search: 'ADA@' }, extras).map((r) => r.id)).toEqual(['c', 'b']);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, search: 'tv-ab23' }, extras)).toHaveLength(3);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, search: '#42' }, extras)).toHaveLength(3);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, search: 'nope' }, extras)).toHaveLength(0);
  });

  it('filters status and payment, then sorts the whole result', () => {
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, status: 'cancelled' }, extras).map((r) => r.id)).toEqual(['c']);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, payment: 'refunded' }, extras).map((r) => r.id)).toEqual(['c']);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, sort: 'value_desc' }, extras).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, sort: 'oldest' }, extras).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, sort: 'travel_asc' }, extras).map((r) => r.id)[0]).toBe('a');
  });

  it('keeps equal travel dates ordered by id', () => {
    const same = [
      row({ id: 'z', created_at: '2026-01-01T00:00:00.000Z', booking_date: '2026-11-02' }),
      row({ id: 'm', created_at: '2026-01-01T00:00:00.000Z', booking_date: '2026-11-02' }),
    ];
    expect(comparePartnerBookingsDesk(same[0], same[1], 'travel_asc', () => '18:00')).toBeGreaterThan(0);
  });

  it('separates Bookings (tour) from Reservations (stay) with no cross-family leak', () => {
    const mixed = [
      row({ id: 'tour-1', created_at: '2026-10-02T10:00:00.000Z', listing_id: 'tour-listing' }),
      row({
        id: 'stay-1',
        created_at: '2026-10-03T10:00:00.000Z',
        listing_id: 'stay-listing',
        check_out: '2026-11-05',
        nights: 3,
      }),
    ];
    const stayIds = new Set(['stay-1']);
    const stayExtras = {
      ...extras,
      isStay: (b: PartnerBookingsDeskRow) => stayIds.has(b.id),
    };
    const tourDesk = applyPartnerBookingsDesk(
      mixed,
      { ...baseQuery, inventoryFamily: 'tour', highlightBookingId: 'stay-1' },
      stayExtras
    );
    const stayDesk = applyPartnerBookingsDesk(
      mixed,
      { ...baseQuery, inventoryFamily: 'stay', highlightBookingId: 'tour-1' },
      stayExtras
    );
    expect(tourDesk.map((r) => r.id)).toEqual(['tour-1']);
    expect(stayDesk.map((r) => r.id)).toEqual(['stay-1']);
    // Neither desk duplicates the other family's confirmed row.
    expect(tourDesk.some((r) => r.id === 'stay-1')).toBe(false);
    expect(stayDesk.some((r) => r.id === 'tour-1')).toBe(false);
  });
});
