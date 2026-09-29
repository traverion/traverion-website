/**
 * Phase 1052: pure content re-derivation for notify-customer-booking.
 * Recipient/amount already re-derived (Phases 562/578/585). Content fields
 * (listingTitle, customerName, bookingDate, guests, bookingNumber, listingKind,
 * checkOutDate, meetingPoint) were still trusted from the request body —
 * anyone citing a real bookingId could email the real guest forged title/date/
 * party/meeting copy. Prefer purchase_snapshot title/meeting when present
 * (historical purchase truth), else live listing/booking columns.
 * Phase 1060: join snap meetingPoint + pickupInstructions (place + start copy).
 * Phase 1066: stay emails get snap checkInAddress + house times (not tour meeting).
 * Phase 1070: stay houseRules + tour includes/excludes from purchase_snapshot.
 * Phase 1325: checkInAddress only when payment was collected (not pending holds).
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
  | 'review_request'
  | 'checkout_payment_reversed';

function isBookingTiedContentKind(kind: NotifyCustomerContentKind): boolean {
  return kind !== 'traveler_welcome';
}

export type BookingRowForContent =
  | {
      guest_name?: string | null;
      booking_date?: string | null;
      check_out?: string | null;
      nights?: number | null;
      guests?: number | null;
      booking_number?: number | null;
      purchase_snapshot?: unknown;
      listing_id?: string | null;
      payment_status?: string | null;
    }
  | null
  | undefined;

function paymentWasCollectedForContent(raw: unknown): boolean {
  const pay = String(raw ?? '')
    .trim()
    .toLowerCase();
  return pay === 'paid' || pay === 'refunded';
}

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
  /** Stay: purchased check-in address. */
  checkInAddress?: string;
  /** Stay: purchased house check-in HH:MM. */
  checkInTime?: string;
  /** Stay: purchased house check-out HH:MM. */
  checkOutTime?: string;
  /** Stay: purchased house rules text. */
  houseRules?: string;
  /** Tour: purchased included items. */
  includes?: string[];
  /** Tour: purchased excluded items. */
  excludes?: string[];
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

function snapshotStringList(snapshot: unknown, key: string, maxItems = 40, maxLen = 200): string[] | undefined {
  const rec = snapshotRecord(snapshot);
  if (!rec) return undefined;
  const raw = rec[key];
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim().slice(0, maxLen);
    if (!t) continue;
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out.length ? out : undefined;
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
  // Phase 1525: bookingIsStayNight parity — column / nights / snap (never notes-only).
  const checkOut = typeof booking?.check_out === 'string' ? booking.check_out.trim() : '';
  if (checkOut && /^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return 'stay';
  const nights = Math.floor(Number(booking?.nights ?? 0));
  if (Number.isFinite(nights) && nights >= 1) return 'stay';
  const snapCheckOut = snapshotString(booking?.purchase_snapshot, 'checkOut');
  if (snapCheckOut && /^\d{4}-\d{2}-\d{2}$/.test(snapCheckOut)) return 'stay';
  const kind = String(listing?.experience_kind ?? '')
    .trim()
    .toLowerCase();
  if (kind === 'stay') return 'stay';
  if (kind) return kind;
  return undefined;
}

/** Phase 1524/1556/1564: exclusive stay check-out = latest of column / nights / snap (never notes). */
function resolveStayCheckOutDate(booking: BookingRowForContent): string | undefined {
  if (!booking) return undefined;
  const checkIn =
    typeof booking.booking_date === 'string' && booking.booking_date.trim()
      ? booking.booking_date.trim()
      : '';
  const fromColumn =
    typeof booking.check_out === 'string' && booking.check_out.trim()
      ? booking.check_out.trim()
      : '';
  const columnOk =
    fromColumn && /^\d{4}-\d{2}-\d{2}$/.test(fromColumn) && (!checkIn || fromColumn > checkIn)
      ? fromColumn
      : undefined;
  const nights = Math.floor(Number(booking.nights ?? 0));
  let fromNights: string | undefined;
  if (checkIn && /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && Number.isFinite(nights) && nights >= 1) {
    const [y, m, d] = checkIn.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + nights));
    fromNights = dt.toISOString().slice(0, 10);
  }
  const nightsOk = fromNights && (!checkIn || fromNights > checkIn) ? fromNights : undefined;
  const fromSnapRaw = snapshotString(booking.purchase_snapshot, 'checkOut');
  const snapOk =
    fromSnapRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromSnapRaw) && (!checkIn || fromSnapRaw > checkIn)
      ? fromSnapRaw
      : undefined;
  // Phase 1564: later of all signals (stale short column must not win).
  const candidates = [columnOk, nightsOk, snapOk].filter((d): d is string => Boolean(d));
  if (candidates.length > 0) return candidates.reduce((a, b) => (a > b ? a : b));
  if (fromColumn && /^\d{4}-\d{2}-\d{2}$/.test(fromColumn)) return fromColumn;
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

  const listingKind = resolveListingKind(params.listingRow, params.bookingRow);
  const isStay = listingKind === 'stay';

  // Tours: place + traveler start instructions (Phase 1059/1060).
  // Stays: do not invent tour meeting copy — use purchased house logistics instead.
  const snapPlace = snapshotString(snap, 'meetingPoint');
  const snapInstructions = snapshotString(snap, 'pickupInstructions');
  const meetingPoint = isStay
    ? undefined
    : [snapPlace, snapInstructions].filter(Boolean).join(' — ') || undefined;

  const checkInAddress =
    isStay && paymentWasCollectedForContent(params.bookingRow.payment_status)
      ? snapshotString(snap, 'checkInAddress')
      : undefined;
  const checkInTimeRaw = isStay ? snapshotString(snap, 'checkInTime') : undefined;
  const checkOutTimeRaw = isStay ? snapshotString(snap, 'checkOutTime') : undefined;
  const checkInTime =
    checkInTimeRaw && /^\d{2}:\d{2}/.test(checkInTimeRaw) ? checkInTimeRaw.slice(0, 5) : undefined;
  const checkOutTime =
    checkOutTimeRaw && /^\d{2}:\d{2}/.test(checkOutTimeRaw)
      ? checkOutTimeRaw.slice(0, 5)
      : undefined;
  const houseRules = isStay ? snapshotString(snap, 'houseRules')?.slice(0, 2000) : undefined;
  const includes = !isStay ? snapshotStringList(snap, 'includes') : undefined;
  const excludes = !isStay ? snapshotStringList(snap, 'excludes') : undefined;

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

  if (listingKind) overrides.listingKind = listingKind;

  // Phase 1525: nights-only stays must surface checkOutDate like Trips / stayRangeFromBooking.
  const checkOut = isStay
    ? resolveStayCheckOutDate(params.bookingRow)
    : typeof params.bookingRow.check_out === 'string' && params.bookingRow.check_out.trim()
      ? params.bookingRow.check_out.trim()
      : snapshotString(snap, 'checkOut');
  if (checkOut && /^\d{4}-\d{2}-\d{2}$/.test(checkOut)) overrides.checkOutDate = checkOut;

  if (meetingPoint) overrides.meetingPoint = meetingPoint;
  if (checkInAddress) overrides.checkInAddress = checkInAddress;
  if (checkInTime) overrides.checkInTime = checkInTime;
  if (checkOutTime) overrides.checkOutTime = checkOutTime;
  if (houseRules) overrides.houseRules = houseRules;
  if (includes) overrides.includes = includes;
  if (excludes) overrides.excludes = excludes;

  return { ok: true, overrides };
}
