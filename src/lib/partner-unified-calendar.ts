/**
 * Mission 05.1–05.5 — Unified Partner Calendar.
 * Aggregates Tours / Stays / Rentals into Agenda + Week + Month views.
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

export type PartnerUnifiedCalendarView = 'agenda' | 'week' | 'month';
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
  | 'stay_listing'
  | 'rental_ongoing'
  | 'rental_block'
  | 'rental_listing';

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
  if (raw === 'week' || raw === 'month') return raw;
  return 'agenda';
}

/** Monday–Sunday week containing `iso` (UTC date-only). */
export function partnerUnifiedWeekRangeContaining(iso: string): {
  fromYmd: string;
  toYmd: string;
} {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
  if (!anchor) return { fromYmd: iso, toYmd: iso };
  const d = new Date(`${anchor}T12:00:00Z`);
  const mon0 = (d.getUTCDay() + 6) % 7;
  const fromYmd = addCalendarDaysYmd(anchor, -mon0) ?? anchor;
  const toYmd = addCalendarDaysYmd(fromYmd, 6) ?? fromYmd;
  return { fromYmd, toYmd };
}

/** Shift a Monday–Sunday week by ±N weeks. */
export function partnerUnifiedShiftWeek(
  fromYmd: string,
  deltaWeeks: number
): { fromYmd: string; toYmd: string } {
  const nextFrom = addCalendarDaysYmd(fromYmd, Math.floor(deltaWeeks) * 7) ?? fromYmd;
  return partnerUnifiedWeekRangeContaining(nextFrom);
}

