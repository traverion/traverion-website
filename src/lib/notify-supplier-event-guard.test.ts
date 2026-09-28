import { describe, expect, it } from 'vitest';
import {
  isAuthorizedSupplierSelfNotifyCaller,
  isBookingTiedSupplierEvent,
  isReviewTiedSupplierEvent,
  isSupplierSelfNotifyEvent,
  resolveSupplierEventContext,
} from './notify-supplier-event-guard';

// Phase 579: notify-supplier-event's recipient resolution was already safe
// (always DB-derived from supplierId), but every content field was trusted
// verbatim from the request for every eventType -- so an attacker who knew
// or guessed a real supplierId could trigger a fully fabricated "new
// booking", "booking cancelled", "cancellation accepted/declined", or "new
// review" notification to that supplier's real inbox. This tests the
// authoritative fix: every booking-tied eventType now requires
// bookingId+listingId and re-derives its fields from the real
// bookings/listings rows; new_review now requires reviewId+listingId and
// re-derives from the real reviews row; the ownership chain (booking/review
// -> listing -> supplierId) is verified at every step.

const REAL_SUPPLIER = 'supplier-1';
const OTHER_SUPPLIER = 'supplier-2';
const REAL_LISTING = 'listing-1';
const OTHER_LISTING = 'listing-2';
const REAL_BOOKING = 'booking-1';
const REAL_REVIEW = 'review-1';

const listingRow = { id: REAL_LISTING, supplier_id: REAL_SUPPLIER, title: 'Real Northern Lights Tour' };
const bookingRow = {
  id: REAL_BOOKING,
  listing_id: REAL_LISTING,
  guest_name: 'Real Guest',
  booking_date: '2026-12-01',
  guests: 2,
  booking_number: 42,
  payment_status: 'paid',
};
const reviewRow = { id: REAL_REVIEW, listing_id: REAL_LISTING, rating: 5, title: 'Loved it', guest_name: 'Real Guest' };

describe('isBookingTiedSupplierEvent / isReviewTiedSupplierEvent', () => {
  it('classifies every eventType correctly', () => {
    expect(isBookingTiedSupplierEvent('new_booking')).toBe(true);
    expect(isBookingTiedSupplierEvent('booking_cancelled')).toBe(true);
    expect(isBookingTiedSupplierEvent('guest_message')).toBe(true);
    expect(isBookingTiedSupplierEvent('booking_detail_changed')).toBe(true);
    expect(isBookingTiedSupplierEvent('host_schedule_updated')).toBe(true);
    expect(isBookingTiedSupplierEvent('cancellation_accepted')).toBe(true);
    expect(isBookingTiedSupplierEvent('cancellation_declined')).toBe(true);
    expect(isBookingTiedSupplierEvent('new_review')).toBe(false);
    expect(isBookingTiedSupplierEvent('supplier_welcome')).toBe(false);
    expect(isBookingTiedSupplierEvent('verification_submitted')).toBe(false);
    expect(isReviewTiedSupplierEvent('new_review')).toBe(true);
    expect(isReviewTiedSupplierEvent('new_booking')).toBe(false);
  });
});

