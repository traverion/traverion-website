/**
 * Rental interval availability — pure domain helpers.
 *
 * Semantics (authoritative for future booking engine):
 * - Intervals are half-open [start, end) in absolute UTC instants (ISO-8601 / Date).
 * - Listing timezone is used only to interpret supplier local opening hours & calendars.
 * - Preparation buffer is placed AFTER return: occupied window is [pickup, return + buffer).
 * - Booking notice: pickup must be at least noticeHours after "now" in absolute time.
 * - Stock is tracked per stable variant id (pooled identical units).
 *
 * Not yet wired to public checkout. Supplier blocks written to DB are consumed by
 * these helpers once the claim path is extended for rentals.
 */

export type RentalInterval = {
  /** Inclusive start (UTC ms). */
  startMs: number;
  /** Exclusive end (UTC ms). */
  endMs: number;
};

export type RentalStockOccupancy = {
  variantId: string;
  interval: RentalInterval;
  quantity: number;
};

export type RentalAvailabilityQuery = {
  variantId: string;
  stock: number;
  requestedQty: number;
  /** Requested rental [pickup, return) before buffer. */
  pickupReturn: RentalInterval;
  bufferMinutes: number;
  bookingNoticeHours: number;
  nowMs: number;
  /** Supplier blocks that fully remove stock for the overlapping window. */
  blocks: RentalInterval[];
  /** Confirmed reservations + live holds that occupy stock. */
  occupancies: RentalStockOccupancy[];
};

export type RentalAvailabilityResult =
  | { ok: true; available: number; occupiedWindow: RentalInterval }
  | { ok: false; error: string; available?: number };

export function isValidHalfOpenInterval(interval: RentalInterval): boolean {
  return (
    Number.isFinite(interval.startMs) &&
    Number.isFinite(interval.endMs) &&
    interval.endMs > interval.startMs
  );
}

/** Half-open overlap: [aStart,aEnd) overlaps [bStart,bEnd) iff aStart < bEnd && bStart < aEnd. */
export function intervalsOverlap(a: RentalInterval, b: RentalInterval): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/** Occupied window including turnaround buffer after return. */
export function occupiedWindowWithBuffer(
  pickupReturn: RentalInterval,
  bufferMinutes: number
): RentalInterval {
  const bufferMs = Math.max(0, Math.round(bufferMinutes)) * 60_000;
  return { startMs: pickupReturn.startMs, endMs: pickupReturn.endMs + bufferMs };
}

export function noticeSatisfied(
  pickupMs: number,
  nowMs: number,
  bookingNoticeHours: number
): boolean {
  const noticeMs = Math.max(0, bookingNoticeHours) * 3_600_000;
  return pickupMs >= nowMs + noticeMs;
}

/**
 * Units of `variantId` already reserved for intervals overlapping `window`.
 */
export function reservedQuantityInWindow(
  variantId: string,
  window: RentalInterval,
  occupancies: RentalStockOccupancy[]
): number {
  let used = 0;
  for (const row of occupancies) {
    if (row.variantId !== variantId) continue;
    if (!intervalsOverlap(window, row.interval)) continue;
    used += Math.max(0, Math.floor(row.quantity));
  }
  return used;
}

export function isFullyBlocked(window: RentalInterval, blocks: RentalInterval[]): boolean {
  return blocks.some((b) => intervalsOverlap(window, b));
}

/**
 * Evaluate whether `requestedQty` of a variant can be reserved for the given pickup/return.
 * Does not mutate state — callers must still perform an atomic DB claim.
 */
export function evaluateRentalAvailability(q: RentalAvailabilityQuery): RentalAvailabilityResult {
  const stock = Math.max(0, Math.floor(q.stock));
  const requestedQty = Math.floor(q.requestedQty);
  if (!(requestedQty >= 1)) return { ok: false, error: 'Quantity must be at least 1.' };
  if (!(stock >= 1)) return { ok: false, error: 'This option has no stock configured.' };
  if (!isValidHalfOpenInterval(q.pickupReturn)) {
    return { ok: false, error: 'Return must be after pickup.' };
  }
  if (!noticeSatisfied(q.pickupReturn.startMs, q.nowMs, q.bookingNoticeHours)) {
    return { ok: false, error: 'Pickup is too soon — booking notice is not met.' };
  }

  const occupiedWindow = occupiedWindowWithBuffer(q.pickupReturn, q.bufferMinutes);
  if (isFullyBlocked(occupiedWindow, q.blocks)) {
    return { ok: false, error: 'Those dates are blocked by the supplier.', available: 0 };
  }

  const reserved = reservedQuantityInWindow(q.variantId, occupiedWindow, q.occupancies);
  const available = Math.max(0, stock - reserved);
  if (requestedQty > available) {
    return {
      ok: false,
      error:
        available <= 0
          ? 'No units available for that interval.'
          : `Only ${available} unit${available === 1 ? '' : 's'} available for that interval.`,
      available,
    };
  }
  return { ok: true, available, occupiedWindow };
}
