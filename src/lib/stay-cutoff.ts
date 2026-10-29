/** Booking notice stored as minutes. Checkout reads the same minute count. */

import { resolveDepartureTimezone, wallTimeInZoneToUtcMs } from './tour-departure-cutoff';

export type StayCutoffUnit = 'minutes' | 'hours' | 'days';

const MINUTE_AMOUNTS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;
const HOUR_AMOUNTS = Array.from({ length: 24 }, (_, index) => index + 1);
const DAY_AMOUNTS = [1, 2, 3, 4, 5, 6, 7] as const;

export function stayCutoffAmounts(unit: StayCutoffUnit): readonly number[] {
  if (unit === 'minutes') return MINUTE_AMOUNTS;
  if (unit === 'hours') return HOUR_AMOUNTS;
  return DAY_AMOUNTS;
}

export function stayCutoffToMinutes(unit: StayCutoffUnit, amount: number): number {
  const allowed = stayCutoffAmounts(unit);
  const floored = Math.floor(amount);
  const next = allowed.includes(floored) || (Number.isInteger(floored) && floored > 0) ? floored : allowed[0];
  if (unit === 'minutes') return next;
  if (unit === 'hours') return next * 60;
  return next * 24 * 60;
}

/** Read a saved minute count without treating 5 hours as 5 minutes. */
export function stayCutoffFromMinutes(minutes: number | null | undefined): { unit: StayCutoffUnit; amount: number } {
  const value = Math.max(0, Math.floor(Number(minutes) || 0));
  if (value <= 0) return { unit: 'hours', amount: 1 };
  if (value % (24 * 60) === 0) return { unit: 'days', amount: value / (24 * 60) };
  if (value % 60 === 0) return { unit: 'hours', amount: value / 60 };
  return { unit: 'minutes', amount: value };
}

export function stayCutoffSummary(minutes: number | null | undefined): string {
  const value = Math.max(0, Math.floor(Number(minutes) || 0));
  if (value <= 0) return 'Reservations can be made until check-in.';
  const parsed = stayCutoffFromMinutes(value);
  const noun = parsed.unit === 'minutes' ? 'minutes' : parsed.unit === 'hours' ? (parsed.amount === 1 ? 'hour' : 'hours') : parsed.amount === 1 ? 'day' : 'days';
  return `Reservations close ${parsed.amount} ${noun} before check-in.`;
}

/**
 * Whether a traveler may still start a new stay on this check-in date.
 * Uses official check-in wall time in the listing timezone (not browser TZ).
 * Cutoff 0 / missing → bookable until the check-in instant.
 */
export function stayCheckInStillBookable(input: {
  checkInDate: string;
  checkInTimeHm?: string | null;
  cutoffMinutes?: number | null;
  timeZone?: string | null;
  nowMs?: number;
}): boolean {
  const date = (input.checkInDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const hmRaw = (input.checkInTimeHm ?? '').trim().slice(0, 5);
  const hm = /^\d{2}:\d{2}$/.test(hmRaw) ? hmRaw : '15:00';
  const tz = resolveDepartureTimezone(input.timeZone);
  const arrivalMs = wallTimeInZoneToUtcMs(date, hm, tz);
  if (arrivalMs == null) return false;
  const now = input.nowMs ?? Date.now();
  if (now >= arrivalMs) return false;
  const minutes = Math.max(0, Math.floor(Number(input.cutoffMinutes) || 0));
  // Keep parity with quoteStayNights: only enforce when cutoff is configured (>= 0 stored).
  if (!(typeof input.cutoffMinutes === 'number' && input.cutoffMinutes >= 0)) return true;
  const closesAt = arrivalMs - minutes * 60_000;
  return now <= closesAt;
}

/** Normalize stay cutoff minutes the same way booking-quote does. */
export function normalizeStayCutoffMinutes(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
  return Math.floor(raw);
}
