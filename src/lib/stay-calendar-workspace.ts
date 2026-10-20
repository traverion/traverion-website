/**
 * Partner Stay Calendar workspace — Agenda / Week / Month night inventory.
 * Uses the same occupy rules as public Stay booking (paid + authorized R2B).
 * Unpaid Instant Book pending never occupies. Blocks = listing_availability.capacity <= 0.
 */
import { bookingOccupiesInventory, type InventoryHoldRow } from './booking-hold';
import {
  addCalendarDays,
  nightsOccupiedByStay,
  partnerStayCalendarOccupiesNight,
  stayNightIsOperatorBlocked,
  stayRangeFromBooking,
} from './stayOccupancy';
export type StayCalendarViewMode = 'agenda' | 'week' | 'month';

export function parseStayCalendarView(raw: string | null | undefined): StayCalendarViewMode {
  if (raw === 'week' || raw === 'month' || raw === 'agenda') return raw;
  return 'agenda';
}

/** Monday-first week containing `iso` (UTC date-only). */
export function weekRangeContaining(iso: string): { from: string; to: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  const mon0 = (d.getUTCDay() + 6) % 7;
  const from = addCalendarDays(iso, -mon0);
  return { from, to: addCalendarDays(from, 6) };
}

export type StayCalendarNightKind = 'available' | 'booked' | 'pending' | 'blocked';

export type StayCalendarStatusFilter = 'all' | 'booked' | 'pending' | 'blocked' | 'available';

export type StayCalendarBooking = InventoryHoldRow & {
  id: string;
  listing_id: string;
  guest_name?: string | null;
  guests?: number | null;
  booking_date?: string | null;
  check_out?: string | null;
  nights?: number | null;
  special_requests?: string | null;
  purchase_snapshot?: unknown;
  public_reference?: string | null;
  booking_number?: number | null;
  status?: string | null;
  payment_status?: string | null;
};

export type StayCalendarCap = {
  listing_id: string;
  available_date: string;
  capacity: number;
};

export type StayCalendarAgendaKind = 'check_in' | 'check_out' | 'blocked';

export type StayCalendarAgendaRow = {
  key: string;
  iso: string;
  kind: StayCalendarAgendaKind;
  listingId: string;
  listingTitle: string;
  thumbUrl: string | null;
  guestName: string | null;
  guests: number;
  bookingId: string | null;
  reference: string | null;
  paymentStatus: string | null;
  /** Check-in / check-out time label when known. */
  timeLabel: string | null;
  nightKind: StayCalendarNightKind | null;
};

export type StayCalendarWeekSpan = {
  bookingId: string;
  listingId: string;
  guestName: string;
  /** Inclusive night start within the visible week (clipped). */
  startIso: string;
  /** Exclusive end within the visible week (clipped checkout or week end+1). */
  endIso: string;
  colStart: number;
  colSpan: number;
  pending: boolean;
  /** True when the bar starts on the real check-in night (not clipped by week start). */
  startsAtCheckIn: boolean;
  /** True when the bar ends on the night before checkout (not clipped by week end). */
  endsAtCheckout: boolean;
  /** Vertical lane when bookings overlap on the same property row. */
  lane: number;
  /** Total lanes used on this property in the visible week (for row height). */
  laneCount: number;
};

/** Assign non-overlapping lanes to week spans (greedy by start). */
export function assignStayWeekSpanLanes(
  spans: Array<Omit<StayCalendarWeekSpan, 'lane' | 'laneCount'>>
): StayCalendarWeekSpan[] {
  const sorted = [...spans].sort((a, b) => a.colStart - b.colStart || b.colSpan - a.colSpan);
  const laneEnds: number[] = [];
  const withLanes: Array<Omit<StayCalendarWeekSpan, 'laneCount'> & { lane: number }> = [];
  for (const span of sorted) {
    const spanEnd = span.colStart + span.colSpan;
    let lane = laneEnds.findIndex((end) => end <= span.colStart);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(spanEnd);
    } else {
      laneEnds[lane] = spanEnd;
    }
    withLanes.push({ ...span, lane });
  }
  const laneCount = Math.max(1, laneEnds.length);
  return withLanes.map((s) => ({ ...s, laneCount }));
}

