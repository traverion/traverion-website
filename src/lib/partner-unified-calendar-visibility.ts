/**
 * Mission 05.5 — Operational visibility overlays for the Unified Partner Calendar.
 * Reuses tour workspace departures, stay night kinds, and rental day preview — no second engine.
 */

import { experienceTodayIsoForListing } from './booking-quote';
import { inventoryFamilyFromListing } from './inventory';
import {
  addCalendarDaysYmd,
  lifecycleReminderAnchorYmd,
  lifecycleRentalReturnYmd,
} from './booking-lifecycle-calendar';
import { bookingOccupiesInventory, tourCheckoutOccupiedGuests } from './booking-hold';
import { partnerBookingIsOperatingTrip, scheduleTodayIsoForBooking } from './trip-views';
import { bookingIsRental } from './pickup-completeness';
import { parseRentalPurchaseSnapshot } from './rental-booking-domain';
import {
  stayCalendarCapacityOnNight,
  stayCalendarNightKind,
  stayCalendarOccupyingOnNight,
  type StayCalendarBooking,
  type StayCalendarCap,
} from './stay-calendar-workspace';
import {
  buildWorkspaceDepartures,
  statusLabel,
  type DepartureAvailStatus,
  type WorkspaceDeparture,
} from '../pages/supplier/availabilityWorkspaceModel';
import {
  partnerUnifiedDayBoundsUtc,
  partnerUnifiedRentalDayVariants,
} from './partner-unified-day-edits';
import {
  rentalVariantsFromListingExtras,
  type RentalAvailabilityBlockRow,
  type RentalInventoryHoldRow,
} from '../data/supabase-rental-availability';
import type { TourPackage } from '../types/tour';
import type {
  PartnerUnifiedCalendarBooking,
  PartnerUnifiedCalendarEvent,
  PartnerUnifiedCalendarEventKind,
  PartnerUnifiedMonthDaySummary,
} from './partner-unified-calendar';
import { enumerateIsoDates } from '../pages/supplier/calendarAvailabilityUi';

const ALL_WEEKDAYS = [true, true, true, true, true, true, true];

/** Operational calendar presence — exclude drafts (same bar as traveler catalog). */
export function partnerUnifiedListingIsOperational(listing: TourPackage): boolean {
  return listing.status !== 'draft';
}

function filterListingsByFamily(
  listings: TourPackage[],
  family: 'stay' | 'rental',
  listingIdFilter?: string | null
): TourPackage[] {
  const filter = (listingIdFilter ?? '').trim();
  return listings.filter((l) => {
    if (inventoryFamilyFromListing(l) !== family) return false;
    if (!partnerUnifiedListingIsOperational(l)) return false;
    if (filter && l.id !== filter) return false;
    return true;
  });
}

export type PartnerUnifiedDepartureStatus = DepartureAvailStatus;

function departureStatusLabel(status: DepartureAvailStatus): string {
  if (status === 'available') return 'Open';
  if (status === 'sold_out') return 'Full';
  if (status === 'closed') return 'Closed';
  if (status === 'cutoff') return 'Cutoff passed';
  return statusLabel(status);
}

function sortKeyTime(timeHm: string | null): string {
  return timeHm && timeHm !== '—' ? timeHm : '99:99';
}

