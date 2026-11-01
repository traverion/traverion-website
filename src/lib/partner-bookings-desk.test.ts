import { describe, expect, it } from 'vitest';
import { addCalendarDaysYmd } from './booking-lifecycle-calendar';
import {
  applyPartnerBookingsDesk,
  comparePartnerBookingsDesk,
  partnerBookingListBadgeLabel,
  type PartnerBookingsDeskRow,
} from './partner-bookings-desk';
import { scheduleTodayIsoForBooking } from './trip-views';

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
  optionId: '',
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

  it('searches name, email, phone, reference, option, and booking id across the full set', () => {
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, search: 'grace' }, extras).map((r) => r.id)).toEqual(['a']);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, search: 'ADA@' }, extras).map((r) => r.id)).toEqual(['c', 'b']);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, search: 'tv-ab23' }, extras)).toHaveLength(3);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, search: '#42' }, extras)).toHaveLength(3);
    expect(applyPartnerBookingsDesk(rows, { ...baseQuery, search: 'nope' }, extras)).toHaveLength(0);
    const withOption = applyPartnerBookingsDesk(rows, { ...baseQuery, search: 'aurora' }, {
      ...extras,
      optionLabel: (b) => (b.id === 'a' ? 'Aurora evening' : ''),
    });
    expect(withOption.map((r) => r.id)).toEqual(['a']);
    const withPhone = applyPartnerBookingsDesk(rows, { ...baseQuery, search: '401234' }, {
      ...extras,
      guestPhone: (b) => (b.id === 'a' ? '+358 40 123 4567' : ''),
    });
    expect(withPhone.map((r) => r.id)).toEqual(['a']);
  });

  it('filters by option id when provided', () => {
    const filtered = applyPartnerBookingsDesk(rows, { ...baseQuery, optionId: 'opt-a' }, {
      ...extras,
      optionId: (b) => (b.id === 'a' ? 'opt-a' : 'opt-other'),
    });
    expect(filtered.map((r) => r.id)).toEqual(['a']);
  });

  it('shows only Cancelled on collapsed list badges', () => {
    expect(partnerBookingListBadgeLabel('confirmed')).toBeNull();
    expect(partnerBookingListBadgeLabel('pending')).toBeNull();
    expect(partnerBookingListBadgeLabel('completed')).toBeNull();
    expect(partnerBookingListBadgeLabel('cancelled')).toBe('Cancelled');
  });

  it('filters yesterday/today/tomorrow travel windows for operating trips', () => {
    const nowMs = Date.parse('2026-10-17T12:00:00.000Z');
    const dayExtras = { ...extras, nowMs };
    const probe = row({ id: 'probe', created_at: '2026-10-01T10:00:00.000Z', booking_date: '2026-01-01' });
    const today = scheduleTodayIsoForBooking(probe, nowMs);
    const yesterday = addCalendarDaysYmd(today, -1)!;
    const tomorrow = addCalendarDaysYmd(today, 1)!;
    const dayRows = [
      row({ id: 'y', created_at: '2026-10-01T10:00:00.000Z', booking_date: yesterday, status: 'confirmed' }),
      row({ id: 't', created_at: '2026-10-01T10:00:00.000Z', booking_date: today, status: 'confirmed' }),
      row({ id: 'm', created_at: '2026-10-01T10:00:00.000Z', booking_date: tomorrow, status: 'confirmed' }),
      row({ id: 'x', created_at: '2026-10-01T10:00:00.000Z', booking_date: today, status: 'cancelled' }),
    ];
    expect(applyPartnerBookingsDesk(dayRows, { ...baseQuery, travel: 'yesterday' }, dayExtras).map((r) => r.id)).toEqual([
      'y',
    ]);
    expect(applyPartnerBookingsDesk(dayRows, { ...baseQuery, travel: 'today' }, dayExtras).map((r) => r.id)).toEqual([
      't',
    ]);
    expect(applyPartnerBookingsDesk(dayRows, { ...baseQuery, travel: 'tomorrow' }, dayExtras).map((r) => r.id)).toEqual([
      'm',
    ]);
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

  it('keeps rentals on the rental desk only', () => {
    const mixed = [
      row({ id: 'tour-1', created_at: '2026-10-02T10:00:00.000Z', listing_id: 'tour-listing' }),
      row({
        id: 'rental-1',
        created_at: '2026-10-04T10:00:00.000Z',
        listing_id: 'rental-listing',
        check_out: '2030-01-05',
        nights: 2,
        purchase_snapshot: { inventoryFamily: 'rental' },
      }),
    ];
    const rentalIds = new Set(['rental-1']);
    const rentalExtras = {
      ...extras,
      isStay: () => false,
      isRental: (b: PartnerBookingsDeskRow) => rentalIds.has(b.id),
    };
    const tourDesk = applyPartnerBookingsDesk(
      mixed,
      { ...baseQuery, inventoryFamily: 'tour' },
      rentalExtras
    );
    const rentalDesk = applyPartnerBookingsDesk(
      mixed,
      { ...baseQuery, inventoryFamily: 'rental' },
      rentalExtras
    );
    expect(tourDesk.map((r) => r.id)).toEqual(['tour-1']);
    expect(rentalDesk.map((r) => r.id)).toEqual(['rental-1']);
  });
});
