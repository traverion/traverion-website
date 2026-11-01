/**
 * Mission 05.3 — Single-date availability edits for the Unified Partner Calendar.
 * Thin wrappers around existing tour/stay/rental availability APIs (no second inventory engine).
 */

import {
  deleteAvailability,
  upsertAvailability,
  type AvailabilityRow,
} from '../data/supabase-availability';
import { updateListing } from '../data/supabase-listings';
import {
  createRentalAvailabilityBlock,
  deleteRentalAvailabilityBlock,
  previewDayAvailability,
  rentalDetailsFromListingExtras,
  rentalVariantsFromListingExtras,
  type RentalAvailabilityBlockRow,
  type RentalInventoryHoldRow,
} from '../data/supabase-rental-availability';
import { tourCheckoutOccupiedGuests } from './booking-hold';
import { inventoryFamilyFromListing } from './inventory';
import {
  findSlotOverride,
  normalizeStartTimeHm,
  resolveSlotCapacity,
  resolveSlotCutoffHours,
  SLOT_OVERRIDE_CAPACITY_MAX,
  upsertSlotOverride,
  type ListingSlotOverride,
} from './listing-slot-overrides';
import { tourSellingDeparturesOnDate, type TourSellingDeparture } from './listing-option-schedules';
import { maxConcurrentReservedQuantity, type RentalInterval } from './rental-availability';
import {
  stayCalendarCanBlockNight,
  stayCalendarCanUnblockNight,
  stayCalendarCapacityOnNight,
  stayCalendarNightKind,
  stayCalendarOccupyingOnNight,
  type StayCalendarBooking,
  type StayCalendarCap,
} from './stay-calendar-workspace';
import { stayNightIsOperatorBlocked } from './stayOccupancy';
import { materializedBookingOptions } from '../types/listingExtras';
import type { TourPackage } from '../types/tour';
import { normalizeBookingCutoffHours } from './tour-departure-cutoff';
import { addCalendarDaysYmd } from './booking-lifecycle-calendar';

function resolveOptionCutoffHours(listing: TourPackage, optionId: string): number {
  const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
  const opt = opts.find((o) => o.id === optionId);
  const optionCutoff = normalizeBookingCutoffHours(opt?.bookingCutoffHoursBeforeStart);
  if (optionCutoff > 0) return optionCutoff;
  return normalizeBookingCutoffHours(listing.listingExtras?.bookingCutoffHoursBeforeStart);
}

export type DayEditResult = { ok: true; message?: string } | { ok: false; error: string };

export function partnerUnifiedDayBoundsUtc(iso: string): { startMs: number; endMs: number; startIso: string; endIso: string } {
  const startIso = `${iso}T00:00:00.000Z`;
  const next = addCalendarDaysYmd(iso, 1) ?? iso;
  const endIso = `${next}T00:00:00.000Z`;
  return {
    startIso,
    endIso,
    startMs: Date.parse(startIso),
    endMs: Date.parse(endIso),
  };
}

export function partnerUnifiedTourDayIsClosed(
  caps: Array<Pick<AvailabilityRow, 'available_date' | 'capacity'>>,
  iso: string
): boolean {
  const row = caps.find((c) => c.available_date === iso);
  return row != null && Number(row.capacity) <= 0;
}

export type PartnerUnifiedTourDepartureEdit = {
  key: string;
  optionId: string;
  optionName: string;
  scheduleId: string;
  scheduleName: string;
  startTimeHm: string;
  scheduleCapacity: number;
  capacity: number;
  cutoffHours: number;
  baselineCutoffHours: number;
  occupying: number;
  remaining: number;
};