/** Build one calendar row per scheduled tour departure (including zero bookings). */
export function buildPartnerUnifiedTourDepartureEvents(params: {
  listings: TourPackage[];
  bookings: PartnerUnifiedCalendarBooking[];
  /** listingId → available_date → capacity (day-wide). Missing map = unknown closed state. */
  dayCaps: Map<string, Map<string, number>>;
  fromYmd: string;
  toYmd: string;
  listingIdFilter?: string | null;
  nowMs?: number;
}): PartnerUnifiedCalendarEvent[] {
  const nowMs = params.nowMs ?? Date.now();
  const listingFilter = (params.listingIdFilter ?? '').trim();
  const tourListings = params.listings.filter((l) => inventoryFamilyFromListing(l) === 'tour');
  const listingIds = listingFilter
    ? tourListings.some((l) => l.id === listingFilter)
      ? [listingFilter]
      : []
    : tourListings.map((l) => l.id);

  if (listingIds.length === 0) return [];

  const bookingsByListing = new Map<string, PartnerUnifiedCalendarBooking[]>();
  for (const b of params.bookings) {
    const list = bookingsByListing.get(b.listing_id);
    if (list) list.push(b);
    else bookingsByListing.set(b.listing_id, [b]);
  }

  const deps = buildWorkspaceDepartures({
    listings: tourListings,
    listingIds,
    optionId: '',
    fromIso: params.fromYmd,
    toIso: params.toYmd,
    dayCaps: params.dayCaps,
    occupyingForSlot: (listingId, iso, startTimeHm) =>
      tourCheckoutOccupiedGuests(
        bookingsByListing.get(listingId) ?? [],
        iso,
        null,
        nowMs,
        startTimeHm
      ),
    nowMs,
  });

  return deps.map((d) => workspaceDepartureToEvent(d, tourListings, nowMs));
}

function subtractHoursFromHm(startTimeHm: string, hours: number): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((startTimeHm || '').trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]) - Math.max(0, Math.floor(hours)) * 60;
  // Same-day close time only; overnight cutoffs fall back to hours label.
  if (total < 0 || total >= 24 * 60) return null;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function tourCutoffCardLabel(params: {
  status: DepartureAvailStatus;
  cutoffHours: number;
  startTimeHm: string;
}): string | null {
  const hours = Math.max(0, Math.floor(params.cutoffHours));
  if (params.status === 'closed') return 'Day blocked';
  if (params.status === 'cutoff') {
    const closedAt = subtractHoursFromHm(params.startTimeHm, hours);
    if (closedAt) return `Closed at ${closedAt}`;
    return hours > 0 ? `Cutoff: ${hours}h before` : 'Past cutoff';
  }
  if (hours <= 0) return 'Until departure';
  const closedAt = subtractHoursFromHm(params.startTimeHm, hours);
  if (closedAt) return `Cutoff: ${hours}h before · closes ${closedAt}`;
  return `Cutoff: ${hours}h before`;
}

function workspaceDepartureToEvent(
  d: WorkspaceDeparture,
  listings: TourPackage[],
  nowMs: number
): PartnerUnifiedCalendarEvent {
  const listing = listings.find((l) => l.id === d.listingId);
  const activeTodayIso =
    experienceTodayIsoForListing(listing?.listingExtras?.departureTimezone, nowMs) ||
    d.iso;
  const status = d.status;
  const qty = `Booked ${d.booked} · Cap ${d.capacity} · Avail ${d.remaining}`;
  const cutoffLabel = tourCutoffCardLabel({
    status,
    cutoffHours: d.cutoffHours,
    startTimeHm: d.startTimeHm,
  });
  return {
    key: `dep:${d.key}`,
    ymd: d.iso,
    kind: 'tour_departure',
    category: 'tour',
    listingId: d.listingId,
    listingTitle: d.listingTitle,
    optionLabel: d.optionName,
    guestName: null,
    reference: null,
    bookingId: null,
    timeHm: d.startTimeHm === '—' ? null : d.startTimeHm,
    quantityLabel: qty,
    metaLine: `${departureStatusLabel(status)} · ${qty}`,
    activeTodayIso,
    source: 'schedule',
    departureStatus: status,
    bookedCount: d.booked,
    capacityCount: d.capacity,
    remainingCount: d.remaining,
    cutoffHours: d.cutoffHours,
    cutoffLabel,
  };
}