/** Percentage geometry for a week bar (7 equal day columns). */
export function stayWeekSpanStyle(span: Pick<StayCalendarWeekSpan, 'colStart' | 'colSpan' | 'lane'>): {
  left: string;
  width: string;
  top: string;
} {
  const laneH = 1.55;
  return {
    left: `${(span.colStart / 7) * 100}%`,
    width: `${(span.colSpan / 7) * 100}%`,
    top: `${0.28 + span.lane * laneH}rem`,
  };
}

export function stayBookingIsPendingApproval(b: InventoryHoldRow, nowMs = Date.now()): boolean {
  if (!bookingOccupiesInventory(b, nowMs)) return false;
  return (b.payment_status ?? '').trim().toLowerCase() === 'authorized';
}

export function stayCalendarNightKind(params: {
  occupying: StayCalendarBooking[];
  capacity: number | null | undefined;
  nowMs?: number;
}): StayCalendarNightKind {
  const now = params.nowMs ?? Date.now();
  const live = params.occupying.filter((b) => partnerStayCalendarOccupiesNight(b));
  if (live.length > 0) {
    if (live.every((b) => stayBookingIsPendingApproval(b, now))) return 'pending';
    return 'booked';
  }
  if (params.capacity != null && stayNightIsOperatorBlocked(params.capacity)) return 'blocked';
  return 'available';
}

export function stayCalendarNightKindLabel(kind: StayCalendarNightKind): string {
  switch (kind) {
    case 'booked':
      return 'Booked';
    case 'pending':
      return 'Pending approval';
    case 'blocked':
      return 'Blocked';
    default:
      return 'Available';
  }
}

export function parseStayCalendarStatusFilter(raw: string | null | undefined): StayCalendarStatusFilter {
  if (raw === 'booked' || raw === 'pending' || raw === 'blocked' || raw === 'available') return raw;
  return 'all';
}

/** Occupying bookings for a listing on a given night (check-in inclusive, checkout exclusive). */
export function stayCalendarOccupyingOnNight(
  bookings: StayCalendarBooking[],
  listingId: string,
  iso: string,
  nowMs = Date.now()
): StayCalendarBooking[] {
  const out: StayCalendarBooking[] = [];
  for (const b of bookings) {
    if (b.listing_id !== listingId) continue;
    if (!partnerStayCalendarOccupiesNight({ ...b, payment_status: b.payment_status })) continue;
    // Re-check with nowMs via bookingOccupiesInventory for hold expiry.
    if (!bookingOccupiesInventory(b, nowMs)) continue;
    const range = stayRangeFromBooking(b);
    if (!range) continue;
    if (iso >= range.checkIn && iso < range.checkOut) out.push(b);
  }
  return out;
}

export function stayCalendarCapacityOnNight(
  caps: StayCalendarCap[],
  listingId: string,
  iso: string
): number | null {
  const row = caps.find((c) => c.listing_id === listingId && c.available_date === iso);
  return row ? row.capacity : null;
}

/**
 * True when a supplier may block this night: no occupying booking (paid or authorized).
 * Existing blocks may be re-blocked (idempotent).
 */
export function stayCalendarCanBlockNight(params: {
  bookings: StayCalendarBooking[];
  listingId: string;
  iso: string;
  nowMs?: number;
}): boolean {
  return stayCalendarOccupyingOnNight(params.bookings, params.listingId, params.iso, params.nowMs).length === 0;
}

/**
 * True when a supplier may unblock: night is blocked (capacity <= 0) and not occupied.
 */
export function stayCalendarCanUnblockNight(params: {
  bookings: StayCalendarBooking[];
  caps: StayCalendarCap[];
  listingId: string;
  iso: string;
  nowMs?: number;
}): boolean {
  if (!stayCalendarCanBlockNight(params)) return false;
  const cap = stayCalendarCapacityOnNight(params.caps, params.listingId, params.iso);
  return cap != null && stayNightIsOperatorBlocked(cap);
}

