import { addCalendarDays } from '../../lib/stayOccupancy';
import { tourSellingDeparturesOnDate } from '../../lib/listing-option-schedules';
import { materializedBookingOptions } from '../../types/listingExtras';
import type { TourPackage } from '../../types/tour';
import { inventoryFamilyFromListing } from '../../lib/inventory';
import {
  normalizeBookingCutoffHours,
  isDepartureTimeStillBookable,
  bookingCutoffTravelerLabel,
} from '../../lib/tour-departure-cutoff';
import { partnerTourRemainingSpots } from '../../lib/availability-ops';
import {
  findSlotOverride,
  resolveSlotCapacity,
  resolveSlotCutoffHours,
} from '../../lib/listing-slot-overrides';
import { resolveOptionCutoffHours, cutoffDisplayLabel } from './calendarAvailabilityUi';

export type AvailabilityViewMode = 'agenda' | 'week' | 'month';

export type AvailabilityStatusFilter =
  | 'all'
  | 'available'
  | 'limited'
  | 'sold_out'
  | 'closed'
  | 'cutoff'
  | 'no_schedule';

export type DepartureAvailStatus =
  | 'available'
  | 'limited'
  | 'sold_out'
  | 'closed'
  | 'cutoff'
  | 'no_schedule';

export type WorkspaceDeparture = {
  key: string;
  iso: string;
  listingId: string;
  listingTitle: string;
  optionId: string;
  optionName: string;
  scheduleId: string;
  scheduleName: string;
  startTimeHm: string;
  capacity: number;
  remaining: number;
  booked: number;
  cutoffHours: number;
  cutoffLabel: string;
  status: DepartureAvailStatus;
  dayCapacityOverride: number | null;
};

export function parseAvailabilityView(raw: string | null | undefined): AvailabilityViewMode {
  if (raw === 'week' || raw === 'month' || raw === 'agenda') return raw;
  return 'agenda';
}

export function parseStatusFilter(raw: string | null | undefined): AvailabilityStatusFilter {
  if (
    raw === 'available' ||
    raw === 'limited' ||
    raw === 'sold_out' ||
    raw === 'closed' ||
    raw === 'cutoff' ||
    raw === 'no_schedule'
  ) {
    return raw;
  }
  return 'all';
}

/** Monday-first week containing `iso` (UTC date-only). */
export function weekRangeContaining(iso: string): { from: string; to: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  const mon0 = (d.getUTCDay() + 6) % 7;
  const from = addCalendarDays(iso, -mon0);
  return { from, to: addCalendarDays(from, 6) };
}

export function nextDaysRange(fromIso: string, days: number): { from: string; to: string } {
  const n = Math.max(1, Math.floor(days));
  return { from: fromIso, to: addCalendarDays(fromIso, n - 1) };
}

/** Shift a Monday–Sunday week window by ±7 days. */
export function shiftWeekRange(fromIso: string, deltaWeeks: number): { from: string; to: string } {
  const from = addCalendarDays(fromIso, Math.floor(deltaWeeks) * 7);
  return { from, to: addCalendarDays(from, 6) };
}

/** Human label for a Mon–Sun ISO range (local noon parse, en-GB). */
export function formatWeekRangeLabel(fromIso: string, toIso: string): string {
  const a = new Date(`${fromIso}T12:00:00`);
  const b = new Date(`${toIso}T12:00:00`);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.toLocaleDateString('en-GB', { day: 'numeric' })}–${b.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;
  }
  return `${a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString(
    'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric' }
  )}`;
}

export function statusLabel(status: DepartureAvailStatus): string {
  switch (status) {
    case 'available':
      return 'Available';
    case 'limited':
      return 'Limited';
    case 'sold_out':
      return 'Sold out';
    case 'closed':
      return 'Closed';
    case 'cutoff':
      return 'Past cutoff';
    case 'no_schedule':
      return 'No schedule';
    default:
      return status;
  }
}

export function classifyDepartureStatus(params: {
  dayCapacityOverride: number | null;
  remaining: number;
  capacity: number;
  cutoffStillBookable: boolean;
}): DepartureAvailStatus {
  if (params.dayCapacityOverride != null && params.dayCapacityOverride < 1) return 'closed';
  if (params.capacity < 1) return 'closed';
  if (!params.cutoffStillBookable) return 'cutoff';
  if (params.remaining <= 0) return 'sold_out';
  if (params.remaining < params.capacity && params.remaining <= Math.max(2, Math.floor(params.capacity * 0.35))) {
    return 'limited';
  }
  if (params.remaining < params.capacity) return 'limited';
  return 'available';
}