/** Blocked stay nights for a stay listing (no per-available-night explosion). */
export function buildPartnerUnifiedStayBlockedEvents(params: {
  listing: TourPackage;
  bookings: StayCalendarBooking[];
  caps: StayCalendarCap[];
  fromYmd: string;
  toYmd: string;
  nowMs?: number;
}): PartnerUnifiedCalendarEvent[] {
  if (inventoryFamilyFromListing(params.listing) !== 'stay') return [];
  if (!partnerUnifiedListingIsOperational(params.listing)) return [];
  const nowMs = params.nowMs ?? Date.now();
  const activeTodayIso =
    experienceTodayIsoForListing(params.listing.listingExtras?.departureTimezone, nowMs) ||
    params.fromYmd;
  const dates = enumerateIsoDates(params.fromYmd, params.toYmd, ALL_WEEKDAYS);
  const out: PartnerUnifiedCalendarEvent[] = [];
  for (const iso of dates) {
    const occupying = stayCalendarOccupyingOnNight(
      params.bookings,
      params.listing.id,
      iso,
      nowMs
    );
    const capacity = stayCalendarCapacityOnNight(params.caps, params.listing.id, iso);
    const kind = stayCalendarNightKind({ occupying, capacity, nowMs });
    if (kind !== 'blocked') continue;
    out.push({
      key: `stay_blocked:${params.listing.id}:${iso}`,
      ymd: iso,
      kind: 'stay_blocked',
      category: 'stay',
      listingId: params.listing.id,
      listingTitle: params.listing.title?.trim() || 'Stay',
      optionLabel: null,
      guestName: null,
      reference: null,
      bookingId: null,
      timeHm: null,
      quantityLabel: 'Blocked',
      metaLine: 'Blocked · no new check-ins',
      activeTodayIso,
      source: 'availability',
      departureStatus: null,
    });
  }
  return out;
}

/**
 * One availability row per published stay × night in range (zero bookings OK).
 * Status is Available / Occupied / Blocked from caps + reservations — no fake check-ins.
 */
export function buildPartnerUnifiedStayPresenceEvents(params: {
  listings: TourPackage[];
  bookings: StayCalendarBooking[];
  caps: StayCalendarCap[];
  fromYmd: string;
  toYmd: string;
  listingIdFilter?: string | null;
  nowMs?: number;
}): PartnerUnifiedCalendarEvent[] {
  const nowMs = params.nowMs ?? Date.now();
  const stays = filterListingsByFamily(params.listings, 'stay', params.listingIdFilter);
  const dates = enumerateIsoDates(params.fromYmd, params.toYmd, ALL_WEEKDAYS);
  const out: PartnerUnifiedCalendarEvent[] = [];
  for (const listing of stays) {
    const activeTodayIso =
      experienceTodayIsoForListing(listing.listingExtras?.departureTimezone, nowMs) ||
      params.fromYmd;
    for (const iso of dates) {
      const occupying = stayCalendarOccupyingOnNight(params.bookings, listing.id, iso, nowMs);
      const capacity = stayCalendarCapacityOnNight(params.caps, listing.id, iso);
      const kind = stayCalendarNightKind({ occupying, capacity, nowMs });
      const status =
        kind === 'blocked'
          ? 'Blocked'
          : kind === 'booked' || kind === 'pending'
            ? 'Occupied'
            : 'Available';
      out.push({
        key: `stay_listing:${listing.id}:${iso}`,
        ymd: iso,
        kind: 'stay_listing',
        category: 'stay',
        listingId: listing.id,
        listingTitle: listing.title?.trim() || 'Stay',
        optionLabel: 'Property availability',
        guestName: null,
        reference: null,
        bookingId: null,
        timeHm: null,
        quantityLabel: status,
        metaLine: status,
        activeTodayIso,
        source: 'availability',
        departureStatus: kind === 'blocked' ? 'closed' : null,
      });
    }
  }
  return out;
}

