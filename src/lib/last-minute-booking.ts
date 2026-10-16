import { inventoryStartTimeHmFromBooking, normalizeTourStartTimeHm } from './booking-hold';
import { assertDepartureStillBookable, wallTimeInZoneToUtcMs } from './tour-departure-cutoff';

export type LastMinuteUntil = 'departure' | '30m' | '1h';

export function isLastMinuteUntil(value: unknown): value is LastMinuteUntil {
  return value === 'departure' || value === '30m' || value === '1h';
}

export function lastMinutePolicyFromListingExtras(
  listingExtras: unknown,
  optionId: string | null | undefined
): { enabled: boolean; until: LastMinuteUntil } {
  const off = { enabled: false as const, until: 'departure' as const };
  if (!listingExtras || typeof listingExtras !== 'object' || Array.isArray(listingExtras)) return off;
  const options = (listingExtras as { bookingOptions?: unknown }).bookingOptions;
  if (!Array.isArray(options)) return off;
  const id = (optionId ?? '').trim();
  const raw = options.find((row) => {
    if (!row || typeof row !== 'object') return false;
    return String((row as { id?: unknown }).id ?? '').trim() === id;
  }) as { lastMinuteBookings?: unknown; lastMinuteUntil?: unknown } | undefined;
  if (!raw || raw.lastMinuteBookings !== true) return off;
  return { enabled: true, until: isLastMinuteUntil(raw.lastMinuteUntil) ? raw.lastMinuteUntil : 'departure' };
}

export function lastMinuteLeadHours(until: LastMinuteUntil): number {
  if (until === '30m') return 0.5;
  if (until === '1h') return 1;
  return 0;
}

/** Paid and not cancelled. Pending checkout, holds, refunds, and failures do not qualify. */
export function isConfirmedPaidBooking(row: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  if ((row.status ?? '').trim().toLowerCase() === 'cancelled') return false;
  const pay = (row.payment_status ?? '').trim().toLowerCase();
  return pay === 'paid' || pay === 'complete' || pay === 'succeeded';
}

export function confirmedDepartureKey(date: string, startTimeHm: string, optionId: string): string {
  const day = date.trim().slice(0, 10);
  const hm = normalizeTourStartTimeHm(startTimeHm);
  return `${day}|${hm}|${optionId.trim()}`;
}

export function departureHasConfirmedPaidBooking(
  rows: Array<{
    status?: string | null;
    payment_status?: string | null;
    booking_date?: string | null;
    booking_option_id?: string | null;
    start_time?: string | null;
    purchase_snapshot?: unknown;
  }>,
  target: { date: string; startTimeHm: string; optionId: string }
): boolean {
  const want = confirmedDepartureKey(target.date, target.startTimeHm, target.optionId);
  return rows.some((row) => {
    if (!isConfirmedPaidBooking(row)) return false;
    const day = String(row.booking_date ?? '').slice(0, 10);
    const optionId = String(row.booking_option_id ?? '').trim();
    const hm = inventoryStartTimeHmFromBooking(row);
    return confirmedDepartureKey(day, hm, optionId) === want;
  });
}

/**
 * Standard cutoff first. After it, a departure stays bookable only when last-minute
 * is enabled, this exact departure already has a confirmed paid booking, and now
 * is still before the last-minute deadline (never after departure).
 */
export function evaluateDepartureBookingWindow(input: {
  bookingDate: string;
  startTimeHm: string;
  cutoffHoursBeforeStart?: number;
  nowMs?: number;
  timeZone?: string;
  lastMinuteEnabled?: boolean;
  lastMinuteUntil?: LastMinuteUntil | null;
  confirmedPaidOnDeparture?: boolean;
}): { ok: true } | { ok: false; code: 'past_start' | 'cutoff' | 'bad_time'; error: string } {
  const standard = assertDepartureStillBookable(input);
  if (standard.ok || standard.code !== 'cutoff') return standard.ok ? { ok: true } : standard;
  if (!input.lastMinuteEnabled || !input.confirmedPaidOnDeparture) return standard;
  const until = isLastMinuteUntil(input.lastMinuteUntil) ? input.lastMinuteUntil : 'departure';
  const startMs = wallTimeInZoneToUtcMs(input.bookingDate, input.startTimeHm, input.timeZone);
  if (startMs == null) {
    return { ok: false, code: 'bad_time', error: 'Choose a valid departure time.' };
  }
  const now = input.nowMs ?? Date.now();
  const deadline = startMs - lastMinuteLeadHours(until) * 60 * 60 * 1000;
  if (now >= startMs || now >= deadline) {
    return {
      ok: false,
      code: 'cutoff',
      error: 'This departure is no longer available for online booking. Choose a later date or time.',
    };
  }
  return { ok: true };
}
