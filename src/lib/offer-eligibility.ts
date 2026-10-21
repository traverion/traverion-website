import { splitGrossByCommissionBps } from './commercial-money';
import { formatMoney } from './money';

/**
 * Supplier offers — single Discount period.
 *
 * `valid_from` / `valid_until` define which tour departures, stay nights, or
 * rental days receive the discount. Booking day does not matter. Older rows
 * that still carry `activity_*` (former service restriction) or only
 * `book_*` (former purchase window) are read via {@link offerDiscountPeriod}.
 * New saves write only `valid_*` and clear the legacy columns.
 *
 * Date checks are civil YYYY-MM-DD compares so a listing timezone's calendar
 * day is not shifted through UTC. Windows may run up to
 * {@link OFFER_BOOKING_WINDOW_MAX_DAYS} inclusive days.
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
  /** @deprecated Cleared on new saves; read only via {@link offerDiscountPeriod}. */
  book_from?: string | null;
  /** @deprecated Cleared on new saves; read only via {@link offerDiscountPeriod}. */
  book_until?: string | null;
  /** @deprecated Cleared on new saves; prefer valid_* when present. */
  activity_from?: string | null;
  /** @deprecated Cleared on new saves; prefer valid_* when present. */
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

/**
 * Resolved Discount period for a row.
 * Prefer former activity window when present (that was the service-date range),
 * else valid_*, else book_* for transitional rows.
 */
export function offerDiscountPeriod(row: OfferPriceRow): { from: string | null; until: string | null } {
  const activityFrom = civilDay(row.activity_from);
  if (activityFrom) {
    return { from: activityFrom, until: civilDay(row.activity_until) };
  }
  return {
    from: civilDay(row.valid_from) ?? civilDay(row.book_from),
    until: civilDay(row.valid_until) ?? civilDay(row.book_until),
  };
}

export function offerApplies(
  row: OfferPriceRow,
  ctx: { optionId: string | null; activityDay: string; bookingDay?: string }
): boolean {
  if (row.paused) return false;
  if (row.deleted_at) return false;
  const scope = (row.booking_option_id ?? '').trim();
  if (scope && scope !== (ctx.optionId ?? '')) return false;
  const limit = row.booking_limit;
  if (limit != null && limit > 0 && (row.redeemed_count ?? 0) >= limit) return false;

  const period = offerDiscountPeriod(row);
  return civilDayInRange(ctx.activityDay, period.from, period.until);
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

/** True when an offer's Discount period has ended (civil today after until). */
export function offerDiscountPeriodEnded(row: OfferPriceRow, todayIso: string): boolean {
  if (!ISO.test(todayIso)) return false;
  const { until } = offerDiscountPeriod(row);
  return Boolean(until && todayIso > until);
}

/** @deprecated Use {@link offerDiscountPeriodEnded}. */
export const offerPurchaseWindowEnded = offerDiscountPeriodEnded;

/**
 * Two offers conflict when they target the same bookable inventory and their
 * Discount periods overlap. Paused offers still reserve ranges. Deleted and
 * ended offers do not.
 */
export function supplierOffersOverlap(
  candidate: OfferPriceRow & { optionIds: string[] },
  other: OfferPriceRow,
  todayIso?: string,
  ignoreIds?: readonly string[]
): boolean {
  if (other.deleted_at) return false;
  if (todayIso && offerDiscountPeriodEnded(other, todayIso)) return false;
  if (candidate.id && other.id === candidate.id) return false;
  if (ignoreIds?.length && other.id && ignoreIds.includes(other.id)) return false;
  const a = offerDiscountPeriod(candidate);
  const b = offerDiscountPeriod(other);
  if (!windowsOverlap(a.from, a.until, b.from, b.until)) return false;
  const otherScope = (other.booking_option_id ?? '').trim();
  // Listing-wide other (or listing-wide candidate) conflicts with any selected option.
  if (!otherScope || candidate.optionIds.length === 0) return true;
  return candidate.optionIds.includes(otherScope);
}

export type OfferConflictHit = {
  other: OfferPriceRow;
  conflictingOptionIds: string[];
};

/** Conflicts for a candidate offer against existing rows (paused included; ended/deleted excluded). */
export function findSupplierOfferConflicts(
  candidate: OfferPriceRow & { optionIds: string[] },
  others: OfferPriceRow[],
  todayIso: string,
  ignoreIds: readonly string[] = []
): OfferConflictHit[] {
  const hits: OfferConflictHit[] = [];
  for (const other of others) {
    if (!supplierOffersOverlap(candidate, other, todayIso, ignoreIds)) continue;
    const otherScope = (other.booking_option_id ?? '').trim();
    const conflictingOptionIds =
      candidate.optionIds.length === 0
        ? otherScope
          ? [otherScope]
          : []
        : otherScope
          ? candidate.optionIds.filter((id) => id === otherScope)
          : [...candidate.optionIds];
    hits.push({ other, conflictingOptionIds });
  }
  return hits;
}

export function offerLifecycle(
  row: OfferPriceRow,
  todayIso: string,
  confirmedCount = 0
): OfferLifecycle {
  if (row.paused) return 'paused';
  const { from, until } = offerDiscountPeriod(row);
  if (until && todayIso > until) return 'ended';
  const limit = row.booking_limit;
  if (limit != null && limit > 0 && confirmedCount >= limit) return 'limit_reached';
  if (from && todayIso < from) return 'upcoming';
  return 'active';
}
