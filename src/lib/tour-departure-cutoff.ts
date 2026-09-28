/**
 * Tour departure bookability cut-off.
 *
 * Wall-clock times on listings are interpreted in an IANA zone. Default remains
 * Europe/Helsinki. When extras / purchase_snapshot carry a valid IANA id, quote,
 * cutoff, Trips, and traveler self-cancel (Phase 1055 / migration 124) use it
 * so a Rovaniemi 20:00 stays 20:00 local regardless of browser TZ.
 */

export const TRAVERION_DEPARTURE_TIMEZONE = 'Europe/Helsinki';

/** Max supplier-configured hours before start (7 days). */
export const MAX_BOOKING_CUTOFF_HOURS = 168;

/**
 * Resolve listing departure timezone. Invalid / empty → platform default.
 * Uses Intl so bogus strings cannot shift cancel/book windows silently.
 */
export function resolveDepartureTimezone(raw: unknown): string {
  const candidate = typeof raw === 'string' ? raw.trim() : '';
  if (!candidate) return TRAVERION_DEPARTURE_TIMEZONE;
  try {
    // Throws RangeError for unknown IANA ids in modern engines.
    Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return candidate;
  } catch {
    return TRAVERION_DEPARTURE_TIMEZONE;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{2}:\d{2}$/;

export function normalizeBookingCutoffHours(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_BOOKING_CUTOFF_HOURS, Math.floor(n));
}

function tzOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const g = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return asUtc - instant.getTime();
}

/** Local calendar date + HH:MM for an instant in `timeZone`. */
function wallClockAtInstant(
  ms: number,
  timeZone: string
): { ymd: string; hm: string } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const g = (type: string) => parts.find((p) => p.type === type)?.value;
    const y = g('year');
    const mo = g('month');
    const d = g('day');
    const hRaw = g('hour');
    const mi = g('minute');
    if (!y || !mo || !d || !hRaw || !mi) return null;
    let hour = Number.parseInt(hRaw, 10);
    if (!Number.isFinite(hour)) return null;
    if (hour === 24) hour = 0;
    return {
      ymd: `${y}-${mo}-${d}`,
      hm: `${String(hour).padStart(2, '0')}:${mi}`,
    };
  } catch {
    return null;
  }
}

/** YYYY-MM-DD + HH:MM as wall time in `timeZone` → UTC epoch ms. */
export function wallTimeInZoneToUtcMs(
  isoDate: string,
  startTimeHm: string,
  timeZone: string = TRAVERION_DEPARTURE_TIMEZONE
): number | null {
  const date = isoDate.trim();
  const hm = (startTimeHm || '00:00').trim().slice(0, 5);
  if (!ISO_DATE.test(date) || !HM.test(hm)) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mi] = hm.split(':').map(Number);
  let utc = Date.UTC(y, mo - 1, d, hh, mi, 0);
  for (let i = 0; i < 3; i++) {
    const offset = tzOffsetMs(timeZone, new Date(utc));
    const next = Date.UTC(y, mo - 1, d, hh, mi, 0) - offset;
    if (next === utc) break;
    utc = next;
  }
  // Phase 1481: reject DST spring-forward "gap" times (e.g. 03:00 → 02:00) so
  // cutoff / bookability never treat a nonexistent wall clock as an hour early.
  const wall = wallClockAtInstant(utc, timeZone);
  if (!wall || wall.ymd !== date || wall.hm !== hm) return null;
  // Phase 1482: reject DST fall-back ambiguous times (e.g. 03:30 occurs twice) so
  // cutoff / cancel windows are not silently pinned to one of two valid instants.
  for (const deltaMs of [-3_600_000, 3_600_000]) {
    const alt = wallClockAtInstant(utc + deltaMs, timeZone);
    if (alt && alt.ymd === date && alt.hm === hm) return null;
  }
  return utc;
}

export type DepartureCutoffCheck =
  | { ok: true; startMs: number; lastBookableMs: number }
  | { ok: false; error: string; code: 'past_start' | 'cutoff' | 'bad_time' };

/**
 * Whether a traveler may still book this departure.
 * `cutoffHoursBeforeStart` 0 means bookable until the start instant (not after).
 */
export function assertDepartureStillBookable(input: {
  bookingDate: string;
  startTimeHm: string;
  cutoffHoursBeforeStart?: number;
  nowMs?: number;
  timeZone?: string;
}): DepartureCutoffCheck {
  const startMs = wallTimeInZoneToUtcMs(
    input.bookingDate,
    input.startTimeHm,
    input.timeZone ?? TRAVERION_DEPARTURE_TIMEZONE
  );
  if (startMs == null) {
    return { ok: false, code: 'bad_time', error: 'Choose a valid departure time.' };
  }
  const cutoffHours = normalizeBookingCutoffHours(input.cutoffHoursBeforeStart ?? 0);
  const lastBookableMs = startMs - cutoffHours * 60 * 60 * 1000;
  const now = input.nowMs ?? Date.now();
  if (now >= startMs) {
    return {
      ok: false,
      code: 'past_start',
      error: 'This departure has already started. Choose a later date or time.',
    };
  }
  if (now >= lastBookableMs) {
    return {
      ok: false,
      code: 'cutoff',
      error:
        cutoffHours === 1
          ? 'Online booking closes 1 hour before departure. Choose a later date or time.'
          : `Online booking closes ${cutoffHours} hours before departure. Choose a later date or time.`,
    };
  }
  return { ok: true, startMs, lastBookableMs };
}

export function isDepartureTimeStillBookable(input: {
  bookingDate: string;
  startTimeHm: string;
  cutoffHoursBeforeStart?: number;
  nowMs?: number;
  timeZone?: string;
}): boolean {
  return assertDepartureStillBookable(input).ok;
}

export function bookingCutoffTravelerLabel(hours: number): string | null {
  const n = normalizeBookingCutoffHours(hours);
  if (n <= 0) return null;
  if (n === 1) return 'Book at least 1 hour before departure';
  return `Book at least ${n} hours before departure`;
}

/**
 * Phase 1322: 0–23 wall-clock hour in an IANA zone (midnight → 0, not 24).
 * Used for Partner Home greeting aligned with experience-local today.
 */
export function wallHourInTimeZone(nowMs: number = Date.now(), timeZone: string = TRAVERION_DEPARTURE_TIMEZONE): number {
  const tz = resolveDepartureTimezone(timeZone);
  const raw = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hour12: false,
    timeZone: tz,
  }).format(new Date(nowMs));
  let hour = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(hour)) hour = 0;
  if (hour === 24) hour = 0;
  return Math.min(23, Math.max(0, hour));
}

