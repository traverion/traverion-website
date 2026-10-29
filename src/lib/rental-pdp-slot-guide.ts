/**
 * Inventory-aware pickup/return slot guidance for the rental PDP.
 * Uses the same evaluateRentalAvailability math as SQL (buffer after return,
 * notice, blocks, stock). Does not create unpaid holds — preview only.
 */

import type { RentalDetails, RentalVariant } from '../types/rental';
import { effectiveVariantDurationLimits } from './rental-details';
import {
  evaluateRentalAvailability,
  type RentalInterval,
  type RentalStockOccupancy,
} from './rental-availability';
import {
  addDaysYmd,
  buildRentalInterval,
  normalizeHm,
  rentalDayTimeOptions,
  rentalPickupDayExhausted,
} from './rental-booking-interval';
import { rentalDurationWithinLimits } from './rental-quote';

export type RentalPublicOccupancyWindow = {
  variantId: string | null;
  quantity: number;
  startsAt: string;
  endsAt: string;
};

export type RentalPublicBlockWindow = {
  variantId: string | null;
  startsAt: string;
  endsAt: string;
};

export type RentalPdpOccupancySnapshot = {
  bufferMinutes: number;
  occupancies: RentalPublicOccupancyWindow[];
  blocks: RentalPublicBlockWindow[];
};

function toInterval(startsAt: string, endsAt: string): RentalInterval | null {
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startMs, endMs };
}

export function occupancyToStockRows(
  snapshot: RentalPdpOccupancySnapshot | null | undefined,
  variantId: string
): { occupancies: RentalStockOccupancy[]; blocks: RentalInterval[]; bufferMinutes: number } {
  const bufferMinutes = Math.max(0, Math.round(snapshot?.bufferMinutes ?? 0));
  const occupancies: RentalStockOccupancy[] = [];
  for (const row of snapshot?.occupancies ?? []) {
    if (row.variantId !== variantId) continue;
    const interval = toInterval(row.startsAt, row.endsAt);
    if (!interval) continue;
    occupancies.push({
      variantId,
      quantity: Math.max(0, Math.floor(row.quantity)),
      interval,
    });
  }
  const blocks: RentalInterval[] = [];
  for (const row of snapshot?.blocks ?? []) {
    if (row.variantId && row.variantId !== variantId) continue;
    const interval = toInterval(row.startsAt, row.endsAt);
    if (interval) blocks.push(interval);
  }
  return { occupancies, blocks, bufferMinutes };
}

/** Default return for probing a pickup: minimum legal duration at open return hours. */
export function defaultReturnForPickupProbe(input: {
  rental: RentalDetails;
  variant: RentalVariant;
  startDate: string;
  pickupHm: string;
  durationUnit: 'hour' | 'day';
  timeZone?: string | null;
}): { endDate: string; returnHm: string } | null {
  const { rental, variant, startDate, pickupHm, durationUnit, timeZone } = input;
  const { min } = effectiveVariantDurationLimits(rental, variant, durationUnit);
  if (durationUnit === 'hour') {
    const endDate = startDate;
    // Prefer latest same-day return slot that satisfies min hours; fall back to +min hours clock.
    const returnOptions = rentalDayTimeOptions({
      operatingDays: rental.operatingDays,
      ymd: endDate,
      kind: 'return',
      stepMinutes: 30,
      afterHmExclusive: pickupHm,
      timeZone,
    });
    for (const returnHm of returnOptions) {
      const built = buildRentalInterval({
        startDate,
        endDate,
        pickupHm,
        returnHm,
        durationUnit: 'hour',
        timeZone,
      });
      if (!built.ok) continue;
      if (!rentalDurationWithinLimits(rental, 'hour', built.durationCount, variant)) {
        return { endDate, returnHm };
      }
    }
    // No same-day return long enough — extend to next open return day at earliest return.
    let probeDate = addDaysYmd(startDate, 1);
    for (let i = 0; i < 14; i++) {
      const opts = rentalDayTimeOptions({
        operatingDays: rental.operatingDays,
        ymd: probeDate,
        kind: 'return',
        stepMinutes: 30,
        timeZone,
      });
      if (opts.length) {
        const returnHm = opts[opts.length - 1]!;
        return { endDate: probeDate, returnHm };
      }
      probeDate = addDaysYmd(probeDate, 1);
    }
    return null;
  }

  const endDate = min <= 1 ? startDate : addDaysYmd(startDate, Math.max(1, min));
  const returnOptions = rentalDayTimeOptions({
    operatingDays: rental.operatingDays,
    ymd: endDate,
    kind: 'return',
    stepMinutes: 30,
    afterHmExclusive: endDate === startDate ? pickupHm : null,
    timeZone,
  });
  if (!returnOptions.length) return null;
  return { endDate, returnHm: returnOptions[returnOptions.length - 1]! };
}

