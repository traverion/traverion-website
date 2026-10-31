/**
 * Mission 05.1 — Unified Partner Calendar (read-only).
 * Aggregates Tours / Stays / Rentals into Agenda + Month views.
 * Reuses booking occupancy + lifecycle calendar helpers; no separate inventory engine.
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

export type PartnerUnifiedCalendarEvent = {
  key: string;
  ymd: string;
  kind: PartnerHomeScheduleEventKind;
  category: PartnerBookingDeskFamily;
  listingId: string;
  listingTitle: string;
  optionLabel: string | null;
  guestName: string | null;
  reference: string | null;
  bookingId: string;
  timeHm: string | null;
  /** Tour guests / stay guests / rental qty. */
  quantityLabel: string | null;
  metaLine: string | null;
};

export type PartnerUnifiedMonthDaySummary = {
  iso: string;
  total: number;
  tour: number;
  stay: number;
  rental: number;
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
  const kindRank = (k: PartnerHomeScheduleEventKind): number => {
    if (k === 'rental_collection' || k === 'stay_check_in') return 0;
    if (k === 'rental_return' || k === 'stay_check_out') return 1;
    if (k === 'stay_occupied') return 2;
    return 3;
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
    });
  }

  return out.sort(sortUnifiedEvents);
}

export function filterPartnerUnifiedCalendarEvents(
  events: PartnerUnifiedCalendarEvent[],
  filters: {
    category: PartnerUnifiedCategoryFilter;
    listingId: string | null;
    optionKey: string | null;
  }
): PartnerUnifiedCalendarEvent[] {
  const listingId = (filters.listingId ?? '').trim();
  const optionKey = (filters.optionKey ?? '').trim();
  return events.filter((e) => {
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

export function partnerUnifiedEventKindLabel(kind: PartnerHomeScheduleEventKind): string {
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

/** Inclusive agenda window length (days) from anchor. */
export const PARTNER_UNIFIED_AGENDA_DAYS = 14;

export function partnerUnifiedAgendaRange(anchorYmd: string): { fromYmd: string; toYmd: string } {
  const toYmd = addCalendarDaysYmd(anchorYmd, PARTNER_UNIFIED_AGENDA_DAYS - 1) ?? anchorYmd;
  return { fromYmd: anchorYmd, toYmd };
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