describe('resolveSupplierEventContext: booking-tied events (Phase 579 content-forgery fix)', () => {
  const bookingTiedKinds = [
    'new_booking',
    'booking_cancelled',
    'guest_message',
    'booking_detail_changed',
    'host_schedule_updated',
    'cancellation_accepted',
    'cancellation_declined',
  ] as const;

  it('Phase 1479: prefers purchase_snapshot listing title over live listings.title after partner rename', () => {
    const renamedListing = { ...listingRow, title: 'Renamed marketing title' };
    const bookedRow = {
      ...bookingRow,
      purchase_snapshot: {
        listingTitle: 'Purchased Northern Lights Tour',
        capturedAt: '2026-01-01T00:00:00.000Z',
      },
    };
    const result = resolveSupplierEventContext({
      eventType: 'guest_message',
      supplierId: REAL_SUPPLIER,
      bookingId: REAL_BOOKING,
      listingId: REAL_LISTING,
      reviewId: undefined,
      listingRow: renamedListing,
      bookingRow: bookedRow,
      reviewRow: undefined,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.overrides.listingTitle).toBe('Purchased Northern Lights Tour');
    }
  });

  it.each(bookingTiedKinds)(
    'closes the content-forgery gap for %s: real booking/listing -> real field values, not caller-fabricated ones',
    (eventType) => {
      const result = resolveSupplierEventContext({
        eventType,
        supplierId: REAL_SUPPLIER,
        bookingId: REAL_BOOKING,
        listingId: REAL_LISTING,
        reviewId: undefined,
        listingRow,
        bookingRow,
        reviewRow: undefined,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.overrides.listingTitle).toBe('Real Northern Lights Tour');
        expect(result.overrides.guestName).toBe('Real Guest');
        expect(result.overrides.bookingDate).toBe('2026-12-01');
        expect(result.overrides.guests).toBe(2);
        expect(result.overrides.bookingNumber).toBe(42);
      }
    }
  );

  it('rejects a booking-tied event missing bookingId or listingId (400)', () => {
    expect(
      resolveSupplierEventContext({
        eventType: 'booking_cancelled',
        supplierId: REAL_SUPPLIER,
        bookingId: undefined,
        listingId: REAL_LISTING,
        reviewId: undefined,
        listingRow,
        bookingRow: undefined,
        reviewRow: undefined,
      })
    ).toEqual({ ok: false, error: 'bookingId and listingId required for this eventType', status: 400 });
  });

  it('fails closed (404) when the cited booking or listing does not exist', () => {
    expect(
      resolveSupplierEventContext({
        eventType: 'cancellation_accepted',
        supplierId: REAL_SUPPLIER,
        bookingId: 'does-not-exist',
        listingId: REAL_LISTING,
        reviewId: undefined,
        listingRow,
        bookingRow: null,
        reviewRow: undefined,
      })
    ).toEqual({ ok: false, error: 'Booking or listing not found', status: 404 });
  });

  it('rejects (403) when the booking does not actually belong to the given listing (cross-listing forgery attempt)', () => {
    expect(
      resolveSupplierEventContext({
        eventType: 'new_booking',
        supplierId: REAL_SUPPLIER,
        bookingId: REAL_BOOKING,
        listingId: OTHER_LISTING,
        reviewId: undefined,
        listingRow: { id: OTHER_LISTING, supplier_id: REAL_SUPPLIER, title: 'A different listing' },
        bookingRow, // bookingRow.listing_id is REAL_LISTING, not OTHER_LISTING
        reviewRow: undefined,
      })
    ).toEqual({ ok: false, error: 'Booking does not belong to the given listing', status: 403 });
  });

  it('rejects (403) when the listing does not actually belong to the claimed supplierId (the core exploit: attacker cites a real booking but claims the wrong/attacker-controlled supplierId)', () => {
    expect(
      resolveSupplierEventContext({
        eventType: 'booking_cancelled',
        supplierId: OTHER_SUPPLIER,
        bookingId: REAL_BOOKING,
        listingId: REAL_LISTING,
        reviewId: undefined,
        listingRow, // listingRow.supplier_id is REAL_SUPPLIER, not OTHER_SUPPLIER
        bookingRow,
        reviewRow: undefined,
      })
    ).toEqual({ ok: false, error: 'Listing does not belong to the given supplier', status: 403 });
  });

  it('new_booking also re-derives bookingPaymentStatus from the real payment_status column', () => {
    const paid = resolveSupplierEventContext({
      eventType: 'new_booking',
      supplierId: REAL_SUPPLIER,
      bookingId: REAL_BOOKING,
      listingId: REAL_LISTING,
      reviewId: undefined,
      listingRow,
      bookingRow: { ...bookingRow, payment_status: 'paid' },
      reviewRow: undefined,
    });
    expect(paid.ok && paid.overrides.bookingPaymentStatus).toBe('paid');

    const pending = resolveSupplierEventContext({
      eventType: 'new_booking',
      supplierId: REAL_SUPPLIER,
      bookingId: REAL_BOOKING,
      listingId: REAL_LISTING,
      reviewId: undefined,
      listingRow,
      bookingRow: { ...bookingRow, payment_status: 'pending' },
      reviewRow: undefined,
    });
    expect(pending.ok && pending.overrides.bookingPaymentStatus).toBe('pending');

    const none = resolveSupplierEventContext({
      eventType: 'new_booking',
      supplierId: REAL_SUPPLIER,
      bookingId: REAL_BOOKING,
      listingId: REAL_LISTING,
      reviewId: undefined,
      listingRow,
      bookingRow: { ...bookingRow, payment_status: null },
      reviewRow: undefined,
    });
    expect(none.ok && none.overrides.bookingPaymentStatus).toBe('none');
  });

  it('Phase 1135: new_booking maps complete/succeeded payment_status to paid', () => {
    for (const payment_status of ['complete', 'succeeded'] as const) {
      const result = resolveSupplierEventContext({
        eventType: 'new_booking',
        supplierId: REAL_SUPPLIER,
        bookingId: REAL_BOOKING,
        listingId: REAL_LISTING,
        reviewId: undefined,
        listingRow,
        bookingRow: { ...bookingRow, payment_status },
        reviewRow: undefined,
      });
      expect(result.ok && result.overrides.bookingPaymentStatus).toBe('paid');
    }
  });

  it('Phase 1528: nights-only stay re-derives checkOutDate and listingKind', () => {
    const result = resolveSupplierEventContext({
      eventType: 'new_booking',
      supplierId: REAL_SUPPLIER,
      bookingId: REAL_BOOKING,
      listingId: REAL_LISTING,
      reviewId: undefined,
      listingRow,
      bookingRow: {
        ...bookingRow,
        check_out: null,
        nights: 3,
        payment_status: 'paid',
      },
      reviewRow: undefined,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overrides.listingKind).toBe('stay');
    expect(result.overrides.bookingDate).toBe('2026-12-01');
    expect(result.overrides.checkOutDate).toBe('2026-12-04');
  });

  it('Phase 1556: longer snapshot beats stale short nights for supplier checkOutDate', () => {
    const result = resolveSupplierEventContext({
      eventType: 'new_booking',
      supplierId: REAL_SUPPLIER,
      bookingId: REAL_BOOKING,
      listingId: REAL_LISTING,
      reviewId: undefined,
      listingRow,
      bookingRow: {
        ...bookingRow,
        check_out: null,
        nights: 2,
        payment_status: 'paid',
        purchase_snapshot: { checkOut: '2026-12-05' },
      },
      reviewRow: undefined,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overrides.checkOutDate).toBe('2026-12-05');
  });

  it('non-new_booking events never set bookingPaymentStatus', () => {
    const result = resolveSupplierEventContext({
      eventType: 'guest_message',
      supplierId: REAL_SUPPLIER,
      bookingId: REAL_BOOKING,
      listingId: REAL_LISTING,
      reviewId: undefined,
      listingRow,
      bookingRow,
      reviewRow: undefined,
    });
    expect(result.ok && result.overrides.bookingPaymentStatus).toBeUndefined();
  });
});

describe('resolveSupplierEventContext: new_review (Phase 579 content-forgery fix)', () => {
  it('closes the content-forgery gap: real review/listing -> real rating/title/guestName, not caller-fabricated ones', () => {
    const result = resolveSupplierEventContext({
      eventType: 'new_review',
      supplierId: REAL_SUPPLIER,
      bookingId: undefined,
      listingId: REAL_LISTING,
      reviewId: REAL_REVIEW,
      listingRow,
      bookingRow: undefined,
      reviewRow,
    });
    expect(result).toEqual({
      ok: true,
      overrides: {
        listingTitle: 'Real Northern Lights Tour',
        guestName: 'Real Guest',
        reviewRating: 5,
        reviewTitle: 'Loved it',
      },
    });
  });

  it('rejects new_review missing reviewId or listingId (400)', () => {
    expect(
      resolveSupplierEventContext({
        eventType: 'new_review',
        supplierId: REAL_SUPPLIER,
        bookingId: undefined,
        listingId: REAL_LISTING,
        reviewId: undefined,
        listingRow,
        bookingRow: undefined,
        reviewRow: undefined,
      })
    ).toEqual({ ok: false, error: 'reviewId and listingId required for this eventType', status: 400 });
  });

  it('fails closed (404) when the cited review does not exist', () => {
    expect(
      resolveSupplierEventContext({
        eventType: 'new_review',
        supplierId: REAL_SUPPLIER,
        bookingId: undefined,
        listingId: REAL_LISTING,
        reviewId: 'does-not-exist',
        listingRow,
        bookingRow: undefined,
        reviewRow: null,
      })
    ).toEqual({ ok: false, error: 'Review or listing not found', status: 404 });
  });

  it('rejects (403) a real review cited against the wrong listing', () => {
    expect(
      resolveSupplierEventContext({
        eventType: 'new_review',
        supplierId: REAL_SUPPLIER,
        bookingId: undefined,
        listingId: OTHER_LISTING,
        reviewId: REAL_REVIEW,
        listingRow: { id: OTHER_LISTING, supplier_id: REAL_SUPPLIER, title: 'A different listing' },
        bookingRow: undefined,
        reviewRow, // reviewRow.listing_id is REAL_LISTING, not OTHER_LISTING
      })
    ).toEqual({ ok: false, error: 'Review does not belong to the given listing', status: 403 });
  });

  it('rejects (403) a real review/listing pair cited against the wrong supplierId', () => {
    expect(
      resolveSupplierEventContext({
        eventType: 'new_review',
        supplierId: OTHER_SUPPLIER,
        bookingId: undefined,
        listingId: REAL_LISTING,
        reviewId: REAL_REVIEW,
        listingRow,
        bookingRow: undefined,
        reviewRow,
      })
    ).toEqual({ ok: false, error: 'Listing does not belong to the given supplier', status: 403 });
  });
});

describe('resolveSupplierEventContext: events with no booking/review concept', () => {
  it('supplier_welcome and verification_submitted always resolve with no overrides, no DB rows needed', () => {
    for (const eventType of ['supplier_welcome', 'verification_submitted'] as const) {
      expect(
        resolveSupplierEventContext({
          eventType,
          supplierId: REAL_SUPPLIER,
          bookingId: undefined,
          listingId: undefined,
          reviewId: undefined,
          listingRow: undefined,
          bookingRow: undefined,
          reviewRow: undefined,
        })
      ).toEqual({ ok: true, overrides: {} });
    }
  });
});

describe('isAuthorizedSupplierSelfNotifyCaller (Phase 1033)', () => {
  it('accepts matching user id', () => {
    expect(isAuthorizedSupplierSelfNotifyCaller(REAL_SUPPLIER, REAL_SUPPLIER)).toBe(true);
  });
  it('rejects mismatched or empty ids', () => {
    expect(isAuthorizedSupplierSelfNotifyCaller('other-user', REAL_SUPPLIER)).toBe(false);
    expect(isAuthorizedSupplierSelfNotifyCaller(null, REAL_SUPPLIER)).toBe(false);
    expect(isAuthorizedSupplierSelfNotifyCaller(REAL_SUPPLIER, '')).toBe(false);
  });
  it('isSupplierSelfNotifyEvent covers only welcome/verification', () => {
    expect(isSupplierSelfNotifyEvent('supplier_welcome')).toBe(true);
    expect(isSupplierSelfNotifyEvent('verification_submitted')).toBe(true);
    expect(isSupplierSelfNotifyEvent('new_booking')).toBe(false);
    expect(isSupplierSelfNotifyEvent('new_review')).toBe(false);
  });
});
