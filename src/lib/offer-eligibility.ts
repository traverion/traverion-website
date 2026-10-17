import { splitGrossByCommissionBps } from './commercial-money';
import { formatMoney } from './money';

/**
 * Supplier offers.
 *
 * Legacy rows (no book_from) keep the original rule: valid_from/valid_until
 * constrain the departure date. New rows store a booking window in
 * book_from/book_until and an optional activity window. Checkout and catalog
 * display both use this function. Date checks are civil YYYY-MM-DD string
 * compares so a listing timezone's calendar day is not shifted through UTC.
 *
 * Booking windows may run up to {@link OFFER_BOOKING_WINDOW_MAX_DAYS} inclusive
 * days. That cap is an application sanity bound, validated before insert.
 *
 * When several offers match, the lowest customer price wins. Equal prices
 * break toward the lexicographically smaller offer id. Offers never stack.
 */
export const OFFER_BOOKING_WINDOW_MAX_DAYS = 730;

export type OfferPriceRow = {
  id?: string | null;
  type: string;
  value: number;
  valid_from?: string | null;
  valid_until?: string | null;
  booking_option_id?: string | null;
  book_from?: string | null;
  book_until?: string | null;
  activity_from?: string | null;
  activity_until?: string | null;
  paused?: boolean | null;
  deleted_at?: string | null;
  booking_limit?: number | null;
  redeemed_count?: number | null;
};

export type OfferLifecycle = 'active' | 'upcoming' | 'paused' | 'ended' | 'limit_reached';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function civilDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return ISO.test(day) ? day : null;
}

export function civilDayInRange(day: string, from: string | null, until: string | null): boolean {
  if (!ISO.test(day)) return false;
  if (from && day < from) return false;
  if (until && day > until) return false;
  return true;
}

/** Inclusive civil-day count. Null when either side is not YYYY-MM-DD. */
export function inclusiveCivilDays(from: string, until: string): number | null {
  if (!ISO.test(from) || !ISO.test(until)) return null;
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = until.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000) + 1;
}

export function validateOfferDateWindow(from: string, until: string, label: string): string | null {
  const start = from.trim();
  const end = until.trim();
  if (!start || !end) return `Choose both ${label} dates.`;
  if (!ISO.test(start) || !ISO.test(end)) return `Enter ${label} dates as calendar days.`;
  if (end < start) return `${label[0].toUpperCase()}${label.slice(1)} end must be on or after the start.`;
  const days = inclusiveCivilDays(start, end);
  if (days == null || days < 1) return `Invalid ${label}.`;
  if (days > OFFER_BOOKING_WINDOW_MAX_DAYS) {
    return `${label[0].toUpperCase()}${label.slice(1)} can run at most ${OFFER_BOOKING_WINDOW_MAX_DAYS} days.`;
  }
  return null;
}

export function offerApplies(
  row: OfferPriceRow,
  ctx: { optionId: string | null; activityDay: string; bookingDay: string }
): boolean {
  if (row.paused) return false;
  if (row.deleted_at) return false;
  const scope = (row.booking_option_id ?? '').trim();
  if (scope && scope !== (ctx.optionId ?? '')) return false;
  const limit = row.booking_limit;
  if (limit != null && limit > 0 && (row.redeemed_count ?? 0) >= limit) return false;

  const bookFrom = civilDay(row.book_from);
  if (bookFrom) {
    if (!civilDayInRange(ctx.bookingDay, bookFrom, civilDay(row.book_until))) return false;
    const activityFrom = civilDay(row.activity_from);
    if (activityFrom && !civilDayInRange(ctx.activityDay, activityFrom, civilDay(row.activity_until))) {
      return false;
    }
    return true;
  }
  return civilDayInRange(ctx.activityDay, civilDay(row.valid_from), civilDay(row.valid_until));
}

function discountedUnit(base: number, row: OfferPriceRow): number {
  if (row.type === 'percent') {
    return Math.round(base * (1 - Number(row.value) / 100) * 100) / 100;
  }
  return Math.max(0, Math.round((base - Number(row.value)) * 100) / 100);
}