export function partnerUnifiedTourDeparturesForDay(params: {
  listing: TourPackage;
  iso: string;
  bookings: Parameters<typeof tourCheckoutOccupiedGuests>[0];
  nowMs?: number;
}): PartnerUnifiedTourDepartureEdit[] {
  const opts = materializedBookingOptions(params.listing.listingExtras?.bookingOptions);
  const deps = tourSellingDeparturesOnDate(opts, params.iso);
  const overrides = params.listing.listingExtras?.slotOverrides ?? [];
  const nowMs = params.nowMs ?? Date.now();
  return deps.map((d: TourSellingDeparture) => {
    const startTimeHm = normalizeStartTimeHm(d.startTime) || (d.startTime || '').slice(0, 5);
    const scheduleCapacity = Math.max(0, Math.floor(d.maxSpotsPerSlot));
    const override = findSlotOverride(overrides, params.iso, startTimeHm);
    const baselineCutoff = resolveOptionCutoffHours(params.listing, d.optionId);
    const capacity = resolveSlotCapacity({ scheduleCapacity, override });
    const cutoffHours = resolveSlotCutoffHours({ baselineCutoffHours: baselineCutoff, override });
    const occupying = tourCheckoutOccupiedGuests(
      params.bookings,
      params.iso,
      null,
      nowMs,
      d.startTime || null
    );
    return {
      key: `${d.optionId}-${d.scheduleId}-${startTimeHm}`,
      optionId: d.optionId,
      optionName: d.optionName,
      scheduleId: d.scheduleId,
      scheduleName: d.scheduleName,
      startTimeHm,
      scheduleCapacity,
      capacity,
      cutoffHours,
      baselineCutoffHours: baselineCutoff,
      occupying,
      remaining: Math.max(0, capacity - occupying),
    };
  });
}

export async function partnerUnifiedSetTourDayClosed(params: {
  listingId: string;
  iso: string;
  closed: boolean;
}): Promise<DayEditResult> {
  if (params.closed) {
    const res = await upsertAvailability(params.listingId, [
      { available_date: params.iso, capacity: 0 },
    ]);
    if (!res.success) return { ok: false, error: res.error ?? 'Could not close that date.' };
    return { ok: true, message: 'Date closed for new bookings.' };
  }
  const res = await deleteAvailability(params.listingId, params.iso);
  if (!res.success) return { ok: false, error: res.error ?? 'Could not reopen that date.' };
  return { ok: true, message: 'Date reopened.' };
}

/** Persist capacity/cutoff for one tour departure on a date. */
export async function partnerUnifiedSaveTourDepartureWithListing(params: {
  listing: TourPackage;
  iso: string;
  startTimeHm: string;
  capacity: number;
  cutoffHours: number;
  occupying: number;
  scheduleCapacity: number;
  baselineCutoffHours: number;
}): Promise<DayEditResult & { listing?: TourPackage }> {
  const nextSpots = Math.min(
    SLOT_OVERRIDE_CAPACITY_MAX,
    Math.max(1, Math.floor(Number(params.capacity) || 0))
  );
  if (nextSpots < params.occupying) {
    return {
      ok: false,
      error: `Cannot set capacity below ${params.occupying} confirmed guest${
        params.occupying === 1 ? '' : 's'
      }.`,
    };
  }
  const nextCutoff = Math.max(0, Math.min(168, Math.floor(Number(params.cutoffHours) || 0)));
  const hm = normalizeStartTimeHm(params.startTimeHm);
  if (!hm) return { ok: false, error: 'Invalid departure time.' };

  let overrides: ListingSlotOverride[] = [...(params.listing.listingExtras?.slotOverrides ?? [])];
  overrides = overrides.filter((o) => !(o.date === params.iso && o.startTimeHm === hm));
  const entry: ListingSlotOverride = { date: params.iso, startTimeHm: hm };
  if (nextSpots !== params.scheduleCapacity) entry.capacity = nextSpots;
  if (nextCutoff !== params.baselineCutoffHours) entry.cutoffHours = nextCutoff;
  if (entry.capacity != null || entry.cutoffHours != null) {
    overrides = upsertSlotOverride(overrides, entry);
  }

  const res = await updateListing(params.listing.id, {
    ...params.listing,
    listingExtras: {
      ...params.listing.listingExtras,
      slotOverrides: overrides,
    },
  });
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not save departure.' };
  return { ok: true, message: 'Departure updated.', listing: res.tour ?? undefined };
}

export function partnerUnifiedStayNightSummary(params: {
  listingId: string;
  iso: string;
  bookings: StayCalendarBooking[];
  caps: StayCalendarCap[];
  nowMs?: number;
}) {
  const occupying = stayCalendarOccupyingOnNight(
    params.bookings,
    params.listingId,
    params.iso,
    params.nowMs
  );
  const capacity = stayCalendarCapacityOnNight(params.caps, params.listingId, params.iso);
  const kind = stayCalendarNightKind({ occupying, capacity });
  const canBlock = stayCalendarCanBlockNight({
    bookings: params.bookings,
    listingId: params.listingId,
    iso: params.iso,
    nowMs: params.nowMs,
  });
  const canUnblock = stayCalendarCanUnblockNight({
    bookings: params.bookings,
    caps: params.caps,
    listingId: params.listingId,
    iso: params.iso,
    nowMs: params.nowMs,
  });
  const blocked = capacity != null && stayNightIsOperatorBlocked(capacity);
  return { occupying, capacity, kind, canBlock, canUnblock, blocked };
}