export function evaluateSelectionAgainstOccupancy(input: {
  rental: RentalDetails;
  variant: RentalVariant;
  quantity: number;
  startDate: string;
  endDate: string;
  pickupHm: string;
  returnHm: string;
  durationUnit: 'hour' | 'day';
  timeZone?: string | null;
  nowMs: number;
  snapshot: RentalPdpOccupancySnapshot | null | undefined;
}): { ok: true; available: number } | { ok: false; error: string; available?: number } {
  const built = buildRentalInterval({
    startDate: input.startDate,
    endDate: input.endDate,
    pickupHm: input.pickupHm,
    returnHm: input.returnHm,
    durationUnit: input.durationUnit,
    timeZone: input.timeZone,
  });
  if (!built.ok) return { ok: false, error: built.error };
  const limitsErr = rentalDurationWithinLimits(
    input.rental,
    built.durationUnit,
    built.durationCount,
    input.variant
  );
  if (limitsErr) return { ok: false, error: limitsErr };

  const { occupancies, blocks, bufferMinutes } = occupancyToStockRows(
    input.snapshot,
    input.variant.id
  );
  const stock = Math.max(1, Math.floor(input.variant.quantity ?? 1));
  const result = evaluateRentalAvailability({
    variantId: input.variant.id,
    stock,
    requestedQty: Math.max(1, Math.floor(input.quantity)),
    pickupReturn: {
      startMs: Date.parse(built.pickupAt),
      endMs: Date.parse(built.returnAt),
    },
    bufferMinutes,
    bookingNoticeHours: input.rental.bookingNoticeHours ?? 0,
    nowMs: input.nowMs,
    blocks,
    occupancies,
  });
  if (!result.ok) {
    return { ok: false, error: result.error, available: result.available };
  }
  return { ok: true, available: result.available };
}

/** Pickup HH:MM values that can host at least one valid min-duration rental. */
export function filterValidPickupTimes(input: {
  rental: RentalDetails;
  variant: RentalVariant;
  quantity: number;
  startDate: string;
  durationUnit: 'hour' | 'day';
  timeZone?: string | null;
  nowMs: number;
  snapshot: RentalPdpOccupancySnapshot | null | undefined;
  candidatePickupHms: string[];
  /** Prefer this return when still valid; else probe default. */
  preferredEndDate?: string;
  preferredReturnHm?: string;
}): string[] {
  const valid: string[] = [];
  for (const pickupHm of input.candidatePickupHms) {
    const preferred =
      input.preferredEndDate &&
      input.preferredReturnHm &&
      input.preferredEndDate >= input.startDate
        ? { endDate: input.preferredEndDate, returnHm: input.preferredReturnHm }
        : null;
    const probes = [
      preferred,
      defaultReturnForPickupProbe({
        rental: input.rental,
        variant: input.variant,
        startDate: input.startDate,
        pickupHm,
        durationUnit: input.durationUnit,
        timeZone: input.timeZone,
      }),
    ].filter(Boolean) as Array<{ endDate: string; returnHm: string }>;

    let ok = false;
    for (const probe of probes) {
      const result = evaluateSelectionAgainstOccupancy({
        rental: input.rental,
        variant: input.variant,
        quantity: input.quantity,
        startDate: input.startDate,
        endDate: probe.endDate,
        pickupHm,
        returnHm: probe.returnHm,
        durationUnit: input.durationUnit,
        timeZone: input.timeZone,
        nowMs: input.nowMs,
        snapshot: input.snapshot,
      });
      if (result.ok) {
        ok = true;
        break;
      }
    }
    if (ok) valid.push(pickupHm);
  }
  return valid;
}

