/**
 * Authoritative rental window for checkout.
 * Pickup and return instants are interpreted in the listing IANA timezone.
 * Billing length is derived from those instants. Callers must not trust a
 * browser-supplied hour or day count.
 *
 * Keep supabase/functions/_shared/rental-server-window.ts identical.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Weekday = (typeof WEEKDAYS)[number];

export const RENTAL_PREVIEW_REJECTION = 'Development preview rentals cannot be booked.';

const PREVIEW_IDS = new Set([
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
]);

export function isReservedRentalPreviewId(id: string | null | undefined): boolean {
  return typeof id === 'string' && PREVIEW_IDS.has(id.trim());
}

export type AuthoritativeRentalWindow =
  | {
      ok: true;
      durationCount: number;
      durationUnit: 'hour' | 'day';
      pickupYmd: string;
      returnYmd: string;
      pickupHm: string;
      returnHm: string;
      timeZone: string;
    }
  | { ok: false; error: string };

type OperatingDay = {
  day?: unknown;
  open?: unknown;
  earliestPickupHm?: unknown;
  latestPickupHm?: unknown;
  earliestReturnHm?: unknown;
  latestReturnHm?: unknown;
};

function asInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(value);
}

function validTimeZone(raw: unknown): string | null {
  const candidate = typeof raw === 'string' ? raw.trim() : '';
  if (!candidate) return null;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return null;
  }
}

function zonedParts(
  ms: number,
  timeZone: string
): { ymd: string; hm: string; weekday: Weekday } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    let hour = get('hour');
    const minute = get('minute');
    if (hour === '24') hour = '00';
    const ymd = `${year}-${month}-${day}`;
    const hm = `${hour}:${minute}`;
    const weekday = get('weekday').slice(0, 3).toLowerCase() as Weekday;
    if (!YMD.test(ymd) || !HM.test(hm) || !WEEKDAYS.includes(weekday)) return null;
    return { ymd, hm, weekday };
  } catch {
    return null;
  }
}

function calendarSpan(startYmd: string, endYmd: string): number {
  const a = Date.parse(`${startYmd}T12:00:00Z`);
  const b = Date.parse(`${endYmd}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function hmMinutes(hm: string): number | null {
  const match = hm.match(HM);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function dayWindowIssue(
  day: OperatingDay | undefined,
  hm: string,
  kind: 'pickup' | 'return'
): string | null {
  const label = kind === 'pickup' ? 'Pickup' : 'Return';
  if (!day || day.open !== true) return `${label} is outside the opening days.`;
  const minutes = hmMinutes(hm);
  const earliestRaw = kind === 'pickup' ? day.earliestPickupHm : day.earliestReturnHm;
  const latestRaw = kind === 'pickup' ? day.latestPickupHm : day.latestReturnHm;
  const earliest = typeof earliestRaw === 'string' ? hmMinutes(earliestRaw) : null;
  const latest = typeof latestRaw === 'string' ? hmMinutes(latestRaw) : null;
  if (minutes == null || earliest == null || latest == null) return null;
  if (minutes < earliest || minutes > latest) {
    return `${label} time must be between ${earliestRaw} and ${latestRaw}.`;
  }
  return null;
}

export function authoritativeRentalWindow(input: {
  timeZone: unknown;
  operatingDays?: unknown;
  bookingNoticeHours?: unknown;
  durationMode?: unknown;
  minDurationHours?: unknown;
  maxDurationHours?: unknown;
  minDurationDays?: unknown;
  maxDurationDays?: unknown;
  pickupAt: string;
  returnAt: string;
  durationUnit: 'hour' | 'day';
  nowMs?: number;
}): AuthoritativeRentalWindow {
  const timeZone = validTimeZone(input.timeZone);
  if (!timeZone) {
    return { ok: false, error: 'This rental is missing a valid timezone, so it cannot be reserved.' };
  }
  const pickupMs = Date.parse(input.pickupAt);
  const returnMs = Date.parse(input.returnAt);
  if (!Number.isFinite(pickupMs) || !Number.isFinite(returnMs) || returnMs <= pickupMs) {
    return { ok: false, error: 'Choose valid pickup and return times.' };
  }
  const pickup = zonedParts(pickupMs, timeZone);
  const returning = zonedParts(returnMs, timeZone);
  if (!pickup || !returning) {
    return { ok: false, error: 'Choose valid pickup and return times.' };
  }
  if (returning.ymd < pickup.ymd) {
    return { ok: false, error: 'Return date must be on or after the pickup date.' };
  }

  const mode = typeof input.durationMode === 'string' ? input.durationMode : 'daily';
  if (input.durationUnit === 'hour' && mode !== 'hourly' && mode !== 'both') {
    return { ok: false, error: 'This rental does not offer hourly pricing.' };
  }
  if (input.durationUnit === 'day' && mode !== 'daily' && mode !== 'both') {
    return { ok: false, error: 'This rental does not offer daily pricing.' };
  }

  const days = Array.isArray(input.operatingDays) ? (input.operatingDays as OperatingDay[]) : [];
  if (days.length > 0) {
    const pickupDay = days.find((day) => day?.day === pickup.weekday);
    const returnDay = days.find((day) => day?.day === returning.weekday);
    const pickupIssue = dayWindowIssue(pickupDay, pickup.hm, 'pickup');
    if (pickupIssue) return { ok: false, error: pickupIssue };
    const returnIssue = dayWindowIssue(returnDay, returning.hm, 'return');
    if (returnIssue) return { ok: false, error: returnIssue };
  }

  const noticeHours =
    typeof input.bookingNoticeHours === 'number' &&
    Number.isFinite(input.bookingNoticeHours) &&
    input.bookingNoticeHours > 0
      ? input.bookingNoticeHours
      : 0;
  if (noticeHours > 0 && pickupMs < (input.nowMs ?? Date.now()) + noticeHours * 3_600_000) {
    return {
      ok: false,
      error: `Book at least ${noticeHours} hour${noticeHours === 1 ? '' : 's'} before pickup.`,
    };
  }

  let durationCount: number;
  if (input.durationUnit === 'hour') {
    durationCount = Math.max(1, Math.ceil((returnMs - pickupMs) / 3_600_000));
    const min = asInt(input.minDurationHours, 1);
    const max = asInt(input.maxDurationHours, 720);
    if (durationCount < min) {
      return { ok: false, error: `Minimum rental is ${min} hour${min === 1 ? '' : 's'}.` };
    }
    if (durationCount > max) {
      return { ok: false, error: `Maximum rental is ${max} hours.` };
    }
  } else {
    const span = calendarSpan(pickup.ymd, returning.ymd);
    durationCount = span <= 0 ? 1 : span;
    const min = asInt(input.minDurationDays, 1);
    const max = asInt(input.maxDurationDays, 90);
    if (durationCount < min) {
      return { ok: false, error: `Minimum rental is ${min} day${min === 1 ? '' : 's'}.` };
    }
    if (durationCount > max) {
      return { ok: false, error: `Maximum rental is ${max} days.` };
    }
  }

  return {
    ok: true,
    durationCount,
    durationUnit: input.durationUnit,
    pickupYmd: pickup.ymd,
    returnYmd: returning.ymd,
    pickupHm: pickup.hm,
    returnHm: returning.hm,
    timeZone,
  };
}
