/**
 * Mission 05.1–05.5 — Unified Partner Calendar.
 * Aggregates Tours / Stays / Rentals into Agenda + Month views.
 * Reuses booking occupancy + lifecycle calendar helpers; no separate inventory engine.
 * Default view hides completed/past events; ongoing stays/rentals stay visible.
 * Mission 05.5 adds schedule/availability overlays (see partner-unified-calendar-visibility).
 */

import { bookingOccupiesInventory } from './booking-hold';
import {
  addCalendarDaysYmd,
  lifecycleReminderAnchorYmd,
  lifecycleRentalReturnYmd,
  resolveLifecycleTimezone,
} from './booking-lifecycle-calendar';
import { buildMonthCells } from './availability-ops';
import { inventoryFamilyFromListing, type InventoryListingSlice } from './inventory';
import { bookingIsRental, bookingIsStayNight, partnerBookingDeskFamily } from './pickup-completeness';
import { parseRentalPurchaseSnapshot } from './rental-booking-domain';
import { stayRangeFromBooking } from './stayOccupancy';
import {
  partnerBookingIsOperatingTrip,
  partnerStayTouchesScheduleDay,
  scheduleTodayIsoForBooking,
  type PartnerScheduleBooking,
} from './trip-views';
import {
  partnerHomeScheduleEventKindLabel,
  type PartnerHomeScheduleEventKind,
} from './partner-home-schedule';
import type { PartnerBookingDeskFamily } from './partner-booking-desk-path';

export type PartnerUnifiedCalendarView = 'agenda' | 'month';
export type PartnerUnifiedCategoryFilter = 'all' | 'tour' | 'stay' | 'rental';

export type PartnerUnifiedCalendarBooking = PartnerScheduleBooking & {
  id: string;
  listing_id: string;
  guest_name?: string | null;
  guests?: number | null;
  booking_date?: string | null;
  check_out?: string | null;
  start_time?: string | null;
  booking_option_id?: string | null;
  public_reference?: string | null;
  booking_number?: number | null;
  payment_status?: string | null;
  purchase_snapshot?: unknown;
};

export type PartnerUnifiedCalendarEventKind =
  | PartnerHomeScheduleEventKind
  | 'tour_departure'
  | 'stay_blocked'
  | 'rental_ongoing'
  | 'rental_block';

export type PartnerUnifiedCalendarEventSource = 'booking' | 'schedule' | 'availability';

export type PartnerUnifiedCalendarEvent = {
  key: string;
  ymd: string;
  kind: PartnerUnifiedCalendarEventKind;
  category: PartnerBookingDeskFamily;
  listingId: string;
  listingTitle: string;
  optionLabel: string | null;
  guestName: string | null;
  reference: string | null;
  /** Null for schedule/availability overlays (open day panel instead of a booking). */
  bookingId: string | null;
  timeHm: string | null;
  /** Tour guests / stay guests / rental qty. */
  quantityLabel: string | null;
  metaLine: string | null;
  /**
   * Listing-local "today" when the event was built (for upcoming vs past).
   * Ongoing stay/rental days use ymd >= activeTodayIso so mid-stay nights stay visible.
   */
  activeTodayIso: string;
  source?: PartnerUnifiedCalendarEventSource;
  /** Tour departure operational status when kind is tour_departure. */
  departureStatus?:
    | 'available'
    | 'limited'
    | 'sold_out'
    | 'closed'
    | 'cutoff'
    | 'no_schedule'
    | null;
  /** Structured inventory counts when known (tour departures). */
  bookedCount?: number | null;
  capacityCount?: number | null;
  remainingCount?: number | null;
  cutoffHours?: number | null;
  /** Partner-facing cutoff line, e.g. "Cutoff: 5h before" or "Closed at 13:30". */
  cutoffLabel?: string | null;
};

export type PartnerUnifiedMonthDaySummary = {
  iso: string;
  total: number;
  tour: number;
  stay: number;
  rental: number;
  /** When a stay listing is selected — night inventory without per-available events. */
  stayNightKind?: 'available' | 'booked' | 'blocked' | null;
};

export function parsePartnerUnifiedCalendarView(
  raw: string | null | undefined
): PartnerUnifiedCalendarView {
  return raw === 'month' ? 'month' : 'agenda';
}

export function parsePartnerUnifiedCategoryFilter(
  raw: string | null | undefined
): PartnerUnifiedCategoryFilter {
  if (raw === 'tour' || raw === 'stay' || raw === 'rental') return raw;
  return 'all';
}

