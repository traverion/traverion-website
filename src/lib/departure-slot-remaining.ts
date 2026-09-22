import { remainingCapacity } from './availability-ops';
import { tourPaidSlotKey } from '../data/supabase-availability';

/** Remaining spots for one departure on a day (null when capacity snap unavailable). */
export function departureSlotSpotsLeft(params: {
  dayIso: string;
  startTimeHm: string;
  maxSpotsPerSlot: number | null | undefined;
  maxPersonsFallback: number;
  paidBySlot: Record<string, number>;
  paidByDay: Record<string, number>;
  dayCapOverride?: number;
  fallbackDayCap: number;
}): number | null {
  const day = params.dayIso.trim().slice(0, 10);
  const time = params.startTimeHm.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !time) return null;
  if (params.dayCapOverride != null && Number.isFinite(params.dayCapOverride)) {
    return remainingCapacity(params.dayCapOverride, params.paidByDay[day] ?? 0);
  }
  const spots = params.maxSpotsPerSlot;
  const cap =
    typeof spots === 'number' && Number.isFinite(spots) && spots >= 1
      ? Math.min(99, Math.floor(spots))
      : Math.min(99, Math.max(1, params.maxPersonsFallback));
  const paid = params.paidBySlot[tourPaidSlotKey(day, time)] ?? 0;
  return remainingCapacity(cap, paid);
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
