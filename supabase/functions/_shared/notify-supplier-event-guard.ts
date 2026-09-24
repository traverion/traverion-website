/**
 * Mirror of src/lib/notify-supplier-event-guard.ts for Deno edge runtime.
 *
 * Phase 579: pure content-authenticity guard for notify-supplier-event.
 * Like notify-customer-booking (Phase 578), this endpoint has no
 * caller-identity check of its own. Its recipient resolution was already
 * safe -- always DB-derived from supplierId via supplier_team_members /
 * auth.admin.getUserById(), never a caller-supplied address -- but every
 * content field (listingTitle, guestName, bookingDate, guests,
 * bookingNumber, bookingPaymentStatus, reviewRating, reviewTitle) was
 * trusted verbatim from the request for every eventType. An attacker who
 * knew or guessed a real supplierId could trigger a fully fabricated "new
 * booking", "booking cancelled", "cancellation accepted/declined", or "new
 * review" notification to that supplier's real inbox -- content forgery
 * against a real recipient, not an arbitrary-recipient vector, but still a
 * real gap (a supplier acting on a fabricated "guest cancelled" email, or
 * seeing a fabricated bad review notification).
 *
 * This function is the authoritative decision: given an eventType and the
 * already-fetched booking/listing/review rows, it verifies the ownership
 * chain (booking belongs to listing, listing belongs to the claimed
 * supplierId; review belongs to listing, listing belongs to supplierId) and
 * returns the real field values to use instead of the caller-supplied ones,
 * or an error to return instead of sending. messagePreview, changeSummary,
 * fieldDiffs, and unpaidCheckout have no single authoritative DB source (they
 * summarize a diff or a free-text message, not a stored column) and are
 * deliberately left as caller-supplied, same scoping decision Phase 578 made
 * for notify-customer-booking's own fieldDiffs -- but with the ownership
 * chain now enforced, forging them requires citing a real, existing
 * booking/review that actually belongs to the targeted supplier, not merely
 * a real supplierId.
 */

export type SupplierEventType =
  | 'new_booking'
  | 'booking_cancelled'
  | 'new_review'
  | 'supplier_welcome'
  | 'verification_submitted'
  | 'guest_message'
  | 'booking_detail_changed'
  | 'host_schedule_updated'
  | 'cancellation_accepted'
  | 'cancellation_declined';

/** These claim to be about a specific booking. */
export function isBookingTiedSupplierEvent(eventType: SupplierEventType): boolean {
  return (
    eventType === 'new_booking' ||
    eventType === 'booking_cancelled' ||
    eventType === 'guest_message' ||
    eventType === 'booking_detail_changed' ||
    eventType === 'host_schedule_updated' ||
    eventType === 'cancellation_accepted' ||
    eventType === 'cancellation_declined'
  );
}

/** This claims to be about a specific review. */
export function isReviewTiedSupplierEvent(eventType: SupplierEventType): boolean {
  return eventType === 'new_review';
}

export type ListingRowForSupplierEvent =
  | { id?: string | null; supplier_id?: string | null; title?: string | null }
  | null
  | undefined;

export type BookingRowForSupplierEvent =
  | {
      id?: string | null;
      listing_id?: string | null;
      guest_name?: string | null;
      booking_date?: string | null;
      guests?: number | null;
      booking_number?: number | null;
      payment_status?: string | null;
    }
  | null
  | undefined;

export type ReviewRowForSupplierEvent =
  | { id?: string | null; listing_id?: string | null; rating?: number | null; title?: string | null; guest_name?: string | null }
  | null
  | undefined;

export type SupplierEventFieldOverrides = {
  listingTitle?: string;
  guestName?: string;
  bookingDate?: string;
  guests?: number;
  bookingNumber?: number;
  bookingPaymentStatus?: 'paid' | 'pending' | 'none';
  reviewRating?: number;
  reviewTitle?: string;
};

export type SupplierEventResolution =
  | { ok: true; overrides: SupplierEventFieldOverrides }
  | { ok: false; error: string; status: number };

