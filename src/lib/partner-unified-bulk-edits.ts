/**
 * Mission 05.4 — Bulk availability edits for the Unified Partner Calendar.
 * Reuses listing_availability, slotOverrides, and rental block APIs (no second engine).
 */

import {
  deleteAvailability,
  deleteAvailabilityRange,
  upsertAvailability,
} from '../data/supabase-availability';
import { updateListing } from '../data/supabase-listings';
import {
  createRentalAvailabilityBlock,
  deleteRentalAvailabilityBlock,
  fetchRentalAvailabilityBlocks,
  fetchRentalInventoryHolds,
  rentalDetailsFromListingExtras,
  rentalVariantsFromListingExtras,
  type RentalAvailabilityBlockRow,
} from '../data/supabase-rental-availability';
import { tourCheckoutOccupiedGuests } from './booking-hold';
import { inventoryFamilyFromListing } from './inventory';
import {
  normalizeStartTimeHm,
  SLOT_OVERRIDE_CAPACITY_MAX,
  upsertSlotOverride,
  type ListingSlotOverride,
} from './listing-slot-overrides';
import { tourSellingDeparturesOnDate } from './listing-option-schedules';
import { maxConcurrentReservedQuantity, type RentalInterval } from './rental-availability';
import {
  stayCalendarCanBlockNight,
  stayCalendarCanUnblockNight,
  type StayCalendarBooking,
  type StayCalendarCap,
} from './stay-calendar-workspace';
import { materializedBookingOptions } from '../types/listingExtras';
import type { TourPackage } from '../types/tour';
import { enumerateIsoDates } from '../pages/supplier/calendarAvailabilityUi';
import { addCalendarDaysYmd } from './booking-lifecycle-calendar';
import { partnerUnifiedDayBoundsUtc } from './partner-unified-day-edits';

export type PartnerUnifiedBulkFamily = 'tour' | 'stay' | 'rental';

export type PartnerUnifiedBulkTourAction =
  | 'close'
  | 'reopen'
  | 'change_capacity'
  | 'change_cutoff';

export type PartnerUnifiedBulkStayAction = 'block' | 'unblock';

export type PartnerUnifiedBulkRentalAction = 'block' | 'unblock' | 'adjust_stock';

export type PartnerUnifiedBulkAction =
  | PartnerUnifiedBulkTourAction
  | PartnerUnifiedBulkStayAction
  | PartnerUnifiedBulkRentalAction;

export type BulkPreviewSkip = { iso: string; reason: string };

export type BulkPreview = {
  family: PartnerUnifiedBulkFamily;
  action: PartnerUnifiedBulkAction;
  dates: string[];
  applyDates: string[];
  skipped: BulkPreviewSkip[];
  warnings: string[];
  departureTouchCount: number;
  summary: string;
  canApply: boolean;
  blockReason?: string;
};

export type BulkApplyResult = {
  ok: boolean;
  message: string;
  succeeded: number;
  skipped: BulkPreviewSkip[];
  failed: Array<{ iso?: string; error: string }>;
  listing?: TourPackage;
};

const ALL_WEEKDAYS = [true, true, true, true, true, true, true];

export function partnerUnifiedBulkFamilyFromListing(
  listing: TourPackage
): PartnerUnifiedBulkFamily {
  const f = inventoryFamilyFromListing(listing);
  if (f === 'stay') return 'stay';
  if (f === 'rental') return 'rental';
  return 'tour';
}

export function partnerUnifiedBulkActionsForFamily(
  family: PartnerUnifiedBulkFamily
): Array<{ value: PartnerUnifiedBulkAction; label: string }> {
  if (family === 'stay') {
    return [
      { value: 'block', label: 'Block nights' },
      { value: 'unblock', label: 'Unblock nights' },
    ];
  }
  if (family === 'rental') {
    return [
      { value: 'block', label: 'Block dates' },
      { value: 'unblock', label: 'Unblock dates' },
      { value: 'adjust_stock', label: 'Adjust option stock' },
    ];
  }
  return [
    { value: 'close', label: 'Close dates' },
    { value: 'reopen', label: 'Reopen dates' },
    { value: 'change_capacity', label: 'Change capacity' },
    { value: 'change_cutoff', label: 'Change booking cutoff' },
  ];
}