function readStayTimeLabel(
  snapshot: unknown,
  which: 'checkIn' | 'checkOut'
): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const s = snapshot as Record<string, unknown>;
  const key = which === 'checkIn' ? 'checkInTime' : 'checkOutTime';
  const v = s[key] ?? s[which === 'checkIn' ? 'check_in_time' : 'check_out_time'];
  if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 5);
  return null;
}

function bookingReference(b: StayCalendarBooking): string | null {
  const ref = (b.public_reference ?? '').trim();
  if (ref) return ref;
  if (b.booking_number != null && Number.isFinite(Number(b.booking_number))) {
    return `#${b.booking_number}`;
  }
  return null;
}

export function buildStayCalendarAgenda(params: {
  fromIso: string;
  toIso: string;
  bookings: StayCalendarBooking[];
  caps: StayCalendarCap[];
  listings: Array<{ id: string; title: string; image?: string | null }>;
  listingIdFilter?: string | null;
  statusFilter?: StayCalendarStatusFilter;
  nowMs?: number;
}): StayCalendarAgendaRow[] {
  const now = params.nowMs ?? Date.now();
  const listingById = new Map(params.listings.map((l) => [l.id, l]));
  const listingFilter = (params.listingIdFilter ?? '').trim();
  const status = params.statusFilter ?? 'all';
  const rows: StayCalendarAgendaRow[] = [];

  const stayBookings = params.bookings.filter((b) => {
    if (listingFilter && b.listing_id !== listingFilter) return false;
    if (!listingById.has(b.listing_id)) return false;
    return bookingOccupiesInventory(b, now);
  });

  for (const b of stayBookings) {
    const range = stayRangeFromBooking(b);
    if (!range) continue;
    const listing = listingById.get(b.listing_id)!;
    const pending = stayBookingIsPendingApproval(b, now);
    const nightKind: StayCalendarNightKind = pending ? 'pending' : 'booked';

    if (range.checkIn >= params.fromIso && range.checkIn <= params.toIso) {
      if (status === 'all' || status === nightKind) {
        rows.push({
          key: `in-${b.id}`,
          iso: range.checkIn,
          kind: 'check_in',
          listingId: b.listing_id,
          listingTitle: listing.title,
          thumbUrl: listing.image ?? null,
          guestName: b.guest_name?.trim() || 'Guest',
          guests: Math.max(1, Math.floor(Number(b.guests ?? 1)) || 1),
          bookingId: b.id,
          reference: bookingReference(b),
          paymentStatus: b.payment_status ?? null,
          timeLabel: readStayTimeLabel(b.purchase_snapshot, 'checkIn'),
          nightKind,
        });
      }
    }
    if (range.checkOut >= params.fromIso && range.checkOut <= params.toIso) {
      // Check-out mornings are informational — still show under booked/pending filters.
      if (status === 'all' || status === nightKind) {
        rows.push({
          key: `out-${b.id}`,
          iso: range.checkOut,
          kind: 'check_out',
          listingId: b.listing_id,
          listingTitle: listing.title,
          thumbUrl: listing.image ?? null,
          guestName: b.guest_name?.trim() || 'Guest',
          guests: Math.max(1, Math.floor(Number(b.guests ?? 1)) || 1),
          bookingId: b.id,
          reference: bookingReference(b),
          paymentStatus: b.payment_status ?? null,
          timeLabel: readStayTimeLabel(b.purchase_snapshot, 'checkOut'),
          nightKind,
        });
      }
    }
  }

  if (status === 'all' || status === 'blocked') {
    for (const cap of params.caps) {
      if (listingFilter && cap.listing_id !== listingFilter) continue;
      if (!listingById.has(cap.listing_id)) continue;
      if (cap.available_date < params.fromIso || cap.available_date > params.toIso) continue;
      if (!stayNightIsOperatorBlocked(cap.capacity)) continue;
      if (
        stayCalendarOccupyingOnNight(params.bookings, cap.listing_id, cap.available_date, now).length > 0
      ) {
        continue;
      }
      const listing = listingById.get(cap.listing_id)!;
      rows.push({
        key: `block-${cap.listing_id}-${cap.available_date}`,
        iso: cap.available_date,
        kind: 'blocked',
        listingId: cap.listing_id,
        listingTitle: listing.title,
        thumbUrl: listing.image ?? null,
        guestName: null,
        guests: 0,
        bookingId: null,
        reference: null,
        paymentStatus: null,
        timeLabel: null,
        nightKind: 'blocked',
      });
    }
  }

  rows.sort((a, b) => {
    const d = a.iso.localeCompare(b.iso);
    if (d !== 0) return d;
    const kindOrder = { check_in: 0, check_out: 1, blocked: 2 } as const;
    const k = kindOrder[a.kind] - kindOrder[b.kind];
    if (k !== 0) return k;
    return a.listingTitle.localeCompare(b.listingTitle) || a.key.localeCompare(b.key);
  });
  return rows;
}

