/**
 * Build rental pickup/return instants from traveler date + optional time inputs.
 * Durations and limits stay listing-authoritative (rental-quote / rental-details).
 */

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