export function partnerUnifiedBulkTourOptionChoices(listing: TourPackage): Array<{
  value: string;
  label: string;
}> {
  const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
  return opts.map((o) => ({
    value: o.id,
    label: (o.name ?? '').trim() || 'Option',
  }));
}

function countTourDepartures(
  listing: TourPackage,
  dates: string[],
  optionId: string | null
): number {
  const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
  let n = 0;
  for (const iso of dates) {
    const deps = tourSellingDeparturesOnDate(opts, iso).filter(
      (d) => !optionId || d.optionId === optionId
    );
    n += deps.length;
  }
  return n;
}

export function previewPartnerUnifiedBulk(params: {
  listing: TourPackage;
  action: PartnerUnifiedBulkAction;
  fromIso: string;
  toIso: string;
  optionId: string | null;
  capacity?: number;
  cutoffHours?: number;
  stock?: number;
  bookings: StayCalendarBooking[];
  caps?: StayCalendarCap[];
  nowMs?: number;
}): BulkPreview {
  const family = partnerUnifiedBulkFamilyFromListing(params.listing);
  const dates = enumerateIsoDates(params.fromIso, params.toIso, ALL_WEEKDAYS);
  const skipped: BulkPreviewSkip[] = [];
  const warnings: string[] = [];
  let applyDates = [...dates];
  let departureTouchCount = 0;
  let canApply = true;
  let blockReason: string | undefined;

  if (!params.fromIso || !params.toIso || params.fromIso > params.toIso) {
    return {
      family,
      action: params.action,
      dates: [],
      applyDates: [],
      skipped: [],
      warnings: [],
      departureTouchCount: 0,
      summary: 'Pick a valid From / To range.',
      canApply: false,
      blockReason: 'Pick a valid From / To range.',
    };
  }

  if (dates.length === 0) {
    return {
      family,
      action: params.action,
      dates: [],
      applyDates: [],
      skipped: [],
      warnings: [],
      departureTouchCount: 0,
      summary: 'No dates in range.',
      canApply: false,
      blockReason: 'No dates in range.',
    };
  }

  if (family === 'tour') {
    if (
      (params.action === 'close' || params.action === 'reopen') &&
      params.optionId
    ) {
      canApply = false;
      blockReason =
        'Day close/reopen applies to the whole listing day. Select All options, or use Change capacity for a single option.';
    }
    if (params.action === 'change_capacity' || params.action === 'change_cutoff') {
      departureTouchCount = countTourDepartures(params.listing, dates, params.optionId);
      if (departureTouchCount === 0) {
        canApply = false;
        blockReason = 'No scheduled departures for that option in the selected dates.';
      }
      if (params.action === 'change_capacity') {
        const capacity = Math.floor(Number(params.capacity));
        if (!Number.isFinite(capacity) || capacity < 1 || capacity > SLOT_OVERRIDE_CAPACITY_MAX) {
          canApply = false;
          blockReason = `Enter capacity between 1 and ${SLOT_OVERRIDE_CAPACITY_MAX}.`;
        }
      }
      if (params.action === 'change_cutoff') {
        const cutoff = Math.floor(Number(params.cutoffHours));
        if (!Number.isFinite(cutoff) || cutoff < 0 || cutoff > 168) {
          canApply = false;
          blockReason = 'Select a valid booking cutoff.';
        }
      }
    }
    if (params.action === 'close') {
      warnings.push('Closing dates stops new bookings for the whole day (all departures).');
    }
  }

  if (family === 'stay') {
    const nowMs = params.nowMs ?? Date.now();
    const caps = params.caps ?? [];
    if (params.action === 'block') {
      applyDates = [];
      for (const iso of dates) {
        if (
          stayCalendarCanBlockNight({
            bookings: params.bookings,
            listingId: params.listing.id,
            iso,
            nowMs,
          })
        ) {
          applyDates.push(iso);
        } else {
          skipped.push({ iso, reason: 'Occupied by a confirmed reservation' });
        }
      }
      if (applyDates.length === 0) {
        canApply = false;
        blockReason = 'No nights can be blocked — all selected nights are occupied.';
      }
    } else if (params.action === 'unblock') {
      applyDates = [];
      for (const iso of dates) {
        if (
          stayCalendarCanUnblockNight({
            bookings: params.bookings,
            caps,
            listingId: params.listing.id,
            iso,
            nowMs,
          })
        ) {
          applyDates.push(iso);
        } else {
          skipped.push({
            iso,
            reason: 'Not a removable block (available or occupied)',
          });
        }
      }
      if (applyDates.length === 0) {
        canApply = false;
        blockReason = 'No removable blocks in that range.';
      }
    } else {
      canApply = false;
      blockReason = 'Unsupported stay action.';
    }
  }

  if (family === 'rental') {
    if (params.action === 'adjust_stock') {
      applyDates = [];
      const stock = Math.floor(Number(params.stock));
      if (!params.optionId) {
        canApply = false;
        blockReason = 'Select a rental option to adjust stock.';
      } else if (!Number.isFinite(stock) || stock < 1) {
        canApply = false;
        blockReason = 'Stock must be at least 1.';
      } else {
        warnings.push('Stock is listing-level inventory, not a date-range setting.');
      }
    } else if (params.action === 'block') {
      warnings.push(
        params.optionId
          ? 'Creates one block covering the full range for the selected option.'
          : 'Creates one block covering the full range for all options.'
      );
    } else if (params.action === 'unblock') {
      warnings.push(
        'Only exact single-day blocks (or one exact full-range block) can be removed. Multi-day overlaps outside the range are left untouched.'
      );
    }
  }

  const summary = buildPreviewSummary({
    family,
    action: params.action,
    applyCount: family === 'rental' && params.action === 'adjust_stock' ? 0 : applyDates.length,
    dateCount: dates.length,
    skipped: skipped.length,
    departureTouchCount,
    optionId: params.optionId,
    capacity: params.capacity,
    cutoffHours: params.cutoffHours,
    stock: params.stock,
  });

  if (canApply) {
    if (family === 'rental' && params.action === 'adjust_stock') {
      canApply = Boolean(params.optionId) && Math.floor(Number(params.stock)) >= 1;
    } else if (family === 'tour' && (params.action === 'change_capacity' || params.action === 'change_cutoff')) {
      canApply = departureTouchCount > 0 && !blockReason;
    } else if (family === 'tour') {
      canApply = dates.length > 0 && !params.optionId;
    } else {
      canApply = applyDates.length > 0;
    }
  }

  return {
    family,
    action: params.action,
    dates,
    applyDates,
    skipped,
    warnings,
    departureTouchCount,
    summary,
    canApply,
    blockReason,
  };
}

