import { describe, expect, it } from 'vitest';
import {
  accumulatePartnerStayCheckOutsByDate,
  accumulatePartnerStayGuestsByDate,
  partnerAvailabilityTreatAsStay,
} from './partner-availability-stay-maps';

describe('partnerAvailabilityTreatAsStay', () => {
  it('Phase 1543: listing family wins; missing listing uses bookingIsStayNight', () => {
    expect(
      partnerAvailabilityTreatAsStay({ listingExtras: { inventoryFamily: 'stay' } } as never, {
        check_out: null,
      })
    ).toBe(true);
    expect(
      partnerAvailabilityTreatAsStay({ listingExtras: { inventoryFamily: 'tour' } } as never, {
        check_out: '2026-12-05',
        nights: 4,
      })
    ).toBe(false);
    expect(
      partnerAvailabilityTreatAsStay(null, {
        check_out: null,
        nights: 3,
      })
    ).toBe(true);
    expect(
      partnerAvailabilityTreatAsStay(undefined, {
        check_out: null,
        nights: null,
        purchase_snapshot: { checkOut: '2026-12-05' },
      })
    ).toBe(true);
    expect(partnerAvailabilityTreatAsStay(null, { check_out: null, nights: null })).toBe(false);
  });
});

describe('accumulatePartnerStayGuestsByDate / checkOuts', () => {
  const paid = {
    status: 'confirmed',
    payment_status: 'paid',
    guests: 2,
    listing_id: 'orphan-stay',
  } as const;

  it('Phase 1543: nights-only orphan occupies full range and check-out morning', () => {
    const bookings = [
      {
        ...paid,
        id: 'n1',
        booking_date: '2026-12-01',
        check_out: null,
        nights: 3,
      },
    ];
    const guests = accumulatePartnerStayGuestsByDate({
      bookings,
      listingById: new Map(),
      viewingAll: true,
    });
    expect([...guests.keys()].sort()).toEqual(['2026-12-01', '2026-12-02', '2026-12-03']);
    const outs = accumulatePartnerStayCheckOutsByDate({
      bookings,
      listingById: new Map(),
      viewingAll: true,
    });
    expect([...outs.keys()]).toEqual(['2026-12-04']);
  });

  it('Phase 1543: snapshot-only orphan occupies purchased range', () => {
    const bookings = [
      {
        ...paid,
        id: 's1',
        booking_date: '2026-12-01',
        check_out: null,
        nights: null,
        purchase_snapshot: { checkOut: '2026-12-05' },
      },
    ];
    const guests = accumulatePartnerStayGuestsByDate({
      bookings,
      listingById: new Map(),
      viewingAll: true,
    });
    expect([...guests.keys()].sort()).toEqual([
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
    ]);
    const outs = accumulatePartnerStayCheckOutsByDate({
      bookings,
      listingById: new Map(),
      viewingAll: true,
    });
    expect([...outs.keys()]).toEqual(['2026-12-05']);
  });
});