export function groupStayAgendaByDate(rows: StayCalendarAgendaRow[]): Array<{
  iso: string;
  rows: StayCalendarAgendaRow[];
}> {
  const map = new Map<string, StayCalendarAgendaRow[]>();
  for (const r of rows) {
    const list = map.get(r.iso) ?? [];
    list.push(r);
    map.set(r.iso, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, group]) => ({ iso, rows: group }));
}

/** Clip a stay reservation into week columns (Mon=0 … Sun=6). */
export function buildStayCalendarWeekSpans(params: {
  weekFromIso: string;
  bookings: StayCalendarBooking[];
  listingId: string;
  nowMs?: number;
}): StayCalendarWeekSpan[] {
  const now = params.nowMs ?? Date.now();
  const weekToExclusive = addCalendarDays(params.weekFromIso, 7);
  const spans: Array<Omit<StayCalendarWeekSpan, 'lane' | 'laneCount'>> = [];

  for (const b of params.bookings) {
    if (b.listing_id !== params.listingId) continue;
    if (!bookingOccupiesInventory(b, now)) continue;
    const range = stayRangeFromBooking(b);
    if (!range) continue;
    // Visible nights: intersection of [checkIn, checkOut) with [weekFrom, weekToExclusive)
    const start = range.checkIn > params.weekFromIso ? range.checkIn : params.weekFromIso;
    const end = range.checkOut < weekToExclusive ? range.checkOut : weekToExclusive;
    if (start >= end) continue;
    const colStart = nightsOccupiedByStay(params.weekFromIso, start).length;
    const colSpan = nightsOccupiedByStay(start, end).length;
    if (colSpan < 1) continue;
    spans.push({
      bookingId: b.id,
      listingId: b.listing_id,
      guestName: b.guest_name?.trim() || 'Guest',
      startIso: start,
      endIso: end,
      colStart,
      colSpan,
      pending: stayBookingIsPendingApproval(b, now),
      startsAtCheckIn: start === range.checkIn,
      endsAtCheckout: end === range.checkOut,
    });
  }
  return assignStayWeekSpanLanes(spans);
}

export function eachIsoInRange(fromIso: string, toIsoInclusive: string): string[] {
  if (toIsoInclusive < fromIso) return [];
  return nightsOccupiedByStay(fromIso, addCalendarDays(toIsoInclusive, 1));
}

/** Dates in [from, to] that can be blocked (not occupied). */
export function stayCalendarBlockableDatesInRange(params: {
  fromIso: string;
  toIso: string;
  bookings: StayCalendarBooking[];
  listingId: string;
  nowMs?: number;
}): string[] {
  return eachIsoInRange(params.fromIso, params.toIso).filter((iso) =>
    stayCalendarCanBlockNight({
      bookings: params.bookings,
      listingId: params.listingId,
      iso,
      nowMs: params.nowMs,
    })
  );
}
