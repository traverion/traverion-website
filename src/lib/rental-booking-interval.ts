/**
 * Build rental pickup/return instants from traveler date + optional time inputs.
 * Durations and limits stay listing-authoritative (rental-quote / rental-details).
 */

import { noticeSatisfied } from './rental-availability';
import type { RentalOperatingDay, RentalWeekday } from '../types/rental';

export type RentalIntervalSelection = {
  startDate: string;
  endDate: string;
  pickupHm: string;
  returnHm: string;
  durationUnit: 'hour' | 'day';
};

export type RentalIntervalBuildResult =
  | {
      ok: true;
      pickupAt: string;
      returnAt: string;
      durationCount: number;
      durationUnit: 'hour' | 'day';
    }
  | { ok: false; error: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function normalizeHm(raw: string, fallback = '10:00'): string {
  const t = (raw ?? '').trim();
  const m = t.match(HM);
  if (!m) return fallback;
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

function localDateTimeMs(ymd: string, hm: string): number | null {
  if (!YMD.test(ymd)) return null;
  const time = normalizeHm(hm);
  const [y, mo, d] = ymd.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(y!, mo! - 1, d!, hh!, mm!, 0, 0);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo! - 1 ||
    dt.getDate() !== d ||
    dt.getHours() !== hh ||
    dt.getMinutes() !== mm
  ) {
    return null;
  }
  return dt.getTime();
}

/** Whole calendar days between two YMD dates (inclusive start, exclusive end style for daily rentals). */
export function calendarDaysBetween(startYmd: string, endYmd: string): number {
  if (!YMD.test(startYmd) || !YMD.test(endYmd)) return NaN;
  const a = Date.parse(`${startYmd}T12:00:00Z`);
  const b = Date.parse(`${endYmd}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Daily mode: end date is the return calendar day (may equal start for same-day if hours allow).
 * Duration days = max(1, calendar days from start→end) when end > start; same-day = 1 day.
 * Hourly mode: duration = ceil hours between pickup and return.
 */
export function buildRentalInterval(selection: RentalIntervalSelection): RentalIntervalBuildResult {
  const startDate = selection.startDate.trim();
  const endDate = selection.endDate.trim();
  if (!YMD.test(startDate) || !YMD.test(endDate)) {
    return { ok: false, error: 'Choose valid start and end dates.' };
  }
  if (endDate < startDate) {
    return { ok: false, error: 'Return date must be on or after pickup date.' };
  }

  const pickupHm = normalizeHm(selection.pickupHm, '10:00');
  const returnHm = normalizeHm(selection.returnHm, selection.durationUnit === 'hour' ? '18:00' : '18:00');
  const startMs = localDateTimeMs(startDate, pickupHm);
  const endMs = localDateTimeMs(endDate, returnHm);
  if (startMs == null || endMs == null) {
    return { ok: false, error: 'Choose a valid pickup and return time.' };
  }
  if (endMs <= startMs) {
    return { ok: false, error: 'Return must be after pickup.' };
  }

  if (selection.durationUnit === 'hour') {
    const hours = (endMs - startMs) / 3_600_000;
    // Bill in whole hours (round up to next hour for partial).
    const billable = Math.max(1, Math.ceil(hours));
    return {
      ok: true,
      pickupAt: new Date(startMs).toISOString(),
      returnAt: new Date(endMs).toISOString(),
      durationCount: billable,
      durationUnit: 'hour',
    };
  }

  const span = calendarDaysBetween(startDate, endDate);
  const durationCount = span <= 0 ? 1 : span;
  return {
    ok: true,
    pickupAt: new Date(startMs).toISOString(),
    returnAt: new Date(endMs).toISOString(),
    durationCount,
    durationUnit: 'day',
  };
}

export function addDaysYmd(ymd: string, days: number): string {
  if (!YMD.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function todayLocalYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WEEKDAY_BY_JS_DAY: RentalWeekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function weekdayOfYmd(ymd: string): RentalWeekday | null {
  if (!YMD.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  if (dt.getFullYear() !== y || dt.getMonth() !== m! - 1 || dt.getDate() !== d) return null;
  return WEEKDAY_BY_JS_DAY[dt.getDay()] ?? null;
}

function hmMinutes(hm: string): number | null {
  const time = normalizeHm(hm, '');
  if (!HM.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

function minutesToHm(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.floor(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True when operating hours exist and this civil day is closed for pickup/return. Empty schedule = not closed. */
export function rentalDayClosed(
  operatingDays: RentalOperatingDay[] | undefined,
  ymd: string,
): boolean {
  const days = operatingDays ?? [];
  if (days.length === 0) return false;
  const weekday = weekdayOfYmd(ymd);
  if (!weekday) return true;
  const day = days.find((row) => row.day === weekday);
  return !day?.open;
}

const FALLBACK_EARLIEST_MIN = 6 * 60;
const FALLBACK_LATEST_MIN = 22 * 60;

/**
 * Valid HH:MM options for a calendar day from supplier windows (inclusive).
 * Default step 30 minutes. Empty operatingDays → 06:00–22:00 grid (server still validates).
 * Closed day → []. Does not rewrite caller values.
 */
export function rentalDayTimeOptions(input: {
  operatingDays?: RentalOperatingDay[];
  ymd: string;
  kind: 'pickup' | 'return';
  stepMinutes?: number;
  /** Same-day return: only times strictly after this pickup HH:MM. */
  afterHmExclusive?: string | null;
}): string[] {
  const step = Math.max(1, Math.min(60, Math.floor(input.stepMinutes ?? 30)));
  const days = input.operatingDays ?? [];
  let earliest = FALLBACK_EARLIEST_MIN;
  let latest = FALLBACK_LATEST_MIN;

  if (days.length > 0) {
    const weekday = weekdayOfYmd(input.ymd);
    if (!weekday) return [];
    const day = days.find((row) => row.day === weekday);
    if (!day?.open) return [];
    const e = hmMinutes(
      input.kind === 'pickup' ? day.earliestPickupHm ?? '' : day.earliestReturnHm ?? '',
    );
    const l = hmMinutes(
      input.kind === 'pickup' ? day.latestPickupHm ?? '' : day.latestReturnHm ?? '',
    );
    if (e != null && l != null && l >= e) {
      earliest = e;
      latest = l;
    }
  }

  const after = input.afterHmExclusive ? hmMinutes(input.afterHmExclusive) : null;
  const out: string[] = [];
  for (let t = earliest; t <= latest; t += step) {
    if (after != null && t <= after) continue;
    out.push(minutesToHm(t));
  }
  const latestHm = minutesToHm(latest);
  if (
    latest >= earliest &&
    !out.includes(latestHm) &&
    (after == null || latest > after)
  ) {
    out.push(latestHm);
  }
  return out;
}

function dayWindowIssue(
  day: RentalOperatingDay | undefined,
  hm: string,
  kind: 'pickup' | 'return'
): string | null {
  const label = kind === 'pickup' ? 'Pickup' : 'Return';
  if (!day?.open) return `${label} is outside the opening days.`;
  const minutes = hmMinutes(hm);
  const earliest = hmMinutes(kind === 'pickup' ? day.earliestPickupHm ?? '' : day.earliestReturnHm ?? '');
  const latest = hmMinutes(kind === 'pickup' ? day.latestPickupHm ?? '' : day.latestReturnHm ?? '');
  if (minutes == null || earliest == null || latest == null) return null;
  if (minutes < earliest || minutes > latest) {
    const from = kind === 'pickup' ? day.earliestPickupHm : day.earliestReturnHm;
    const until = kind === 'pickup' ? day.latestPickupHm : day.latestReturnHm;
    return `${label} time must be between ${from} and ${until}.`;
  }
  return null;
}

/**
 * Opening hours and booking notice for a traveler selection.
 * Does not reserve stock. Empty schedules are not treated as closed.
 */
export function rentalScheduleIssue(input: {
  operatingDays?: RentalOperatingDay[];
  bookingNoticeHours?: number | null;
  startDate: string;
  endDate: string;
  pickupHm: string;
  returnHm: string;
  pickupAtIso?: string;
  nowMs?: number;
}): string | null {
  const days = input.operatingDays ?? [];
  if (days.length > 0) {
    const pickupDay = days.find((day) => day.day === weekdayOfYmd(input.startDate));
    const returnDay = days.find((day) => day.day === weekdayOfYmd(input.endDate));
    const pickupIssue = dayWindowIssue(pickupDay, input.pickupHm, 'pickup');
    if (pickupIssue) return pickupIssue;
    const returnIssue = dayWindowIssue(returnDay, input.returnHm, 'return');
    if (returnIssue) return returnIssue;
  }
  const noticeHours = input.bookingNoticeHours ?? 0;
  if (noticeHours > 0 && input.pickupAtIso) {
    const pickupMs = Date.parse(input.pickupAtIso);
    if (Number.isFinite(pickupMs) && !noticeSatisfied(pickupMs, input.nowMs ?? Date.now(), noticeHours)) {
      return `Book at least ${noticeHours} hour${noticeHours === 1 ? '' : 's'} before pickup.`;
    }
  }
  return null;
}