function hmFromIsoInTz(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ms));
    const hour = parts.find((p) => p.type === 'hour')?.value;
    const minute = parts.find((p) => p.type === 'minute')?.value;
    if (!hour || !minute) return null;
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  } catch {
    return null;
  }
}

function tourTimeHm(b: PartnerUnifiedCalendarBooking): string | null {
  const snap =
    b.purchase_snapshot && typeof b.purchase_snapshot === 'object'
      ? (b.purchase_snapshot as { startTimeHm?: unknown }).startTimeHm
      : null;
  if (typeof snap === 'string' && /^\d{1,2}:\d{2}/.test(snap.trim())) {
    return snap.trim().slice(0, 5);
  }
  const raw = (b.start_time ?? '').trim();
  if (/^\d{1,2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  return null;
}

function listingTitleFor(
  b: PartnerUnifiedCalendarBooking,
  titlesByListingId: Map<string, string>
): string {
  const snap =
    b.purchase_snapshot && typeof b.purchase_snapshot === 'object'
      ? (b.purchase_snapshot as { listingTitle?: unknown }).listingTitle
      : null;
  if (typeof snap === 'string' && snap.trim()) return snap.trim();
  return titlesByListingId.get(b.listing_id)?.trim() || 'Listing';
}

function optionLabelFor(b: PartnerUnifiedCalendarBooking): string | null {
  if (bookingIsRental(b)) {
    const snap = parseRentalPurchaseSnapshot(b.purchase_snapshot);
    return snap?.variantName?.trim() || null;
  }
  const snap =
    b.purchase_snapshot && typeof b.purchase_snapshot === 'object'
      ? (b.purchase_snapshot as { optionLabel?: unknown }).optionLabel
      : null;
  if (typeof snap === 'string' && snap.trim()) return snap.trim();
  return null;
}

function quantityLabelFor(
  b: PartnerUnifiedCalendarBooking,
  kind: PartnerHomeScheduleEventKind
): string | null {
  if (bookingIsRental(b)) {
    const snap = parseRentalPurchaseSnapshot(b.purchase_snapshot);
    const qty = snap?.quantity ?? Math.max(1, Math.floor(Number(b.guests ?? 1)));
    return `${qty} unit${qty === 1 ? '' : 's'}`;
  }
  if (bookingIsStayNight(b)) {
    const guests = Math.max(1, Math.floor(Number(b.guests ?? 1)));
    if (kind === 'stay_occupied') return `${guests} guest${guests === 1 ? '' : 's'} · occupied`;
    return `${guests} guest${guests === 1 ? '' : 's'}`;
  }
  const guests = Math.max(1, Math.floor(Number(b.guests ?? 1)));
  return `${guests} guest${guests === 1 ? '' : 's'}`;
}

function sortUnifiedEvents(a: PartnerUnifiedCalendarEvent, b: PartnerUnifiedCalendarEvent): number {
  const byDay = a.ymd.localeCompare(b.ymd);
  if (byDay) return byDay;
  const ta = a.timeHm ?? '99:99';
  const tb = b.timeHm ?? '99:99';
  const byTime = ta.localeCompare(tb);
  if (byTime) return byTime;
  const kindRank = (k: PartnerUnifiedCalendarEventKind): number => {
    if (k === 'rental_collection' || k === 'stay_check_in' || k === 'tour_departure') return 0;
    if (k === 'rental_return' || k === 'stay_check_out') return 1;
    if (k === 'stay_occupied' || k === 'rental_ongoing') return 2;
    if (k === 'stay_blocked' || k === 'rental_block') return 3;
    return 4;
  };
  const byKind = kindRank(a.kind) - kindRank(b.kind);
  if (byKind) return byKind;
  return a.key.localeCompare(b.key);
}

function ymdInInclusiveRange(ymd: string, fromYmd: string, toYmd: string): boolean {
  return ymd >= fromYmd && ymd <= toYmd;
}

/**
 * Expand operating bookings into calendar events for [fromYmd, toYmd] (inclusive).
 * Cancelled / unpaid checkout holds are excluded via occupy + operating filters.
 */
export function buildPartnerUnifiedCalendarEvents(params: {
  bookings: PartnerUnifiedCalendarBooking[];
  fromYmd: string;
  toYmd: string;
  titlesByListingId?: Map<string, string>;
  nowMs?: number;
  /** When false, stay occupied nights between check-in and check-out are omitted. */
  includeOccupiedNights?: boolean;
}): PartnerUnifiedCalendarEvent[] {
  const {
    bookings,
    fromYmd,
    toYmd,
    titlesByListingId = new Map(),
    nowMs = Date.now(),
    includeOccupiedNights = true,
  } = params;
  const out: PartnerUnifiedCalendarEvent[] = [];
  const seen = new Set<string>();

  const push = (event: PartnerUnifiedCalendarEvent) => {
    if (seen.has(event.key)) return;
    if (!ymdInInclusiveRange(event.ymd, fromYmd, toYmd)) return;
    seen.add(event.key);
    out.push(event);
  };

  for (const b of bookings) {
    if (!partnerBookingIsOperatingTrip(b)) continue;
    if (!bookingOccupiesInventory(b, nowMs)) continue;

    const category = partnerBookingDeskFamily(b);
    const listingTitle = listingTitleFor(b, titlesByListingId);
    const optionLabel = optionLabelFor(b);
    const guestName = (b.guest_name ?? '').trim() || null;
    const reference = (b.public_reference ?? '').trim() || null;
    const activeTodayIso = scheduleTodayIsoForBooking(b, nowMs);

    if (bookingIsRental(b)) {
      const collectionYmd = lifecycleReminderAnchorYmd(b);
      const returnYmd = lifecycleRentalReturnYmd(b);
      const tz = resolveLifecycleTimezone(b.purchase_snapshot);
      const snap = parseRentalPurchaseSnapshot(b.purchase_snapshot);
      const collectionHm = hmFromIsoInTz(snap?.pickupAt, tz);
      const returnHm = hmFromIsoInTz(snap?.returnAt, tz);
      const qty = quantityLabelFor(b, 'rental_collection');

      if (collectionYmd) {
        push({
          key: `${b.id}:rental_collection:${collectionYmd}`,
          ymd: collectionYmd,
          kind: 'rental_collection',
          category,
          listingId: b.listing_id,
          listingTitle,
          optionLabel,
          guestName,
          reference,
          bookingId: b.id,
          timeHm: collectionHm,
          quantityLabel: qty,
          metaLine: [optionLabel, qty].filter(Boolean).join(' · ') || null,
          activeTodayIso,
          source: 'booking',
        });
      }
      if (returnYmd) {
        push({
          key: `${b.id}:rental_return:${returnYmd}`,
          ymd: returnYmd,
          kind: 'rental_return',
          category,
          listingId: b.listing_id,
          listingTitle,
          optionLabel,
          guestName,
          reference,
          bookingId: b.id,
          timeHm: returnHm,
          quantityLabel: qty,
          metaLine: [optionLabel, qty].filter(Boolean).join(' · ') || null,
          activeTodayIso,
          source: 'booking',
        });
      }
      continue;
    }

    if (bookingIsStayNight(b)) {
      const stay = stayRangeFromBooking(b);
      if (!stay) continue;
      let cursor = stay.checkIn;
      // Walk nights + checkout day; stop if add fails.
      for (let guard = 0; guard < 400; guard += 1) {
        if (!cursor || cursor > toYmd) break;
        if (cursor >= fromYmd && partnerStayTouchesScheduleDay(stay.checkIn, stay.checkOut, cursor)) {
          let kind: PartnerHomeScheduleEventKind = 'stay_occupied';
          if (cursor === stay.checkIn) kind = 'stay_check_in';
          else if (cursor === stay.checkOut) kind = 'stay_check_out';
          if (kind === 'stay_occupied' && !includeOccupiedNights) {
            // skip
          } else {
            push({
              key: `${b.id}:${kind}:${cursor}`,
              ymd: cursor,
              kind,
              category,
              listingId: b.listing_id,
              listingTitle,
              optionLabel,
              guestName,
              reference,
              bookingId: b.id,
              timeHm: null,
              quantityLabel: quantityLabelFor(b, kind),
              metaLine: quantityLabelFor(b, kind),
              activeTodayIso,
              source: 'booking',
            });
          }
        }
        if (cursor === stay.checkOut) break;
        const next = addCalendarDaysYmd(cursor, 1);
        if (!next || next === cursor) break;
        cursor = next;
      }
      continue;
    }

    const date = (b.booking_date ?? '').trim();
    if (!date || !ymdInInclusiveRange(date, fromYmd, toYmd)) continue;
    const qty = quantityLabelFor(b, 'tour');
    push({
      key: `${b.id}:tour:${date}`,
      ymd: date,
      kind: 'tour',
      category,
      listingId: b.listing_id,
      listingTitle,
      optionLabel,
      guestName,
      reference,
      bookingId: b.id,
      timeHm: tourTimeHm(b),
      quantityLabel: qty,
      metaLine: [optionLabel, qty].filter(Boolean).join(' · ') || qty,
      activeTodayIso,
      source: 'booking',
    });
  }

  return out.sort(sortUnifiedEvents);
}

/**
 * Upcoming mode: keep events on/after listing-local today.
 * Mid-stay occupied nights and future check-outs / returns stay visible even when
 * check-in / collection already happened.
 */
export function partnerUnifiedEventIsUpcomingOrOngoing(
  event: PartnerUnifiedCalendarEvent
): boolean {
  return event.ymd >= event.activeTodayIso;
}

export function filterPartnerUnifiedCalendarEvents(
  events: PartnerUnifiedCalendarEvent[],
  filters: {
    category: PartnerUnifiedCategoryFilter;
    listingId: string | null;
    optionKey: string | null;
    /** When false (default), hide past completed events. */
    includePast?: boolean;
  }
): PartnerUnifiedCalendarEvent[] {
  const listingId = (filters.listingId ?? '').trim();
  const optionKey = (filters.optionKey ?? '').trim();
  const includePast = filters.includePast === true;
  return events.filter((e) => {
    if (!includePast && !partnerUnifiedEventIsUpcomingOrOngoing(e)) return false;
    if (filters.category !== 'all' && e.category !== filters.category) return false;
    if (listingId && e.listingId !== listingId) return false;
    if (optionKey) {
      const label = (e.optionLabel ?? '').trim();
      if (label !== optionKey) return false;
    }
    return true;
  });
}

export function groupPartnerUnifiedEventsByDate(
  events: PartnerUnifiedCalendarEvent[]
): Array<{ iso: string; events: PartnerUnifiedCalendarEvent[] }> {
  const map = new Map<string, PartnerUnifiedCalendarEvent[]>();
  for (const e of events) {
    const list = map.get(e.ymd);
    if (list) list.push(e);
    else map.set(e.ymd, [e]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, rows]) => ({ iso, events: rows }));
}

export function summarizePartnerUnifiedMonthDays(
  events: PartnerUnifiedCalendarEvent[],
  year: number,
  monthIndex0: number
): Map<string, PartnerUnifiedMonthDaySummary> {
  const cells = buildMonthCells(year, monthIndex0);
  const map = new Map<string, PartnerUnifiedMonthDaySummary>();
  for (const cell of cells) {
    map.set(cell.iso, { iso: cell.iso, total: 0, tour: 0, stay: 0, rental: 0 });
  }
  for (const e of events) {
    const row = map.get(e.ymd);
    if (!row) continue;
    row.total += 1;
    if (e.category === 'tour') row.tour += 1;
    else if (e.category === 'stay') row.stay += 1;
    else row.rental += 1;
  }
  return map;
}

export function partnerUnifiedEventKindLabel(kind: PartnerUnifiedCalendarEventKind): string {
  if (
    kind === 'tour_departure' ||
    kind === 'stay_blocked' ||
    kind === 'rental_ongoing' ||
    kind === 'rental_block'
  ) {
    if (kind === 'tour_departure') return 'Departure';
    if (kind === 'stay_blocked' || kind === 'rental_block') return 'Blocked';
    return 'On rent';
  }
  return partnerHomeScheduleEventKindLabel(kind);
}

export function partnerUnifiedCategoryLabel(category: PartnerBookingDeskFamily): string {
  if (category === 'stay') return 'Stay';
  if (category === 'rental') return 'Rental';
  return 'Tour';
}

/** Option filter choices derived from events (stable labels). */
export function partnerUnifiedOptionChoices(
  events: PartnerUnifiedCalendarEvent[]
): Array<{ value: string; label: string }> {
  const seen = new Map<string, string>();
  for (const e of events) {
    const label = (e.optionLabel ?? '').trim();
    if (!label) continue;
    if (!seen.has(label)) seen.set(label, label);
  }
  return [...seen.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));
}

