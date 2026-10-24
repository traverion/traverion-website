/**
 * Parse booked experience duration and compute review-unlock instants.
 * Prefer purchase_snapshot.duration — never invent a duration when missing.
 */

import { resolveDepartureTimezone, wallTimeInZoneToUtcMs } from './tour-departure-cutoff';
import {
  displayDepartureTimezoneFromPurchase,
  displayDurationFromPurchase,
  displayStartTimeFromPurchase,
} from './purchase-snapshot';

/** Parse free-text duration like "5 hours", "90 minutes", "1.5 h". */
export function parseExperienceDurationMinutes(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;

  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
  const minMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/);
  let minutes = 0;
  if (hourMatch) {
    const h = Number(hourMatch[1]);
    if (!Number.isFinite(h) || h < 0) return null;
    minutes += Math.round(h * 60);
  }
  if (minMatch) {
    const m = Number(minMatch[1]);
    if (!Number.isFinite(m) || m < 0) return null;
    minutes += Math.round(m);
  }
  if (!hourMatch && !minMatch) {
    const bareHours = s.match(/^(\d+(?:\.\d+)?)$/);
    if (bareHours) {
      const h = Number(bareHours[1]);
      if (!Number.isFinite(h) || h <= 0 || h > 48) return null;
      minutes = Math.round(h * 60);
    }
  }
  if (minutes <= 0) return null;
  return Math.min(minutes, 14 * 24 * 60);
}

export function reviewUnlockMsForTour(params: {
  bookingDate: string;
  startTimeHm: string;
  timeZone: string;
  durationMinutes: number | null;
}): number | null {
  const startMs = wallTimeInZoneToUtcMs(params.bookingDate, params.startTimeHm, params.timeZone);
  if (startMs == null) return null;
  if (params.durationMinutes == null || params.durationMinutes <= 0) {
    // No duration snapshotted — do not invent an end; unlock after start (legacy).
    return startMs;
  }
  return startMs + params.durationMinutes * 60_000;
}

export function reviewUnlockMsForStay(params: {
  checkOutYmd: string;
  checkOutTimeHm: string | null;
  timeZone: string;
}): number | null {
  const hm = (params.checkOutTimeHm ?? '').trim().slice(0, 5) || '00:00';
  return wallTimeInZoneToUtcMs(params.checkOutYmd, hm, params.timeZone);
}

/** Duration minutes from purchase snapshot (preferred) or live listing string. */
export function durationMinutesFromPurchase(
  snapshot: unknown,
  liveDuration?: string | null
): number | null {
  const text = displayDurationFromPurchase(snapshot, liveDuration);
  return parseExperienceDurationMinutes(text);
}

export function tourStartHmFromBooking(b: {
  start_time?: string | null;
  purchase_snapshot?: unknown;
}): string {
  return displayStartTimeFromPurchase(b.purchase_snapshot, b.start_time)?.slice(0, 5) || '23:59';
}

export function resolveReviewTimezone(params: {
  purchase_snapshot?: unknown;
  departureTimezone?: string | null;
}): string {
  return resolveDepartureTimezone(
    displayDepartureTimezoneFromPurchase(params.purchase_snapshot) || params.departureTimezone
  );
}