/** Compact week label for chrome (Mon–Sun, UTC date-only). */
export function formatPartnerUnifiedWeekLabel(fromYmd: string, toYmd: string): string {
  const a = new Date(`${fromYmd}T12:00:00Z`);
  const b = new Date(`${toYmd}T12:00:00Z`);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  if (sameMonth) {
    return `${a.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' })}–${b.toLocaleDateString(
      'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
    )}`;
  }
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  if (sameYear) {
    return `${a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${b.toLocaleDateString(
      'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
    )}`;
  }
  return `${a.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })} – ${b.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })}`;
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
    if (k === 'stay_listing' || k === 'rental_listing') return 4;
    return 5;
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
  if (kind === 'tour_departure') return 'Departure';
  if (kind === 'stay_blocked' || kind === 'rental_block') return 'Blocked';
  if (kind === 'rental_ongoing') return 'On rent';
  if (kind === 'stay_listing') return 'Stay';
  if (kind === 'rental_listing') return 'Rental';
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

/** Calendar month bounds (1st–last) containing `iso` — not the padded grid. */
export function partnerUnifiedMonthRangeContaining(iso: string): {
  fromYmd: string;
  toYmd: string;
} {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
  if (!anchor) return { fromYmd: iso, toYmd: iso };
  const d = new Date(`${anchor}T12:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const fromYmd = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const toYmd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { fromYmd, toYmd };
}

/** Shift by ±N calendar months from a date inside the current month. */
export function partnerUnifiedShiftMonth(
  fromYmd: string,
  deltaMonths: number
): { fromYmd: string; toYmd: string } {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(fromYmd) ? fromYmd : '';
  if (!anchor) return partnerUnifiedMonthRangeContaining(fromYmd);
  const d = new Date(`${anchor}T12:00:00Z`);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Math.floor(deltaMonths), 1));
  return partnerUnifiedMonthRangeContaining(next.toISOString().slice(0, 10));
}

/** Move focus by ±N weeks (same weekday). */
export function partnerUnifiedShiftFocusByWeeks(focusYmd: string, deltaWeeks: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(focusYmd)) return focusYmd;
  return addCalendarDaysYmd(focusYmd, Math.floor(deltaWeeks) * 7) ?? focusYmd;
}

/** Move focus by ±N months, clamping day-of-month (e.g. Jan 31 → Feb 28). */
export function partnerUnifiedShiftFocusByMonths(focusYmd: string, deltaMonths: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(focusYmd)) return focusYmd;
  const d = new Date(`${focusYmd}T12:00:00Z`);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Math.floor(deltaMonths), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Shared focus date used when switching Agenda ↔ Week ↔ Month.
 * Prefers an explicit selected day. Only falls back to fromYmd for Agenda bootstrap —
 * never for Week/Month, where fromYmd may be the Monday of a cross-month week (e.g. Oct 26
 * when focus is Nov 1) and would wrongly pull Month into October.
 */
export function partnerUnifiedSharedFocusYmd(args: {
  selectedYmd?: string | null;
  fromYmd?: string | null;
  toYmd?: string | null;
  todayIso: string;
  /** When false, ignore fromYmd so week Mondays cannot become the Month anchor. Default true. */
  allowFromFallback?: boolean;
}): string {
  const selected = (args.selectedYmd ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(selected)) return selected;
  if (args.allowFromFallback !== false) {
    const from = (args.fromYmd ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) return from;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(args.todayIso) ? args.todayIso : args.todayIso;
}

export type PartnerUnifiedNavState = {
  view: PartnerUnifiedCalendarView;
  focusYmd: string;
  fromYmd: string;
  toYmd: string;
  agendaRange: { fromYmd: string; toYmd: string } | null;
};

/**
 * Pure view switch: Week/Month ranges always re-derive from focusYmd (never inherit
 * the previous view's from/to). Agenda restores a remembered window when it still
 * contains focus; otherwise defaults to the next 30 days from focus.
 */
export function partnerUnifiedApplyViewChange(
  state: PartnerUnifiedNavState,
  nextView: PartnerUnifiedCalendarView
): PartnerUnifiedNavState {
  const focus = state.focusYmd;
  if (nextView === state.view) return state;

  if (nextView === 'week' || nextView === 'month') {
    const range = partnerUnifiedDisplayRangeForView({ view: nextView, focusYmd: focus });
    return {
      ...state,
      view: nextView,
      focusYmd: focus,
      fromYmd: range.fromYmd,
      toYmd: range.toYmd,
      agendaRange:
        state.view === 'agenda'
          ? { fromYmd: state.fromYmd, toYmd: state.toYmd }
          : state.agendaRange,
    };
  }

  // → Agenda
  const remembered =
    state.view === 'agenda'
      ? { fromYmd: state.fromYmd, toYmd: state.toYmd }
      : state.agendaRange;
  if (remembered && partnerUnifiedFocusInRange(focus, remembered.fromYmd, remembered.toYmd)) {
    return {
      ...state,
      view: 'agenda',
      focusYmd: focus,
      fromYmd: remembered.fromYmd,
      toYmd: remembered.toYmd,
      agendaRange: remembered,
    };
  }
  const rolling = partnerUnifiedRollingRange(focus);
  return {
    ...state,
    view: 'agenda',
    focusYmd: focus,
    fromYmd: rolling.fromYmd,
    toYmd: rolling.toYmd,
    agendaRange: rolling,
  };
}

/** Pure Prev/Next: updates focus and the view-appropriate range together. */
export function partnerUnifiedApplyShift(
  state: PartnerUnifiedNavState,
  direction: 1 | -1
): PartnerUnifiedNavState {
  if (state.view === 'week') {
    const focusYmd = partnerUnifiedShiftFocusByWeeks(state.focusYmd, direction);
    const range = partnerUnifiedDisplayRangeForView({ view: 'week', focusYmd });
    return { ...state, focusYmd, fromYmd: range.fromYmd, toYmd: range.toYmd };
  }
  if (state.view === 'month') {
    const focusYmd = partnerUnifiedShiftFocusByMonths(state.focusYmd, direction);
    const range = partnerUnifiedDisplayRangeForView({ view: 'month', focusYmd });
    return { ...state, focusYmd, fromYmd: range.fromYmd, toYmd: range.toYmd };
  }
  const next = partnerUnifiedShiftRange(state.fromYmd, state.toYmd, direction);
  const span = Math.max(1, partnerUnifiedRangeDayCount(state.fromYmd, state.toYmd));
  const focusYmd = partnerUnifiedFocusInRange(state.focusYmd, state.fromYmd, state.toYmd)
    ? addCalendarDaysYmd(state.focusYmd, direction * span) ?? next.fromYmd
    : next.fromYmd;
  return {
    ...state,
    focusYmd,
    fromYmd: next.fromYmd,
    toYmd: next.toYmd,
    agendaRange: { fromYmd: next.fromYmd, toYmd: next.toYmd },
  };
}

export function formatPartnerUnifiedMonthLabel(fromYmd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd)) return fromYmd;
  return new Date(`${fromYmd}T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Derive display From/To for a view from a shared focus date.
 * Week/Month always re-derive from focus (ignore stale from/to).
 * Agenda keeps an explicit custom range when provided; otherwise next 30 days from focus.
 */
export function partnerUnifiedDisplayRangeForView(args: {
  view: PartnerUnifiedCalendarView;
  focusYmd: string;
  fromYmd?: string | null;
  toYmd?: string | null;
}): { fromYmd: string; toYmd: string } {
  const focus =
    /^\d{4}-\d{2}-\d{2}$/.test(args.focusYmd) ? args.focusYmd : args.fromYmd || args.focusYmd;
  if (args.view === 'week') return partnerUnifiedWeekRangeContaining(focus);
  if (args.view === 'month') return partnerUnifiedMonthRangeContaining(focus);
  const from = (args.fromYmd ?? '').trim();
  const to = (args.toYmd ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return partnerUnifiedNormalizeRange(from, to, focus);
  }
  return partnerUnifiedRollingRange(focus);
}

/** True when focus falls inside an inclusive agenda From/To window. */
export function partnerUnifiedFocusInRange(
  focusYmd: string,
  fromYmd: string,
  toYmd: string
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(focusYmd)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) return false;
  return focusYmd >= fromYmd && focusYmd <= toYmd;
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
