/**
 * Partner capacity edits must not silently pretend sold guests disappear.
 * Lowering a cap below already-sold (or held) occupancy is allowed for future
 * sales but must surface a clear warning — paid bookings keep their seats.
 */

import { normalizeTourStartTimeHm } from './booking-hold';

export function capacityBelowSoldWarning(params: {
  newCapacity: number;
  occupyingGuests: number;
  scopeLabel?: string;
}): string | null {
  const cap = Math.max(0, Math.floor(params.newCapacity));
  const sold = Math.max(0, Math.floor(params.occupyingGuests));
  if (sold < 1 || cap >= sold) return null;
  const scope = (params.scopeLabel ?? 'this date').trim() || 'this date';
  return `You already have ${sold} guest${sold === 1 ? '' : 's'} on ${scope}. Lowering the cap to ${cap} will not cancel those trips — it only limits new bookings. Existing paid bookings keep their seats.`;
}

/** Schedule max spots reduced below paid/held occupancy for that departure. */
export function scheduleSpotsBelowSoldWarning(params: {
  newMaxSpots: number;
  occupyingGuests: number;
  startTimeHm?: string | null;
}): string | null {
  const scope = params.startTimeHm?.trim()
    ? `the ${params.startTimeHm.trim()} departure`
    : 'this departure';
  return capacityBelowSoldWarning({
    newCapacity: params.newMaxSpots,
    occupyingGuests: params.occupyingGuests,
    scopeLabel: scope,
  });
}

/**
 * Phase 1100: Changing a schedule’s start time does not move purchased seats and
 * would open the new wall-clock as a fresh full-capacity slot. Block the edit
 * when the previous departure still has occupying guests — add a new schedule instead.
 */
export function scheduleDepartureTimeMoveBlockReason(params: {
  previousStartTimeHm: string | null | undefined;
  nextStartTimeHm: string | null | undefined;
  occupyingGuestsOnPrevious: number;
}): string | null {
  const prev = normalizeTourStartTimeHm(params.previousStartTimeHm);
  const next = normalizeTourStartTimeHm(params.nextStartTimeHm);
  if (!prev || !next || prev === next) return null;
  const sold = Math.max(0, Math.floor(params.occupyingGuestsOnPrevious));
  if (sold < 1) return null;
  return `You already have ${sold} guest${sold === 1 ? '' : 's'} booked on the ${prev} departure. This schedule’s start time cannot be changed to ${next} — travelers keep ${prev}, and ${next} would open as a new full-capacity departure. Add a separate schedule for ${next} instead.`;
}

/** @deprecated Phase 1100 — use scheduleDepartureTimeMoveBlockReason (hard block, not confirm). */
export function scheduleDepartureTimeMoveWarning(params: {
  previousStartTimeHm: string | null | undefined;
  nextStartTimeHm: string | null | undefined;
  occupyingGuestsOnPrevious: number;
}): string | null {
  return scheduleDepartureTimeMoveBlockReason(params);
}