export async function partnerUnifiedBlockStayNight(params: {
  listingId: string;
  iso: string;
  bookings: StayCalendarBooking[];
  nowMs?: number;
}): Promise<DayEditResult> {
  if (
    !stayCalendarCanBlockNight({
      bookings: params.bookings,
      listingId: params.listingId,
      iso: params.iso,
      nowMs: params.nowMs,
    })
  ) {
    return { ok: false, error: 'This night has a confirmed reservation and cannot be blocked.' };
  }
  const res = await upsertAvailability(params.listingId, [
    { available_date: params.iso, capacity: 0 },
  ]);
  if (!res.success) return { ok: false, error: res.error ?? 'Could not block night.' };
  return { ok: true, message: 'Night blocked.' };
}

export async function partnerUnifiedUnblockStayNight(params: {
  listingId: string;
  iso: string;
  bookings: StayCalendarBooking[];
  caps: StayCalendarCap[];
  nowMs?: number;
}): Promise<DayEditResult> {
  if (
    !stayCalendarCanUnblockNight({
      bookings: params.bookings,
      caps: params.caps,
      listingId: params.listingId,
      iso: params.iso,
      nowMs: params.nowMs,
    })
  ) {
    return { ok: false, error: 'No removable block on this night.' };
  }
  const res = await deleteAvailability(params.listingId, params.iso);
  if (!res.success) return { ok: false, error: res.error ?? 'Could not unblock night.' };
  return { ok: true, message: 'Night unblocked.' };
}

export type PartnerUnifiedRentalDayVariant = {
  variantId: string;
  name: string;
  stock: number;
  available: number;
  reserved: number;
  blocked: boolean;
  /** Exact single-day block ids that can be deleted safely. */
  exactBlockIds: string[];
  /** True when a multi-day block covers this day (cannot safely unblock from unified day panel). */
  multiDayBlock: boolean;
};

export function partnerUnifiedRentalDayVariants(params: {
  listing: TourPackage;
  iso: string;
  blocks: RentalAvailabilityBlockRow[];
  holds: RentalInventoryHoldRow[];
  nowMs?: number;
}): PartnerUnifiedRentalDayVariant[] {
  const variants = rentalVariantsFromListingExtras(params.listing.listingExtras);
  const rental = rentalDetailsFromListingExtras(params.listing.listingExtras);
  const bufferMinutes = Number(rental?.bufferMinutes ?? 0);
  const bounds = partnerUnifiedDayBoundsUtc(params.iso);
  const nowMs = params.nowMs ?? Date.now();

  return variants.map((v) => {
    const preview = previewDayAvailability({
      variantId: v.id,
      stock: v.quantity,
      dayStartMs: bounds.startMs,
      dayEndMs: bounds.endMs,
      bufferMinutes,
      bookingNoticeHours: 0,
      nowMs,
      blocks: params.blocks,
      holds: params.holds,
    });

    const covering = params.blocks.filter((b) => {
      if (b.variant_id && b.variant_id !== v.id) return false;
      const startMs = Date.parse(b.starts_at);
      const endMs = Date.parse(b.ends_at);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
      return startMs < bounds.endMs && bounds.startMs < endMs;
    });

    const exactBlockIds = covering
      .filter((b) => {
        const startMs = Date.parse(b.starts_at);
        const endMs = Date.parse(b.ends_at);
        return startMs === bounds.startMs && endMs === bounds.endMs;
      })
      .map((b) => b.id);

    const multiDayBlock = covering.some((b) => {
      const startMs = Date.parse(b.starts_at);
      const endMs = Date.parse(b.ends_at);
      return !(startMs === bounds.startMs && endMs === bounds.endMs);
    });

    return {
      variantId: v.id,
      name: v.name?.trim() || 'Option',
      stock: v.quantity,
      available: preview.available,
      reserved: preview.reserved,
      blocked: preview.blocked || covering.length > 0,
      exactBlockIds,
      multiDayBlock,
    };
  });
}