function discountLabel(row: OfferPriceRow, currency: string): string {
  if (row.type === 'percent') return `${row.value}% off`;
  return `${formatMoney(Number(row.value), currency)} off`;
}

/**
 * Single best customer price. Does not stack. Tie: lower price, then smaller id.
 */
export function bestCustomerDiscount<T extends OfferPriceRow>(
  base: number,
  rows: T[],
  currency = 'EUR'
): { price: number; label?: string; id: string | null; offer: T | null } {
  const full = Math.round(base * 100) / 100;
  if (!(base > 0) || rows.length === 0) return { price: full, id: null, offer: null };
  let price = full;
  let winner: T | null = null;
  for (const row of rows) {
    const next = discountedUnit(base, row);
    const cheaper = next < price - 0.0001;
    const tie =
      winner != null &&
      Math.abs(next - price) <= 0.0001 &&
      next < full - 0.0001 &&
      (row.id ?? '') !== '' &&
      (row.id ?? '') < (winner.id ?? '\uffff');
    if (cheaper || (winner == null && next < price - 0.0001) || tie) {
      price = next;
      winner = next < full - 0.0001 ? row : null;
    }
  }
  if (!winner) return { price: full, id: null, offer: null };
  return {
    price: Math.round(price * 100) / 100,
    label: discountLabel(winner, currency),
    id: winner.id ?? null,
    offer: winner,
  };
}

export function discountedCustomerMinor(originalMajor: number, percent: number): number {
  const major = Math.round(originalMajor * (1 - percent / 100) * 100) / 100;
  return Math.round(major * 100);
}

/** Estimated supplier net on one discounted unit. Uses the contractual bps split. */
export function estimatedSupplierEarningsMinor(
  originalMajor: number,
  percent: number,
  commissionBps: number
): number {
  return splitGrossByCommissionBps(discountedCustomerMinor(originalMajor, percent), commissionBps).supplierMinor;
}

export function windowsOverlap(
  aFrom: string | null | undefined,
  aUntil: string | null | undefined,
  bFrom: string | null | undefined,
  bUntil: string | null | undefined
): boolean {
  const as = civilDay(aFrom) ?? '0000-01-01';
  const ae = civilDay(aUntil) ?? '9999-12-31';
  const bs = civilDay(bFrom) ?? '0000-01-01';
  const be = civilDay(bUntil) ?? '9999-12-31';
  return as <= be && bs <= ae;
}

export function supplierOffersOverlap(
  candidate: OfferPriceRow & { optionIds: string[] },
  other: OfferPriceRow
): boolean {
  if (other.deleted_at) return false;
  if (candidate.id && other.id === candidate.id) return false;
  const booking = windowsOverlap(
    candidate.book_from ?? candidate.valid_from,
    candidate.book_until ?? candidate.valid_until,
    other.book_from ?? other.valid_from,
    other.book_until ?? other.valid_until
  );
  if (!booking) return false;
  const candidateActivity = civilDay(candidate.activity_from);
  const otherActivity = civilDay(other.activity_from);
  if (candidateActivity && otherActivity) {
    if (
      !windowsOverlap(
        candidate.activity_from,
        candidate.activity_until,
        other.activity_from,
        other.activity_until
      )
    ) {
      return false;
    }
  }
  const otherScope = (other.booking_option_id ?? '').trim();
  if (!otherScope || candidate.optionIds.length === 0) return true;
  return candidate.optionIds.includes(otherScope);
}

export function offerLifecycle(
  row: OfferPriceRow,
  todayIso: string,
  confirmedCount = 0
): OfferLifecycle {
  if (row.paused) return 'paused';
  const from = civilDay(row.book_from) ?? civilDay(row.valid_from);
  const until = civilDay(row.book_until) ?? civilDay(row.valid_until);
  if (until && todayIso > until) return 'ended';
  const limit = row.booking_limit;
  if (limit != null && limit > 0 && confirmedCount >= limit) return 'limit_reached';
  if (from && todayIso < from) return 'upcoming';
  return 'active';
}
