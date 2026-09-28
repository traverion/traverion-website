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
      check_out?: string | null;
      nights?: number | null;
      guests?: number | null;
      booking_number?: number | null;
      payment_status?: string | null;
      purchase_snapshot?: unknown;
    }
  | null
  | undefined;

function purchasedListingTitleFromSnapshot(snapshot: unknown): string | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const title = (snapshot as { listingTitle?: unknown }).listingTitle;
  if (typeof title !== 'string') return undefined;
  const trimmed = title.trim();
  return trimmed || undefined;
}

function snapshotCheckOut(snapshot: unknown): string | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const raw = (snapshot as { checkOut?: unknown }).checkOut;
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined;
}

/** Phase 1523/1528: stay = column / nights / snap — never notes-only check_out:. */
function supplierBookingIsStay(booking: NonNullable<BookingRowForSupplierEvent>): boolean {
  const col = typeof booking.check_out === 'string' ? booking.check_out.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(col)) return true;
  const nights = Math.floor(Number(booking.nights ?? 0));
  if (Number.isFinite(nights) && nights >= 1) return true;
  return Boolean(snapshotCheckOut(booking.purchase_snapshot));
}

/** Phase 1524/1528: exclusive stay check-out = column → nights → snap. */
function supplierStayCheckOutDate(booking: NonNullable<BookingRowForSupplierEvent>): string | undefined {
  const checkIn =
    typeof booking.booking_date === 'string' && booking.booking_date.trim()
      ? booking.booking_date.trim()
      : '';
  const fromColumn = typeof booking.check_out === 'string' ? booking.check_out.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromColumn)) {
    if (!checkIn || fromColumn > checkIn) return fromColumn;
    return fromColumn;
  }
  const nights = Math.floor(Number(booking.nights ?? 0));
  if (checkIn && /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && Number.isFinite(nights) && nights >= 1) {
    const [y, m, d] = checkIn.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + nights));
    return dt.toISOString().slice(0, 10);
  }
  const fromSnap = snapshotCheckOut(booking.purchase_snapshot);
  if (fromSnap) {
    if (!checkIn || fromSnap > checkIn) return fromSnap;
    return fromSnap;
  }
  return undefined;
}

/** Phase 1479: booking-tied supplier emails name what was purchased, not a later rename. */
function listingTitleForBookingTiedSupplierEvent(
  bookingRow: NonNullable<BookingRowForSupplierEvent>,
  listingRow: NonNullable<ListingRowForSupplierEvent>
): string | undefined {
  const purchased = purchasedListingTitleFromSnapshot(bookingRow.purchase_snapshot);
  if (purchased) return purchased;
  return typeof listingRow.title === 'string' && listingRow.title.trim() ? listingRow.title.trim() : undefined;
}

export type ReviewRowForSupplierEvent =
  | { id?: string | null; listing_id?: string | null; rating?: number | null; title?: string | null; guest_name?: string | null }
  | null
  | undefined;

export type SupplierEventFieldOverrides = {
  listingTitle?: string;
  guestName?: string;
  bookingDate?: string;
  /** Phase 1528: exclusive stay check-out when booking_is_stay_night. */
  checkOutDate?: string;
  listingKind?: 'stay' | 'tour';
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
      listingTitle: listingTitleForBookingTiedSupplierEvent(bookingRow, listingRow),
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
    // Phase 1528: partner mail shows stay check-out for nights/column/snap stays.
    if (supplierBookingIsStay(bookingRow)) {
      overrides.listingKind = 'stay';
      const checkOut = supplierStayCheckOutDate(bookingRow);
      if (checkOut) overrides.checkOutDate = checkOut;
    }
    if (eventType === 'new_booking') {
      // Phase 1135: map collected statuses (paid/complete/succeeded) to paid copy.
      const status = String(bookingRow.payment_status ?? '').trim().toLowerCase();
      const collected = status === 'paid' || status === 'complete' || status === 'succeeded';
      overrides.bookingPaymentStatus = collected ? 'paid' : status ? 'pending' : 'none';
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
  // Caller identity for these kinds is enforced separately in the edge handler
  // (isAuthorizedSupplierSelfNotifyCaller — Phase 1033).
  return { ok: true, overrides: {} };
}

/** Event types that have no booking/review to re-derive — require JWT == supplierId. */
export function isSupplierSelfNotifyEvent(eventType: string): boolean {
  return eventType === 'supplier_welcome' || eventType === 'verification_submitted';
}

/**
 * Phase 1033: supplier_welcome / verification_submitted have no booking ownership
 * chain. Require the signed-in user id to match payload.supplierId (same shape
 * as traveler_welcome email match in notify-customer-booking Phase 580).
 */
export function isAuthorizedSupplierSelfNotifyCaller(
  authedUserId: string | null | undefined,
  supplierId: string
): boolean {
  const uid = String(authedUserId ?? '').trim();
  const sid = String(supplierId ?? '').trim();
  return uid.length > 0 && uid === sid;
}