export async function partnerUnifiedBlockRentalDay(params: {
  listingId: string;
  iso: string;
  variantId: string | null;
  createdBy?: string | null;
}): Promise<DayEditResult & { block?: RentalAvailabilityBlockRow }> {
  const bounds = partnerUnifiedDayBoundsUtc(params.iso);
  try {
    const block = await createRentalAvailabilityBlock({
      listingId: params.listingId,
      variantId: params.variantId,
      startsAtIso: bounds.startIso,
      endsAtIso: bounds.endIso,
      note: '',
      createdBy: params.createdBy ?? null,
    });
    return { ok: true, message: 'Date blocked.', block };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not block date.' };
  }
}

export async function partnerUnifiedUnblockRentalDay(params: {
  exactBlockIds: string[];
  multiDayBlock: boolean;
}): Promise<DayEditResult> {
  if (params.multiDayBlock && params.exactBlockIds.length === 0) {
    return {
      ok: false,
      error:
        'This date is covered by a multi-day block. Unblock it from the legacy rental calendar until day-split unblock ships.',
    };
  }
  if (params.exactBlockIds.length === 0) {
    return { ok: false, error: 'No single-day block to remove.' };
  }
  try {
    for (const id of params.exactBlockIds) {
      await deleteRentalAvailabilityBlock(id);
    }
    return { ok: true, message: 'Date unblocked.' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not unblock date.' };
  }
}

/**
 * Adjust listing-level variant stock (global inventory). Refuses below peak concurrent reserved
 * across loaded holds. Not a date-scoped inventory engine — same control as listing extras.
 */
export async function partnerUnifiedAdjustRentalStock(params: {
  listing: TourPackage;
  variantId: string;
  nextStock: number;
  holds: RentalInventoryHoldRow[];
}): Promise<DayEditResult & { listing?: TourPackage }> {
  const variants = rentalVariantsFromListingExtras(params.listing.listingExtras);
  const variant = variants.find((v) => v.id === params.variantId);
  if (!variant) return { ok: false, error: 'Option not found.' };

  const occupancies = params.holds
    .filter((h) => h.variant_id === params.variantId)
    .map((h) => {
      const startMs = Date.parse(h.starts_at);
      const endMs = Date.parse(h.ends_at);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !(endMs > startMs)) return null;
      return { variantId: h.variant_id, quantity: h.quantity, interval: { startMs, endMs } };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  let peak = 0;
  if (occupancies.length > 0) {
    const window: RentalInterval = {
      startMs: Math.min(...occupancies.map((o) => o.interval.startMs)),
      endMs: Math.max(...occupancies.map((o) => o.interval.endMs)),
    };
    peak = maxConcurrentReservedQuantity(params.variantId, window, occupancies);
  }
  const next = Math.max(0, Math.floor(Number(params.nextStock) || 0));
  if (next < peak) {
    return {
      ok: false,
      error: `Cannot set stock below ${peak} overlapping reserved unit${peak === 1 ? '' : 's'}.`,
    };
  }
  if (next < 1) {
    return { ok: false, error: 'Stock must be at least 1, or remove the option from the listing.' };
  }

  const rental = rentalDetailsFromListingExtras(params.listing.listingExtras);
  if (!rental) return { ok: false, error: 'Rental configuration missing.' };
  const nextVariants = variants.map((v) =>
    v.id === params.variantId ? { ...v, quantity: next } : v
  );
  const res = await updateListing(params.listing.id, {
    ...params.listing,
    listingExtras: {
      ...params.listing.listingExtras,
      rental: { ...rental, variants: nextVariants },
    },
  });
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not update stock.' };
  return { ok: true, message: 'Stock updated.', listing: res.tour ?? undefined };
}

export function partnerUnifiedListingFamily(
  listing: TourPackage
): 'tour' | 'stay' | 'rental' {
  const f = inventoryFamilyFromListing(listing);
  if (f === 'stay') return 'stay';
  if (f === 'rental') return 'rental';
  return 'tour';
}

/** Unsupported as a dedicated backend action — document for Mission reports. */
export const PARTNER_UNIFIED_UNSUPPORTED_ACTIONS = {
  tourPerDepartureClose:
    'Tours close/reopen only as a whole day (listing_availability capacity 0). Per-departure close is not a separate write path; use capacity/cutoff or day close.',
  rentalMultiDayUnblockSplit:
    'Unblocking a date covered only by a multi-day rental block requires split/replace logic not yet in the unified day panel.',
} as const;