export function buildWorkspaceDepartures(params: {
  listings: TourPackage[];
  listingIds: string[] | 'all';
  optionId: string | '';
  fromIso: string;
  toIso: string;
  /** Map listingId → available_date → capacity */
  dayCaps: Map<string, Map<string, number>>;
  /** Occupying guests for listingId|iso|HH:MM */
  occupyingForSlot: (listingId: string, iso: string, startTimeHm: string) => number;
  nowMs?: number;
}): WorkspaceDeparture[] {
  const out: WorkspaceDeparture[] = [];
  const nowMs = params.nowMs ?? Date.now();
  const listingSet =
    params.listingIds === 'all' ? null : new Set(params.listingIds.filter(Boolean));

  for (const listing of params.listings) {
    if (listingSet && !listingSet.has(listing.id)) continue;
    if (inventoryFamilyFromListing(listing) === 'stay') continue;
    const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
    const tz = listing.listingExtras?.departureTimezone;
    const capsForListing = params.dayCaps.get(listing.id);

    let cur = params.fromIso;
    while (cur <= params.toIso) {
      const deps = tourSellingDeparturesOnDate(opts, cur);
      const dayCapRaw = capsForListing?.get(cur);
      const dayCap =
        typeof dayCapRaw === 'number' && Number.isFinite(dayCapRaw) ? Math.floor(dayCapRaw) : null;

      for (const d of deps) {
        if (params.optionId && d.optionId !== params.optionId) continue;
        const startTimeHm = (d.startTime || '').trim().slice(0, 5);
        const slotOv = findSlotOverride(listing.listingExtras?.slotOverrides, cur, startTimeHm);
        const capacity = resolveSlotCapacity({
          scheduleCapacity: Math.max(0, Math.floor(d.maxSpotsPerSlot)),
          override: slotOv,
        });
        const booked = params.occupyingForSlot(listing.id, cur, startTimeHm);
        let remaining = partnerTourRemainingSpots(capacity, booked);
        if (dayCap != null) {
          // Day-wide override: capacity 0 closes the day. Positive legacy day caps still LEAST.
          if (dayCap < 1) remaining = 0;
          else remaining = Math.min(remaining, partnerTourRemainingSpots(dayCap, booked));
        }
        const baselineCutoff = resolveOptionCutoffHours(listing, d.optionId);
        const cutoffHours = resolveSlotCutoffHours({
          baselineCutoffHours: baselineCutoff,
          override: slotOv,
        });
        const cutoffStillBookable = isDepartureTimeStillBookable({
          bookingDate: cur,
          startTimeHm: startTimeHm || '00:00',
          cutoffHoursBeforeStart: cutoffHours,
          nowMs,
          timeZone: tz,
        });
        const status = classifyDepartureStatus({
          dayCapacityOverride: dayCap,
          remaining,
          capacity,
          cutoffStillBookable,
        });
        out.push({
          key: `${listing.id}|${cur}|${d.optionId}|${d.scheduleId}|${startTimeHm}`,
          iso: cur,
          listingId: listing.id,
          listingTitle: listing.title?.trim() || 'Listing',
          optionId: d.optionId,
          optionName: d.optionName.trim() || 'Option',
          scheduleId: d.scheduleId,
          scheduleName: d.scheduleName.trim() || d.optionName.trim() || 'Departure',
          startTimeHm: startTimeHm || '—',
          capacity,
          remaining,
          booked,
          cutoffHours: normalizeBookingCutoffHours(cutoffHours),
          cutoffLabel:
            cutoffDisplayLabel(cutoffHours) ||
            bookingCutoffTravelerLabel(cutoffHours) ||
            'Until departure',
          status,
          dayCapacityOverride: dayCap,
        });
      }
      cur = addCalendarDays(cur, 1);
      if (out.length > 8000) break;
    }
    if (out.length > 8000) break;
  }

  out.sort((a, b) => {
    const d = a.iso.localeCompare(b.iso);
    if (d !== 0) return d;
    const t = a.startTimeHm.localeCompare(b.startTimeHm);
    if (t !== 0) return t;
    return a.listingTitle.localeCompare(b.listingTitle);
  });
  return out;
}

export function filterDeparturesByStatus(
  rows: WorkspaceDeparture[],
  status: AvailabilityStatusFilter
): WorkspaceDeparture[] {
  if (status === 'all') return rows;
  return rows.filter((r) => r.status === status);
}

export function groupDeparturesByDate(
  rows: WorkspaceDeparture[]
): Array<{ iso: string; rows: WorkspaceDeparture[] }> {
  const map = new Map<string, WorkspaceDeparture[]>();
  for (const r of rows) {
    const list = map.get(r.iso);
    if (list) list.push(r);
    else map.set(r.iso, [r]);
  }
  return [...map.entries()].map(([iso, group]) => ({ iso, rows: group }));
}

export function optionChoicesForListings(
  listings: TourPackage[],
  listingIds: string[] | 'all'
): Array<{ value: string; label: string; hint?: string }> {
  const set = listingIds === 'all' ? null : new Set(listingIds.filter(Boolean));
  const seen = new Set<string>();
  const out: Array<{ value: string; label: string; hint?: string }> = [];
  for (const listing of listings) {
    if (set && !set.has(listing.id)) continue;
    if (inventoryFamilyFromListing(listing) === 'stay') continue;
    const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
    for (const o of opts) {
      if (!o?.id || seen.has(o.id)) continue;
      seen.add(o.id);
      out.push({
        value: o.id,
        label: (o.name ?? '').trim() || 'Option',
        hint: listing.title?.trim() || undefined,
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}
