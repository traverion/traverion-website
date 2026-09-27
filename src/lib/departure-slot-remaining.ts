import { tourPaidSlotKey } from '../data/supabase-availability';
import { tourDepartureRemainingSeats } from './tour-departure-remaining';

/** Remaining spots for one departure on a day (null when capacity snap unavailable). */
export function departureSlotSpotsLeft(params: {
  dayIso: string;
  startTimeHm: string;
  maxSpotsPerSlot: number | null | undefined;
  maxPersonsFallback: number;
  paidBySlot: Record<string, number>;
  paidByDay: Record<string, number>;
  dayCapOverride?: number | null;
  /** Phase 1163: unused for slot math; typed nullable so callers can pass unknown listing fallback. */
  fallbackDayCap: number | null;
}): number | null {
  const day = params.dayIso.trim().slice(0, 10);
  const time = params.startTimeHm.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !time) return null;
  const spots = params.maxSpotsPerSlot;
  const slotCap =
    typeof spots === 'number' && Number.isFinite(spots) && spots >= 1
      ? Math.min(99, Math.floor(spots))
      : Math.min(99, Math.max(1, params.maxPersonsFallback));
  // Phase 1113: slot remaining ∩ day remaining when a day override exists.
  return tourDepartureRemainingSeats({
    slotMaxSpots: slotCap,
    paidGuestsSlot: params.paidBySlot[tourPaidSlotKey(day, time)] ?? 0,
    dayCapacityOverride: params.dayCapOverride,
    paidGuestsDay: params.paidByDay[day] ?? 0,
  });
}

/**
 * Best remaining capacity across still-bookable departures on a day.
 * Used when no departure is selected yet — day-total paid seats must not treat a
 * full morning as “fully booked this day” while evening still has seats.
 *
 * Phase 1123: each departure carries its own maxSpotsPerSlot (schedule-resolved).
 */
export function maxSpotsLeftAcrossDepartures(params: {
  dayIso: string;
  departures: Array<{
    startTimeHm: string;
    maxSpotsPerSlot?: number | null;
    maxPersonsFallback?: number;
  }>;
  paidBySlot: Record<string, number>;
  paidByDay: Record<string, number>;
  dayCapOverride?: number | null;
  /** Phase 1163: nullable listing-wide fallback (passed through to slot helper). */
  fallbackDayCap: number | null;
}): number | null {
  const deps = params.departures.filter((d) => d.startTimeHm.trim());
  if (deps.length < 1) return null;
  let maxLeft = 0;
  let saw = false;
  for (const dep of deps) {
    const left = departureSlotSpotsLeft({
      dayIso: params.dayIso,
      startTimeHm: dep.startTimeHm,
      maxSpotsPerSlot: dep.maxSpotsPerSlot,
      maxPersonsFallback: dep.maxPersonsFallback ?? 12,
      paidBySlot: params.paidBySlot,
      paidByDay: params.paidByDay,
      dayCapOverride: params.dayCapOverride,
      fallbackDayCap: params.fallbackDayCap,
    });
    if (left == null) continue;
    saw = true;
    maxLeft = Math.max(maxLeft, left);
  }
  return saw ? maxLeft : null;
}

/**
 * Guest stepper upper bound from remaining inventory.
 * Unknown remaining → keep option max. Sold out → 0 (never restore full option max).
 */
export function partyMaxCappedByRemainingSpots(
  optionMax: number,
  spotsLeft: number | null | undefined
): number {
  const base = Math.max(0, Math.floor(optionMax));
  if (spotsLeft == null || !Number.isFinite(spotsLeft)) return base;
  const left = Math.floor(spotsLeft);
  if (left < 1) return 0;
  return Math.max(1, Math.min(base, left));
}
