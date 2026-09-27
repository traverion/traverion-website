import { describe, expect, it } from 'vitest';
import { resolveBookingTiedContent } from './notify-customer-content';

const BOOKING_ID = 'booking-abc';

describe('resolveBookingTiedContent (Phase 1052 content-forgery fix)', () => {
  it('prefers purchase_snapshot title over live listing title', () => {
    const result = resolveBookingTiedContent({
      kind: 'booking_confirmed_paid',
      bookingId: BOOKING_ID,
      bookingRow: {
        guest_name: 'Alex',
        booking_date: '2026-10-01',
        guests: 2,
        booking_number: 4242,
        purchase_snapshot: {
          listingTitle: 'Purchased Northern Lights',
          meetingPoint: 'Hotel lobby',
          capturedAt: '2026-09-01T12:00:00Z',
        },
      },
      listingRow: { id: 'l1', title: 'RENAMED AFTER PURCHASE' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overrides.listingTitle).toBe('Purchased Northern Lights');
    expect(result.overrides.meetingPoint).toBe('Hotel lobby');
    expect(result.overrides.customerName).toBe('Alex');
    expect(result.overrides.bookingDate).toBe('2026-10-01');
    expect(result.overrides.guests).toBe(2);
    expect(result.overrides.bookingNumber).toBe(4242);
  });

  it('falls back to live listing title when snapshot has no title', () => {
    const result = resolveBookingTiedContent({
      kind: 'experience_reminder',
      bookingId: BOOKING_ID,
      bookingRow: { guest_name: 'Alex', booking_date: '2026-10-01', guests: 1 },
      listingRow: { id: 'l1', title: 'Live title' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overrides.listingTitle).toBe('Live title');
  });

  it('marks stay from inventoryFamily or check_out', () => {
    const byFamily = resolveBookingTiedContent({
      kind: 'review_request',
      bookingId: BOOKING_ID,
      bookingRow: { guest_name: 'M', booking_date: '2026-11-01', check_out: '2026-11-03', guests: 2 },
      listingRow: { id: 'l1', title: 'Cabin', listing_extras: { inventoryFamily: 'stay' } },
    });
    expect(byFamily.ok).toBe(true);
    if (!byFamily.ok) return;
    expect(byFamily.overrides.listingKind).toBe('stay');
    expect(byFamily.overrides.checkOutDate).toBe('2026-11-03');

    const byCheckout = resolveBookingTiedContent({
      kind: 'review_request',
      bookingId: BOOKING_ID,
      bookingRow: { guest_name: 'M', booking_date: '2026-11-01', check_out: '2026-11-03', guests: 2 },
      listingRow: { id: 'l1', title: 'Cabin' },
    });
    expect(byCheckout.ok).toBe(true);
    if (!byCheckout.ok) return;
    expect(byCheckout.overrides.listingKind).toBe('stay');
  });

  it('rejects booking-tied kind without bookingId', () => {
    expect(
      resolveBookingTiedContent({
        kind: 'pickup_changed',
        bookingId: undefined,
        bookingRow: { guest_name: 'X' },
        listingRow: { title: 'T' },
      })
    ).toEqual({ ok: false, error: 'bookingId required for this emailKind', status: 400 });
  });

  it('rejects missing booking row', () => {
    expect(
      resolveBookingTiedContent({
        kind: 'booking_cancelled',
        bookingId: BOOKING_ID,
        bookingRow: null,
        listingRow: { title: 'T' },
      })
    ).toEqual({ ok: false, error: 'Booking not found', status: 404 });
  });

  it('traveler_welcome returns empty overrides', () => {
    expect(
      resolveBookingTiedContent({
        kind: 'traveler_welcome',
        bookingId: undefined,
        bookingRow: undefined,
        listingRow: undefined,
      })
    ).toEqual({ ok: true, overrides: {} });
  });
});
