/**
 * Mirror of src/lib/notify-customer-content.ts for Deno edge runtime.
 *
 * Phase 1052: pure content re-derivation for notify-customer-booking.
 * Recipient/amount already re-derived (Phases 562/578/585). Content fields
 * (listingTitle, customerName, bookingDate, guests, bookingNumber, listingKind,
 * checkOutDate, meetingPoint) were still trusted from the request body —
 * anyone citing a real bookingId could email the real guest forged title/date/
 * party/meeting copy. Prefer purchase_snapshot title/meeting when present
 * (historical purchase truth), else live listing/booking columns.
 * Phase 1060: join snap meetingPoint + pickupInstructions (place + start copy).
 *
 * Deliberately left caller-supplied (same scoping as supplier Phase 579):
 * fieldDiffs, unpaidCheckout, refundStatusNote, paidAtIso, paymentIntentId.
 *
 * Self-contained (no imports) so the Deno mirror stays deployable and
 * byte-synced with this file via edge-function-deno-mirror-sync.test.ts.
 *
 * Mirrored at supabase/functions/_shared/notify-customer-content.ts.
 */

export type NotifyCustomerContentKind =
  | 'booking_request'
  | 'booking_confirmed_paid'
  | 'your_details_updated'
  | 'host_updated_schedule'
  | 'pickup_confirmed'
  | 'pickup_changed'
  | 'booking_cancelled'
  | 'cancellation_requested_by_supplier'
  | 'cancellation_accepted'
  | 'cancellation_declined'
  | 'new_booking_message'
  | 'pickup_action_required'
  | 'traveler_welcome'
  | 'refund_completed'
  | 'experience_reminder'
  | 'review_request';

function isBookingTiedContentKind(kind: NotifyCustomerContentKind): boolean {
  return kind !== 'traveler_welcome';
}

export type BookingRowForContent =
  | {
      guest_name?: string | null;
      booking_date?: string | null;
      check_out?: string | null;
      guests?: number | null;
      booking_number?: number | null;
      purchase_snapshot?: unknown;
      listing_id?: string | null;
    }
  | null
  | undefined;

export type ListingRowForContent =
  | {
      id?: string | null;
      title?: string | null;
      listing_extras?: unknown;
      experience_kind?: string | null;
    }
  | null
  | undefined;

export type CustomerContentOverrides = {
  listingTitle?: string;
  customerName?: string;
  bookingDate?: string;
  guests?: number;
  bookingNumber?: number;
  listingKind?: string;
  checkOutDate?: string;
  meetingPoint?: string;
};

export type CustomerContentResolution =
  | { ok: true; overrides: CustomerContentOverrides }
  | { ok: false; error: string; status: number };

function snapshotRecord(snapshot: unknown): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return snapshot as Record<string, unknown>;
}

function snapshotString(snapshot: unknown, key: string): string | undefined {
  const rec = snapshotRecord(snapshot);
  if (!rec) return undefined;
  const v = rec[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function resolveListingKind(
  listing: ListingRowForContent,
  booking: BookingRowForContent
): string | undefined {
  const extras = listing?.listing_extras;
  if (extras && typeof extras === 'object') {
    const fam = (extras as Record<string, unknown>).inventoryFamily;
    if (typeof fam === 'string' && fam.trim().toLowerCase() === 'stay') return 'stay';
    if (typeof fam === 'string' && fam.trim()) return fam.trim().toLowerCase();
  }
  const checkOut = typeof booking?.check_out === 'string' ? booking.check_out.trim() : '';
  if (checkOut && /^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return 'stay';
  const kind = String(listing?.experience_kind ?? '')
    .trim()
    .toLowerCase();
  if (kind === 'stay') return 'stay';
  if (kind) return kind;
  return undefined;
}

/**
 * Call after recipient resolution succeeded for a booking-tied kind.
 * traveler_welcome returns empty overrides (no booking).
 */
export function resolveBookingTiedContent(params: {
  kind: NotifyCustomerContentKind;
  bookingId: string | undefined;
  bookingRow: BookingRowForContent;
  listingRow: ListingRowForContent;
}): CustomerContentResolution {
  if (!isBookingTiedContentKind(params.kind)) {
    return { ok: true, overrides: {} };
  }
  if (!String(params.bookingId ?? '').trim()) {
    return { ok: false, error: 'bookingId required for this emailKind', status: 400 };
  }
  if (!params.bookingRow) {
    return { ok: false, error: 'Booking not found', status: 404 };
  }

  const snap = params.bookingRow.purchase_snapshot;
  const listingTitle =
    snapshotString(snap, 'listingTitle') ||
    (typeof params.listingRow?.title === 'string' && params.listingRow.title.trim()
      ? params.listingRow.title.trim()
      : undefined);

  // Place + traveler start instructions are distinct snapshot fields (Phase 1059).
  // Join both for email logistics; do not drop instructions when place is set.
  const snapPlace = snapshotString(snap, 'meetingPoint');
  const snapInstructions = snapshotString(snap, 'pickupInstructions');
  const meetingPoint = [snapPlace, snapInstructions].filter(Boolean).join(' — ') || undefined;

  const overrides: CustomerContentOverrides = {};
  if (listingTitle) overrides.listingTitle = listingTitle;

  const guestName =
    typeof params.bookingRow.guest_name === 'string' && params.bookingRow.guest_name.trim()
      ? params.bookingRow.guest_name.trim()
      : undefined;
  if (guestName) overrides.customerName = guestName;

  const bookingDate =
    typeof params.bookingRow.booking_date === 'string' && params.bookingRow.booking_date
      ? params.bookingRow.booking_date
      : undefined;
  if (bookingDate) overrides.bookingDate = bookingDate;

  if (
    typeof params.bookingRow.guests === 'number' &&
    Number.isFinite(params.bookingRow.guests) &&
    params.bookingRow.guests > 0
  ) {
    overrides.guests = params.bookingRow.guests;
  }

  if (
    typeof params.bookingRow.booking_number === 'number' &&
    Number.isFinite(params.bookingRow.booking_number)
  ) {
    overrides.bookingNumber = params.bookingRow.booking_number;
  }

  const listingKind = resolveListingKind(params.listingRow, params.bookingRow);
  if (listingKind) overrides.listingKind = listingKind;

  const checkOut =
    typeof params.bookingRow.check_out === 'string' && params.bookingRow.check_out.trim()
      ? params.bookingRow.check_out.trim()
      : snapshotString(snap, 'checkOut');
  if (checkOut && /^\d{4}-\d{2}-\d{2}$/.test(checkOut)) overrides.checkOutDate = checkOut;

  if (meetingPoint) overrides.meetingPoint = meetingPoint;

  return { ok: true, overrides };
}