function buildPreviewSummary(params: {
  family: PartnerUnifiedBulkFamily;
  action: PartnerUnifiedBulkAction;
  applyCount: number;
  dateCount: number;
  skipped: number;
  departureTouchCount: number;
  optionId: string | null;
  capacity?: number;
  cutoffHours?: number;
  stock?: number;
}): string {
  const skipBit = params.skipped ? ` · ${params.skipped} skipped` : '';
  if (params.family === 'tour') {
    if (params.action === 'close') return `Close ${params.dateCount} date${params.dateCount === 1 ? '' : 's'}${skipBit}`;
    if (params.action === 'reopen') return `Reopen ${params.dateCount} date${params.dateCount === 1 ? '' : 's'}${skipBit}`;
    if (params.action === 'change_capacity') {
      return `Set capacity ${params.capacity ?? '—'} on ${params.departureTouchCount} departure${
        params.departureTouchCount === 1 ? '' : 's'
      } across ${params.dateCount} date${params.dateCount === 1 ? '' : 's'}`;
    }
    return `Set cutoff on ${params.departureTouchCount} departure${
      params.departureTouchCount === 1 ? '' : 's'
    } across ${params.dateCount} date${params.dateCount === 1 ? '' : 's'}`;
  }
  if (params.family === 'stay') {
    return `${params.action === 'block' ? 'Block' : 'Unblock'} ${params.applyCount} night${
      params.applyCount === 1 ? '' : 's'
    }${skipBit}`;
  }
  if (params.action === 'adjust_stock') {
    return `Set stock to ${params.stock ?? '—'} for selected option`;
  }
  return `${params.action === 'block' ? 'Block' : 'Unblock'} ${params.dateCount} date${
    params.dateCount === 1 ? '' : 's'
  }`;
}