/**
 * Call after fetching the relevant rows (booking+listing for a booking-tied
 * eventType, review+listing for new_review; pass whichever isn't relevant as
 * undefined). supplier_welcome/verification_submitted have no booking or
 * review concept and always resolve to no overrides.
 */
export function resolveSupplierEventContext(params: {
  eventType: SupplierEventType;
  supplierId: string;
  bookingId: string | undefined;
  listingId: string | undefined;
  reviewId: string | undefined;
  listingRow: ListingRowForSupplierEvent;
  bookingRow: BookingRowForSupplierEvent;
  reviewRow: ReviewRowForSupplierEvent;
}): SupplierEventResolution {
  const { eventType, listingRow, bookingRow, reviewRow } = params;

  if (isBookingTiedSupplierEvent(eventType)) {
    if (!String(params.bookingId ?? '').trim() || !String(params.listingId ?? '').trim()) {
      return { ok: false, error: 'bookingId and listingId required for this eventType', status: 400 };
    }
    if (!bookingRow || !listingRow) {
      return { ok: false, error: 'Booking or listing not found', status: 404 };
    }
    if (String(bookingRow.listing_id ?? '') !== String(params.listingId)) {
      return { ok: false, error: 'Booking does not belong to the given listing', status: 403 };
    }
    if (String(listingRow.supplier_id ?? '') !== String(params.supplierId)) {
      return { ok: false, error: 'Listing does not belong to the given supplier', status: 403 };
    }

    const overrides: SupplierEventFieldOverrides = {
      listingTitle:
        typeof listingRow.title === 'string' && listingRow.title.trim() ? listingRow.title.trim() : undefined,
      guestName:
        typeof bookingRow.guest_name === 'string' && bookingRow.guest_name.trim()
          ? bookingRow.guest_name.trim()
          : undefined,
      bookingDate: typeof bookingRow.booking_date === 'string' && bookingRow.booking_date ? bookingRow.booking_date : undefined,
      guests:
        typeof bookingRow.guests === 'number' && Number.isFinite(bookingRow.guests) ? bookingRow.guests : undefined,
      bookingNumber:
        typeof bookingRow.booking_number === 'number' && Number.isFinite(bookingRow.booking_number)
          ? bookingRow.booking_number
          : undefined,
    };
    if (eventType === 'new_booking') {
      const status = String(bookingRow.payment_status ?? '').trim().toLowerCase();
      overrides.bookingPaymentStatus = status === 'paid' ? 'paid' : status ? 'pending' : 'none';
    }
    return { ok: true, overrides };
  }

  if (isReviewTiedSupplierEvent(eventType)) {
    if (!String(params.reviewId ?? '').trim() || !String(params.listingId ?? '').trim()) {
      return { ok: false, error: 'reviewId and listingId required for this eventType', status: 400 };
    }
    if (!reviewRow || !listingRow) {
      return { ok: false, error: 'Review or listing not found', status: 404 };
    }
    if (String(reviewRow.listing_id ?? '') !== String(params.listingId)) {
      return { ok: false, error: 'Review does not belong to the given listing', status: 403 };
    }
    if (String(listingRow.supplier_id ?? '') !== String(params.supplierId)) {
      return { ok: false, error: 'Listing does not belong to the given supplier', status: 403 };
    }
    return {
      ok: true,
      overrides: {
        listingTitle:
          typeof listingRow.title === 'string' && listingRow.title.trim() ? listingRow.title.trim() : undefined,
        guestName:
          typeof reviewRow.guest_name === 'string' && reviewRow.guest_name.trim()
            ? reviewRow.guest_name.trim()
            : undefined,
        reviewRating:
          typeof reviewRow.rating === 'number' && Number.isFinite(reviewRow.rating) ? reviewRow.rating : undefined,
        reviewTitle:
          typeof reviewRow.title === 'string' && reviewRow.title.trim() ? reviewRow.title.trim() : undefined,
      },
    };
  }

  // supplier_welcome / verification_submitted: no booking or review to check against.
  return { ok: true, overrides: {} };
}