export function filterValidReturnTimes(input: {
  rental: RentalDetails;
  variant: RentalVariant;
  quantity: number;
  startDate: string;
  endDate: string;
  pickupHm: string;
  durationUnit: 'hour' | 'day';
  timeZone?: string | null;
  nowMs: number;
  snapshot: RentalPdpOccupancySnapshot | null | undefined;
  candidateReturnHms: string[];
}): string[] {
  return input.candidateReturnHms.filter((returnHm) => {
    const result = evaluateSelectionAgainstOccupancy({
      ...input,
      returnHm,
    });
    return result.ok;
  });
}

/** True when no feasible pickup remains on this civil day for the current option/qty. */
export function rentalPickupDayUnavailable(input: {
  rental: RentalDetails;
  variant: RentalVariant;
  quantity: number;
  ymd: string;
  durationUnit: 'hour' | 'day';
  timeZone?: string | null;
  nowMs: number;
  snapshot: RentalPdpOccupancySnapshot | null | undefined;
}): boolean {
  if (
    rentalPickupDayExhausted({
      operatingDays: input.rental.operatingDays,
      ymd: input.ymd,
      timeZone: input.timeZone,
      bookingNoticeHours: input.rental.bookingNoticeHours,
      nowMs: input.nowMs,
    })
  ) {
    return true;
  }
  if (!input.snapshot) {
    // Without occupancy, keep schedule-only exhaustion (above). Do not invent full-day blocks.
    return false;
  }
  const candidates = rentalDayTimeOptions({
    operatingDays: input.rental.operatingDays,
    ymd: input.ymd,
    kind: 'pickup',
    stepMinutes: 30,
    timeZone: input.timeZone,
    bookingNoticeHours: input.rental.bookingNoticeHours,
    nowMs: input.nowMs,
  });
  const valid = filterValidPickupTimes({
    rental: input.rental,
    variant: input.variant,
    quantity: input.quantity,
    startDate: input.ymd,
    durationUnit: input.durationUnit,
    timeZone: input.timeZone,
    nowMs: input.nowMs,
    snapshot: input.snapshot,
    candidatePickupHms: candidates,
  });
  return valid.length === 0;
}

export function humanizeRentalAvailabilityError(error: string | null | undefined): string {
  const raw = String(error ?? '').trim();
  if (!raw) return 'Not available for these dates';
  const key = raw.replace(/\s+/g, '_').toLowerCase();
  if (key === 'insufficient_stock' || /insufficient.?stock/i.test(raw)) {
    return 'No units available for that pickup and return. Try a later time or another date.';
  }
  if (key === 'outside_hours' || /outside.?hours/i.test(raw)) {
    return 'That time is outside supplier opening hours.';
  }
  if (key === 'booking_notice' || /booking.?notice|too soon/i.test(raw)) {
    return 'Pickup is too soon for this listing’s booking notice.';
  }
  if (key === 'duration_too_short' || /minimum rental/i.test(raw)) {
    return raw.includes('Minimum') ? raw : 'Rental is shorter than the minimum duration.';
  }
  if (key === 'duration_too_long' || /maximum rental/i.test(raw)) {
    return raw.includes('Maximum') ? raw : 'Rental exceeds the maximum duration.';
  }
  return raw.replace(/_/g, ' ');
}

/** Guide copy when auto-moving pickup. */
export function availableFromHint(earliestHm: string | null | undefined): string | null {
  const raw = String(earliestHm ?? '').trim();
  if (!raw) return null;
  return `Available from ${normalizeHm(raw)}`;
}