export async function applyPartnerUnifiedBulk(params: {
  listing: TourPackage;
  action: PartnerUnifiedBulkAction;
  fromIso: string;
  toIso: string;
  optionId: string | null;
  capacity?: number;
  cutoffHours?: number;
  stock?: number;
  bookings: StayCalendarBooking[];
  caps?: StayCalendarCap[];
  createdBy?: string | null;
  nowMs?: number;
}): Promise<BulkApplyResult> {
  const preview = previewPartnerUnifiedBulk(params);
  if (!preview.canApply) {
    return {
      ok: false,
      message: preview.blockReason ?? 'Cannot apply bulk edit.',
      succeeded: 0,
      skipped: preview.skipped,
      failed: [{ error: preview.blockReason ?? 'Cannot apply' }],
    };
  }

  const family = preview.family;
  const failed: BulkApplyResult['failed'] = [];
  const skipped = [...preview.skipped];
  let succeeded = 0;
  let listing = params.listing;

  if (family === 'tour') {
    if (params.action === 'close') {
      const res = await upsertAvailability(
        listing.id,
        preview.dates.map((available_date) => ({ available_date, capacity: 0 }))
      );
      if (!res.success) {
        return {
          ok: false,
          message: res.error ?? 'Could not close dates.',
          succeeded: 0,
          skipped,
          failed: [{ error: res.error ?? 'Could not close dates.' }],
        };
      }
      succeeded = preview.dates.length;
      return {
        ok: true,
        message: `Closed ${succeeded} date${succeeded === 1 ? '' : 's'}.`,
        succeeded,
        skipped,
        failed,
      };
    }
    if (params.action === 'reopen') {
      const res = await deleteAvailabilityRange(listing.id, preview.dates);
      if (!res.success) {
        return {
          ok: false,
          message: res.error ?? 'Could not reopen dates.',
          succeeded: 0,
          skipped,
          failed: [{ error: res.error ?? 'Could not reopen dates.' }],
        };
      }
      succeeded = preview.dates.length;
      return {
        ok: true,
        message: `Reopened ${succeeded} date${succeeded === 1 ? '' : 's'}.`,
        succeeded,
        skipped,
        failed,
      };
    }

    const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
    let overrides: ListingSlotOverride[] = [...(listing.listingExtras?.slotOverrides ?? [])];
    const nowMs = params.nowMs ?? Date.now();
    let touched = 0;

    if (params.action === 'change_capacity') {
      const capacity = Math.min(
        SLOT_OVERRIDE_CAPACITY_MAX,
        Math.max(1, Math.floor(Number(params.capacity) || 0))
      );
      for (const iso of preview.dates) {
        const deps = tourSellingDeparturesOnDate(opts, iso).filter(
          (d) => !params.optionId || d.optionId === params.optionId
        );
        for (const d of deps) {
          const occupying = tourCheckoutOccupiedGuests(
            params.bookings,
            iso,
            null,
            nowMs,
            d.startTime || null
          );
          if (capacity < occupying) {
            failed.push({
              iso,
              error: `Capacity ${capacity} below ${occupying} booked on ${iso} (${d.optionName}).`,
            });
            continue;
          }
          const hm = normalizeStartTimeHm(d.startTime) || (d.startTime || '').slice(0, 5);
          overrides = upsertSlotOverride(overrides, {
            date: iso,
            startTimeHm: hm,
            capacity,
          });
          touched += 1;
        }
      }
    } else if (params.action === 'change_cutoff') {
      const cutoffHours = Math.max(0, Math.min(168, Math.floor(Number(params.cutoffHours) || 0)));
      for (const iso of preview.dates) {
        const deps = tourSellingDeparturesOnDate(opts, iso).filter(
          (d) => !params.optionId || d.optionId === params.optionId
        );
        for (const d of deps) {
          const hm = normalizeStartTimeHm(d.startTime) || (d.startTime || '').slice(0, 5);
          overrides = upsertSlotOverride(overrides, {
            date: iso,
            startTimeHm: hm,
            cutoffHours,
          });
          touched += 1;
        }
      }
    }

    if (touched === 0 && failed.length === 0) {
      return {
        ok: false,
        message: 'No departures updated.',
        succeeded: 0,
        skipped,
        failed: [{ error: 'No departures updated.' }],
      };
    }
    if (touched === 0 && failed.length > 0) {
      return {
        ok: false,
        message: `No departures updated. ${failed.length} conflict${failed.length === 1 ? '' : 's'}.`,
        succeeded: 0,
        skipped,
        failed,
      };
    }

    const res = await updateListing(listing.id, {
      ...listing,
      listingExtras: { ...listing.listingExtras, slotOverrides: overrides },
    });
    if (!res.ok) {
      return {
        ok: false,
        message: res.error ?? 'Could not save overrides.',
        succeeded: 0,
        skipped,
        failed: [{ error: res.error ?? 'Could not save overrides.' }],
      };
    }
    listing = res.tour ?? listing;
    succeeded = touched;
    const failBit =
      failed.length > 0
        ? ` ${failed.length} departure${failed.length === 1 ? '' : 's'} skipped due to bookings.`
        : '';
    return {
      ok: failed.length === 0,
      message: `Updated ${succeeded} departure override${succeeded === 1 ? '' : 's'}.${failBit}`,
      succeeded,
      skipped,
      failed,
      listing,
    };
  }

  if (family === 'stay') {
    if (params.action === 'block') {
      // Revalidate at write time
      const nowMs = params.nowMs ?? Date.now();
      const allowed: string[] = [];
      for (const iso of preview.applyDates) {
        if (
          stayCalendarCanBlockNight({
            bookings: params.bookings,
            listingId: listing.id,
            iso,
            nowMs,
          })
        ) {
          allowed.push(iso);
        } else {
          skipped.push({ iso, reason: 'Became occupied before save' });
        }
      }
      if (allowed.length === 0) {
        return {
          ok: false,
          message: 'No nights blocked — conflicts remaining.',
          succeeded: 0,
          skipped,
          failed: [{ error: 'No nights blocked.' }],
        };
      }
      const res = await upsertAvailability(
        listing.id,
        allowed.map((available_date) => ({ available_date, capacity: 0 }))
      );
      if (!res.success) {
        return {
          ok: false,
          message: res.error ?? 'Could not block nights.',
          succeeded: 0,
          skipped,
          failed: [{ error: res.error ?? 'Could not block nights.' }],
        };
      }
      return {
        ok: true,
        message: `Blocked ${allowed.length} night${allowed.length === 1 ? '' : 's'}${
          skipped.length ? ` · ${skipped.length} skipped` : ''
        }.`,
        succeeded: allowed.length,
        skipped,
        failed,
      };
    }

    // unblock — per-date delete so partial failures are accurate
    const nowMs = params.nowMs ?? Date.now();
    const caps = params.caps ?? [];
    for (const iso of preview.applyDates) {
      if (
        !stayCalendarCanUnblockNight({
          bookings: params.bookings,
          caps,
          listingId: listing.id,
          iso,
          nowMs,
        })
      ) {
        skipped.push({ iso, reason: 'No longer a removable block' });
        continue;
      }
      const res = await deleteAvailability(listing.id, iso);
      if (!res.success) {
        failed.push({ iso, error: res.error ?? 'Delete failed' });
      } else {
        succeeded += 1;
      }
    }
    const ok = failed.length === 0 && succeeded > 0;
    return {
      ok,
      message:
        succeeded === 0
          ? 'No nights unblocked.'
          : `Unblocked ${succeeded} night${succeeded === 1 ? '' : 's'}${
              failed.length ? ` · ${failed.length} failed` : ''
            }${skipped.length ? ` · ${skipped.length} skipped` : ''}.`,
      succeeded,
      skipped,
      failed,
    };
  }

  // rental
  if (params.action === 'adjust_stock') {
    const variantId = params.optionId;
    if (!variantId) {
      return {
        ok: false,
        message: 'Select a rental option.',
        succeeded: 0,
        skipped,
        failed: [{ error: 'Select a rental option.' }],
      };
    }
    const bounds = partnerUnifiedDayBoundsUtc(params.fromIso);
    const endBounds = partnerUnifiedDayBoundsUtc(params.toIso);
    const holds = await fetchRentalInventoryHolds(
      listing.id,
      bounds.startIso,
      endBounds.endIso
    );
    const variants = rentalVariantsFromListingExtras(listing.listingExtras);
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) {
      return {
        ok: false,
        message: 'Option not found.',
        succeeded: 0,
        skipped,
        failed: [{ error: 'Option not found.' }],
      };
    }
    const occupancies = holds
      .filter((h) => h.variant_id === variantId)
      .map((h) => {
        const startMs = Date.parse(h.starts_at);
        const endMs = Date.parse(h.ends_at);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !(endMs > startMs)) return null;
        return { variantId, quantity: h.quantity, interval: { startMs, endMs } };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    let peak = 0;
    if (occupancies.length > 0) {
      const window: RentalInterval = {
        startMs: Math.min(...occupancies.map((o) => o.interval.startMs)),
        endMs: Math.max(...occupancies.map((o) => o.interval.endMs)),
      };
      peak = maxConcurrentReservedQuantity(variantId, window, occupancies);
    }
    const next = Math.max(1, Math.floor(Number(params.stock) || 0));
    if (next < peak) {
      return {
        ok: false,
        message: `Cannot set stock below ${peak} overlapping reserved unit${peak === 1 ? '' : 's'}.`,
        succeeded: 0,
        skipped,
        failed: [{ error: `Stock below ${peak} reserved.` }],
      };
    }
    const rental = rentalDetailsFromListingExtras(listing.listingExtras);
    if (!rental) {
      return {
        ok: false,
        message: 'Rental configuration missing.',
        succeeded: 0,
        skipped,
        failed: [{ error: 'Rental configuration missing.' }],
      };
    }
    const res = await updateListing(listing.id, {
      ...listing,
      listingExtras: {
        ...listing.listingExtras,
        rental: {
          ...rental,
          variants: variants.map((v) => (v.id === variantId ? { ...v, quantity: next } : v)),
        },
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        message: res.error ?? 'Could not update stock.',
        succeeded: 0,
        skipped,
        failed: [{ error: res.error ?? 'Could not update stock.' }],
      };
    }
    return {
      ok: true,
      message: `Stock set to ${next}.`,
      succeeded: 1,
      skipped,
      failed,
      listing: res.tour ?? undefined,
    };
  }

  if (params.action === 'block') {
    const start = partnerUnifiedDayBoundsUtc(params.fromIso);
    const endExclusive = addCalendarDaysYmd(params.toIso, 1);
    if (!endExclusive) {
      return {
        ok: false,
        message: 'Invalid end date.',
        succeeded: 0,
        skipped,
        failed: [{ error: 'Invalid end date.' }],
      };
    }
    try {
      await createRentalAvailabilityBlock({
        listingId: listing.id,
        variantId: params.optionId,
        startsAtIso: start.startIso,
        endsAtIso: `${endExclusive}T00:00:00.000Z`,
        note: '',
        createdBy: params.createdBy ?? null,
      });
      return {
        ok: true,
        message: `Blocked ${preview.dates.length} date${preview.dates.length === 1 ? '' : 's'}.`,
        succeeded: preview.dates.length,
        skipped,
        failed,
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Could not create block.',
        succeeded: 0,
        skipped,
        failed: [{ error: e instanceof Error ? e.message : 'Could not create block.' }],
      };
    }
  }

  // rental unblock
  const start = partnerUnifiedDayBoundsUtc(params.fromIso);
  const endExclusiveYmd = addCalendarDaysYmd(params.toIso, 1);
  if (!endExclusiveYmd) {
    return {
      ok: false,
      message: 'Invalid end date.',
      succeeded: 0,
      skipped,
      failed: [{ error: 'Invalid end date.' }],
    };
  }
  const rangeEndIso = `${endExclusiveYmd}T00:00:00.000Z`;
  const blocks = await fetchRentalAvailabilityBlocks(listing.id, start.startIso, rangeEndIso);
  const rangeStartMs = start.startMs;
  const rangeEndMs = Date.parse(rangeEndIso);

  const toDelete: string[] = [];
  const exactRange = blocks.filter((b) => {
    if (params.optionId && b.variant_id && b.variant_id !== params.optionId) return false;
    if (params.optionId && b.variant_id == null) return false; // all-options block when filtering one option: skip
    const s = Date.parse(b.starts_at);
    const e = Date.parse(b.ends_at);
    return s === rangeStartMs && e === rangeEndMs;
  });
  for (const b of exactRange) toDelete.push(b.id);

  for (const iso of preview.dates) {
    const day = partnerUnifiedDayBoundsUtc(iso);
    const covering = blocks.filter((b) => {
      if (params.optionId) {
        if (b.variant_id && b.variant_id !== params.optionId) return false;
        if (b.variant_id == null) return true; // all-options block covers this option
      } else if (b.variant_id) {
        // when unblocking all, include variant-specific too
      }
      const s = Date.parse(b.starts_at);
      const e = Date.parse(b.ends_at);
      return s < day.endMs && day.startMs < e;
    });
    const exactDay = covering.filter((b) => {
      const s = Date.parse(b.starts_at);
      const e = Date.parse(b.ends_at);
      return s === day.startMs && e === day.endMs;
    });
    if (exactDay.length > 0) {
      for (const b of exactDay) {
        if (!toDelete.includes(b.id)) toDelete.push(b.id);
      }
      continue;
    }
    const multi = covering.filter((b) => {
      const s = Date.parse(b.starts_at);
      const e = Date.parse(b.ends_at);
      return !(s === day.startMs && e === day.endMs) && !(s === rangeStartMs && e === rangeEndMs);
    });
    if (multi.length > 0) {
      skipped.push({
        iso,
        reason: 'Covered by a multi-day block that extends outside a safe delete',
      });
    }
  }

  if (toDelete.length === 0) {
    return {
      ok: false,
      message:
        skipped.length > 0
          ? 'No safe blocks to remove. Multi-day overlaps require the legacy rental calendar until split unblock ships.'
          : 'No blocks found in that range.',
      succeeded: 0,
      skipped,
      failed: [
        {
          error:
            skipped.length > 0
              ? 'Partial unblock not supported for multi-day covering blocks.'
              : 'No blocks found.',
        },
      ],
    };
  }

  for (const id of toDelete) {
    try {
      await deleteRentalAvailabilityBlock(id);
      succeeded += 1;
    } catch (e) {
      failed.push({
        error: e instanceof Error ? e.message : 'Delete failed',
      });
    }
  }

  return {
    ok: failed.length === 0 && succeeded > 0,
    message: `Removed ${succeeded} block${succeeded === 1 ? '' : 's'}${
      skipped.length ? ` · ${skipped.length} dates left covered by multi-day blocks` : ''
    }${failed.length ? ` · ${failed.length} failed` : ''}.`,
    succeeded,
    skipped,
    failed,
  };
}

/** Pure helper for tests: classify rental blocks for a range. */
export function classifyRentalBlocksForUnblock(params: {
  blocks: RentalAvailabilityBlockRow[];
  fromIso: string;
  toIso: string;
  optionId: string | null;
}): { deletableIds: string[]; skippedDates: string[] } {
  const start = partnerUnifiedDayBoundsUtc(params.fromIso);
  const endExclusiveYmd = addCalendarDaysYmd(params.toIso, 1);
  if (!endExclusiveYmd) return { deletableIds: [], skippedDates: [] };
  const rangeEndMs = Date.parse(`${endExclusiveYmd}T00:00:00.000Z`);
  const rangeStartMs = start.startMs;
  const dates = enumerateIsoDates(params.fromIso, params.toIso, ALL_WEEKDAYS);
  const deletableIds: string[] = [];
  const skippedDates: string[] = [];

  for (const b of params.blocks) {
    if (params.optionId && b.variant_id && b.variant_id !== params.optionId) continue;
    const s = Date.parse(b.starts_at);
    const e = Date.parse(b.ends_at);
    if (s === rangeStartMs && e === rangeEndMs) {
      deletableIds.push(b.id);
    }
  }

  for (const iso of dates) {
    const day = partnerUnifiedDayBoundsUtc(iso);
    const covering = params.blocks.filter((b) => {
      if (params.optionId && b.variant_id && b.variant_id !== params.optionId) return false;
      const s = Date.parse(b.starts_at);
      const e = Date.parse(b.ends_at);
      return s < day.endMs && day.startMs < e;
    });
    const exact = covering.some((b) => {
      const s = Date.parse(b.starts_at);
      const e = Date.parse(b.ends_at);
      return s === day.startMs && e === day.endMs;
    });
    if (exact) {
      for (const b of covering) {
        const s = Date.parse(b.starts_at);
        const e = Date.parse(b.ends_at);
        if (s === day.startMs && e === day.endMs && !deletableIds.includes(b.id)) {
          deletableIds.push(b.id);
        }
      }
      continue;
    }
    const multi = covering.some((b) => {
      const s = Date.parse(b.starts_at);
      const e = Date.parse(b.ends_at);
      return !(s === rangeStartMs && e === rangeEndMs);
    });
    if (multi) skippedDates.push(iso);
  }

  return { deletableIds, skippedDates };
}