/** Mid-rental days between collection and return for a rental listing. */
export function buildPartnerUnifiedRentalOngoingEvents(params: {
  listing: TourPackage;
  bookings: PartnerUnifiedCalendarBooking[];
  fromYmd: string;
  toYmd: string;
  nowMs?: number;
}): PartnerUnifiedCalendarEvent[] {
  if (inventoryFamilyFromListing(params.listing) !== 'rental') return [];
  if (!partnerUnifiedListingIsOperational(params.listing)) return [];
  const nowMs = params.nowMs ?? Date.now();
  const out: PartnerUnifiedCalendarEvent[] = [];
  const seen = new Set<string>();

  for (const b of params.bookings) {
    if (b.listing_id !== params.listing.id) continue;
    if (!partnerBookingIsOperatingTrip(b)) continue;
    if (!bookingOccupiesInventory(b, nowMs)) continue;
    if (!bookingIsRental(b)) continue;

    const collectionYmd = lifecycleReminderAnchorYmd(b);
    const returnYmd = lifecycleRentalReturnYmd(b);
    if (!collectionYmd || !returnYmd) continue;
    const activeTodayIso = scheduleTodayIsoForBooking(b, nowMs);
    let cursor = addCalendarDaysYmd(collectionYmd, 1);
    for (let guard = 0; guard < 400; guard += 1) {
      if (!cursor || cursor >= returnYmd) break;
      if (cursor >= params.fromYmd && cursor <= params.toYmd) {
        const key = `rental_ongoing:${b.id}:${cursor}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
            key,
            ymd: cursor,
            kind: 'rental_ongoing',
            category: 'rental',
            listingId: params.listing.id,
            listingTitle: params.listing.title?.trim() || 'Rental',
            optionLabel: parseRentalPurchaseSnapshot(b.purchase_snapshot)?.variantName?.trim() || null,
            guestName: (b.guest_name ?? '').trim() || null,
            reference: (b.public_reference ?? '').trim() || null,
            bookingId: b.id,
            timeHm: null,
            quantityLabel: 'On rent',
            metaLine: 'Ongoing rental',
            activeTodayIso,
            source: 'booking',
            departureStatus: null,
          });
        }
      }
      const next = addCalendarDaysYmd(cursor, 1);
      if (!next || next === cursor) break;
      cursor = next;
    }
  }
  return out;
}

/**
 * One availability row per published rental × option × day in range (zero bookings OK).
 * Stock uses listing variants + range blocks/holds — no fake collection/return events.
 */
export function buildPartnerUnifiedRentalPresenceEvents(params: {
  listings: TourPackage[];
  blocks: RentalAvailabilityBlockRow[];
  holds?: RentalInventoryHoldRow[];
  fromYmd: string;
  toYmd: string;
  listingIdFilter?: string | null;
  nowMs?: number;
}): PartnerUnifiedCalendarEvent[] {
  const nowMs = params.nowMs ?? Date.now();
  const holds = params.holds ?? [];
  const rentals = filterListingsByFamily(params.listings, 'rental', params.listingIdFilter);
  const dates = enumerateIsoDates(params.fromYmd, params.toYmd, ALL_WEEKDAYS);
  const out: PartnerUnifiedCalendarEvent[] = [];
  for (const listing of rentals) {
    const activeTodayIso =
      experienceTodayIsoForListing(listing.listingExtras?.departureTimezone, nowMs) ||
      params.fromYmd;
    const listingBlocks = params.blocks.filter((b) => b.listing_id === listing.id);
    const listingHolds = holds.filter((h) => h.listing_id === listing.id);
    const configured = rentalVariantsFromListingExtras(listing.listingExtras);
    for (const iso of dates) {
      const dayVariants = partnerUnifiedRentalDayVariants({
        listing,
        iso,
        blocks: listingBlocks,
        holds: listingHolds,
        nowMs,
      });
      if (dayVariants.length === 0) {
        out.push({
          key: `rental_listing:${listing.id}:none:${iso}`,
          ymd: iso,
          kind: 'rental_listing',
          category: 'rental',
          listingId: listing.id,
          listingTitle: listing.title?.trim() || 'Rental',
          optionLabel: configured.length ? 'Inventory' : 'Configure stock',
          guestName: null,
          reference: null,
          bookingId: null,
          timeHm: null,
          quantityLabel: 'Configure stock',
          metaLine: 'Configure stock',
          activeTodayIso,
          source: 'availability',
          departureStatus: null,
        });
        continue;
      }
      for (const v of dayVariants) {
        out.push({
          key: `rental_listing:${listing.id}:${v.variantId}:${iso}`,
          ymd: iso,
          kind: 'rental_listing',
          category: 'rental',
          listingId: listing.id,
          listingTitle: listing.title?.trim() || 'Rental',
          optionLabel: v.name,
          guestName: null,
          reference: null,
          bookingId: null,
          timeHm: null,
          quantityLabel: v.blocked ? 'Blocked' : `${v.available} / ${v.stock}`,
          metaLine: v.blocked
            ? 'Blocked'
            : `${v.available} available · ${v.stock} stock${
                v.reserved > 0 ? ` · ${v.reserved} reserved` : ''
              }`,
          activeTodayIso,
          source: 'availability',
          departureStatus: v.blocked ? 'closed' : null,
          bookedCount: v.reserved,
          capacityCount: v.stock,
          remainingCount: v.available,
        });
      }
    }
  }
  return out;
}

/** One blocked-day marker per calendar day covered by a rental availability block. */
export function buildPartnerUnifiedRentalBlockEvents(params: {
  listing: TourPackage;
  blocks: RentalAvailabilityBlockRow[];
  fromYmd: string;
  toYmd: string;
  nowMs?: number;
}): PartnerUnifiedCalendarEvent[] {
  if (inventoryFamilyFromListing(params.listing) !== 'rental') return [];
  if (!partnerUnifiedListingIsOperational(params.listing)) return [];
  const nowMs = params.nowMs ?? Date.now();
  const activeTodayIso =
    experienceTodayIsoForListing(params.listing.listingExtras?.departureTimezone, nowMs) ||
    params.fromYmd;
  const dates = enumerateIsoDates(params.fromYmd, params.toYmd, ALL_WEEKDAYS);
  const out: PartnerUnifiedCalendarEvent[] = [];

  for (const iso of dates) {
    const bounds = partnerUnifiedDayBoundsUtc(iso);
    const covering = params.blocks.filter((b) => {
      const s = Date.parse(b.starts_at);
      const e = Date.parse(b.ends_at);
      return Number.isFinite(s) && Number.isFinite(e) && s < bounds.endMs && bounds.startMs < e;
    });
    if (covering.length === 0) continue;
    const variantNote = covering.some((b) => b.variant_id == null)
      ? 'All options'
      : 'Option block';
    out.push({
      key: `rental_block:${params.listing.id}:${iso}`,
      ymd: iso,
      kind: 'rental_block',
      category: 'rental',
      listingId: params.listing.id,
      listingTitle: params.listing.title?.trim() || 'Rental',
      optionLabel: variantNote,
      guestName: null,
      reference: null,
      bookingId: null,
      timeHm: null,
      quantityLabel: 'Blocked',
      metaLine: `Blocked · ${variantNote}`,
      activeTodayIso,
      source: 'availability',
      departureStatus: null,
    });
  }
  return out;
}

/** Stock snapshot labels for a selected rental listing on a day (for side panel / month badges). */
export function partnerUnifiedRentalDayStockSummary(params: {
  listing: TourPackage;
  iso: string;
  blocks: RentalAvailabilityBlockRow[];
  holds: RentalInventoryHoldRow[];
  nowMs?: number;
}): Array<{ optionName: string; stock: number; reserved: number; available: number; blocked: boolean }> {
  return partnerUnifiedRentalDayVariants({
    listing: params.listing,
    iso: params.iso,
    blocks: params.blocks,
    holds: params.holds,
    nowMs: params.nowMs,
  }).map((v) => ({
    optionName: v.name,
    stock: v.stock,
    reserved: v.reserved,
    available: v.available,
    blocked: v.blocked,
  }));
}

/**
 * Merge booking events with operational overlays.
 * Tour booking rows are dropped when schedule departures cover the same listing/day/time
 * so multiple guests on one slot appear as a single departure.
 */
export function mergePartnerUnifiedVisibilityEvents(params: {
  bookingEvents: PartnerUnifiedCalendarEvent[];
  tourDepartures: PartnerUnifiedCalendarEvent[];
  stayBlocked: PartnerUnifiedCalendarEvent[];
  stayPresence?: PartnerUnifiedCalendarEvent[];
  rentalOngoing: PartnerUnifiedCalendarEvent[];
  rentalBlocks: PartnerUnifiedCalendarEvent[];
  rentalPresence?: PartnerUnifiedCalendarEvent[];
}): PartnerUnifiedCalendarEvent[] {
  const departureKeys = new Set(
    params.tourDepartures.map((d) => `${d.listingId}|${d.ymd}|${sortKeyTime(d.timeHm)}`)
  );
  const bookingKept = params.bookingEvents.filter((e) => {
    if (e.kind !== 'tour') return true;
    // Prefer schedule departure when we have one for this listing/day/time.
    const key = `${e.listingId}|${e.ymd}|${sortKeyTime(e.timeHm)}`;
    if (departureKeys.has(key)) return false;
    // Also drop when any departure exists that day for listing (occupancy rolled into slots).
    // Keep orphan booking only if no schedule row exists for that listing+day at all.
    const hasAnyDep = params.tourDepartures.some(
      (d) => d.listingId === e.listingId && d.ymd === e.ymd
    );
    return !hasAnyDep;
  });

  const merged = [
    ...bookingKept,
    ...params.tourDepartures,
    ...(params.stayPresence ?? []),
    ...params.stayBlocked,
    ...(params.rentalPresence ?? []),
    ...params.rentalOngoing,
    ...params.rentalBlocks,
  ];

  return merged.sort((a, b) => {
    const byDay = a.ymd.localeCompare(b.ymd);
    if (byDay) return byDay;
    const byTime = sortKeyTime(a.timeHm).localeCompare(sortKeyTime(b.timeHm));
    if (byTime) return byTime;
    return a.key.localeCompare(b.key);
  });
}

export function partnerUnifiedVisibilityKindLabel(
  kind: PartnerUnifiedCalendarEventKind
): string {
  switch (kind) {
    case 'tour_departure':
      return 'Departure';
    case 'stay_blocked':
      return 'Blocked';
    case 'stay_listing':
      return 'Stay';
    case 'rental_ongoing':
      return 'On rent';
    case 'rental_block':
      return 'Blocked';
    case 'rental_listing':
      return 'Rental';
    case 'rental_collection':
      return 'Collection';
    case 'rental_return':
      return 'Return';
    case 'stay_check_in':
      return 'Check-in';
    case 'stay_check_out':
      return 'Check-out';
    case 'stay_occupied':
      return 'Stay';
    case 'tour':
      return 'Tour';
    default:
      return 'Event';
  }
}

/** Enrich month cell when a stay listing is selected — booked/blocked/available without event spam. */
export function annotateStayMonthSummaries(params: {
  summaries: Map<string, PartnerUnifiedMonthDaySummary>;
  listingId: string;
  bookings: StayCalendarBooking[];
  caps: StayCalendarCap[];
  nowMs?: number;
}): Map<string, PartnerUnifiedMonthDaySummary> {
  const nowMs = params.nowMs ?? Date.now();
  const next = new Map(params.summaries);
  for (const [iso, row] of next) {
    const occupying = stayCalendarOccupyingOnNight(
      params.bookings,
      params.listingId,
      iso,
      nowMs
    );
    const capacity = stayCalendarCapacityOnNight(params.caps, params.listingId, iso);
    const kind = stayCalendarNightKind({ occupying, capacity, nowMs });
    next.set(iso, {
      ...row,
      stayNightKind: kind === 'pending' ? 'booked' : kind,
    });
  }
  return next;
}
