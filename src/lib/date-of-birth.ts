/**
 * Date-of-birth helpers for partner onboarding.
 * Values stay ISO `YYYY-MM-DD` for Stripe / backend compatibility.
 * Callers should not persist DOB beyond the existing wizard draft path.
 */

export const DOB_MIN_AGE_YEARS = 18;

export type IsoDobParts = { year: number; month: number; day: number };

export function parseIsoDob(value: string | null | undefined): IsoDobParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function formatIsoDob(parts: IsoDobParts): string {
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return `${parts.year}-${mm}-${dd}`;
}

export function formatDobDisplay(value: string | null | undefined): string {
  const parts = parseIsoDob(value);
  if (!parts) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

function utcTodayParts(now = new Date()): IsoDobParts {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

export function maxSelectableDob(now = new Date()): IsoDobParts {
  return utcTodayParts(now);
}

export function minSelectableDob(now = new Date()): IsoDobParts {
  const t = utcTodayParts(now);
  return { year: t.year - 120, month: 1, day: 1 };
}

/** Latest birthday that still meets the minimum age. */
export function latestDobMeetingMinAge(
  minAge = DOB_MIN_AGE_YEARS,
  now = new Date()
): IsoDobParts {
  const t = utcTodayParts(now);
  return { year: t.year - minAge, month: t.month, day: t.day };
}

function compareIso(a: IsoDobParts, b: IsoDobParts): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function isFutureDob(parts: IsoDobParts, now = new Date()): boolean {
  return compareIso(parts, maxSelectableDob(now)) > 0;
}

export function ageYearsOn(parts: IsoDobParts, now = new Date()): number {
  const t = utcTodayParts(now);
  let age = t.year - parts.year;
  if (t.month < parts.month || (t.month === parts.month && t.day < parts.day)) age -= 1;
  return age;
}

export function validateIsoDob(
  value: string | null | undefined,
  opts?: { minAge?: number; required?: boolean }
): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return opts?.required === false ? null : 'Select a date of birth.';
  const parts = parseIsoDob(raw);
  if (!parts) return 'Enter a valid date of birth.';
  if (isFutureDob(parts)) return 'Date of birth cannot be in the future.';
  const minAge = opts?.minAge ?? DOB_MIN_AGE_YEARS;
  if (ageYearsOn(parts) < minAge) {
    return `You must be at least ${minAge} years old.`;
  }
  const min = minSelectableDob();
  if (compareIso(parts, min) < 0) return 'Enter a valid date of birth.';
  return null;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampDobDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(1, day), daysInMonth(year, month));
}
