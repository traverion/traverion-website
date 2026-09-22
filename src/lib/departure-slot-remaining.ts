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