export function listingsForUnifiedCategoryFilter<T extends InventoryListingSlice & { id: string }>(
  listings: T[],
  category: PartnerUnifiedCategoryFilter
): T[] {
  if (category === 'all') return listings;
  return listings.filter((l) => inventoryFamilyFromListing(l) === category);
}

/** Default rolling window length (inclusive of today). */
export const PARTNER_UNIFIED_DEFAULT_RANGE_DAYS = 30;

/** @deprecated Prefer PARTNER_UNIFIED_DEFAULT_RANGE_DAYS / partnerUnifiedRollingRange. */
export const PARTNER_UNIFIED_AGENDA_DAYS = PARTNER_UNIFIED_DEFAULT_RANGE_DAYS;

export function partnerUnifiedRollingRange(todayIso: string): { fromYmd: string; toYmd: string } {
  const toYmd =
    addCalendarDaysYmd(todayIso, PARTNER_UNIFIED_DEFAULT_RANGE_DAYS - 1) ?? todayIso;
  return { fromYmd: todayIso, toYmd };
}

/** Inclusive day count for a From/To pair (invalid → 0). */
export function partnerUnifiedRangeDayCount(fromYmd: string, toYmd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) return 0;
  if (fromYmd > toYmd) return 0;
  const a = Date.parse(`${fromYmd}T12:00:00Z`);
  const b = Date.parse(`${toYmd}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

/** Normalize and clamp a custom From/To pair. */
export function partnerUnifiedNormalizeRange(
  fromYmd: string,
  toYmd: string,
  todayIso?: string
): { fromYmd: string; toYmd: string } {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromYmd) ? fromYmd : todayIso ?? fromYmd;
  let to = /^\d{4}-\d{2}-\d{2}$/.test(toYmd) ? toYmd : from;
  if (to < from) to = from;
  // Soft cap to keep visibility fetches bounded (1 year).
  const max = addCalendarDaysYmd(from, 365) ?? to;
  if (to > max) to = max;
  return { fromYmd: from, toYmd: to };
}

/** Shift the selected range by its own length (Previous / Next). */
export function partnerUnifiedShiftRange(
  fromYmd: string,
  toYmd: string,
  direction: 1 | -1
): { fromYmd: string; toYmd: string } {
  const days = Math.max(1, partnerUnifiedRangeDayCount(fromYmd, toYmd));
  const delta = direction * days;
  const nextFrom = addCalendarDaysYmd(fromYmd, delta) ?? fromYmd;
  const nextTo = addCalendarDaysYmd(toYmd, delta) ?? toYmd;
  return partnerUnifiedNormalizeRange(nextFrom, nextTo);
}

export function partnerUnifiedAgendaRange(anchorYmd: string): { fromYmd: string; toYmd: string } {
  return partnerUnifiedRollingRange(anchorYmd);
}

export function partnerUnifiedMonthRange(
  year: number,
  monthIndex0: number
): { fromYmd: string; toYmd: string } {
  const cells = buildMonthCells(year, monthIndex0);
  const first = cells[0]?.iso ?? `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-01`;
  const last = cells[cells.length - 1]?.iso ?? first;
  return { fromYmd: first, toYmd: last };
}

export type PartnerUnifiedRangeCell = {
  iso: string;
  day: number;
  /** True when the cell falls inside the selected From/To range. */
  inRange: boolean;
  weekdayMon0: number;
};

/**
 * Monday–Sunday weeks covering [fromYmd, toYmd], including partial first/last weeks.
 * Cells outside the selected range are still returned (inRange: false) for grid stability.
 */
export function partnerUnifiedWeeksCoveringRange(
  fromYmd: string,
  toYmd: string
): PartnerUnifiedRangeCell[] {
  const range = partnerUnifiedNormalizeRange(fromYmd, toYmd);
  const start = new Date(`${range.fromYmd}T12:00:00Z`);
  const startPad = (start.getUTCDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setUTCDate(start.getUTCDate() - startPad);

  const end = new Date(`${range.toYmd}T12:00:00Z`);
  const endMon0 = (end.getUTCDay() + 6) % 7;
  const endPad = 6 - endMon0;
  const gridEnd = new Date(end);
  gridEnd.setUTCDate(end.getUTCDate() + endPad);

  const cells: PartnerUnifiedRangeCell[] = [];
  const cursor = new Date(gridStart);
  while (cursor.getTime() <= gridEnd.getTime() && cells.length < 54) {
    const iso = cursor.toISOString().slice(0, 10);
    const weekdayMon0 = (cursor.getUTCDay() + 6) % 7;
    cells.push({
      iso,
      day: cursor.getUTCDate(),
      inRange: iso >= range.fromYmd && iso <= range.toYmd,
      weekdayMon0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cells;
}
