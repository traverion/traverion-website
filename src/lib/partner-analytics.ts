/**
 * Partner Analytics — shared metric definitions.
 * Money truth aligns with Income: isCollectedBooking + commercial snapshot remaining minors.
 * Stay service date = check-in (booking_date). Tours = departure booking_date.
 */

import { fromMinorUnits } from './commercial-money';
import { inventoryFamilyFromListing } from './inventory';
import { normalizeCurrency } from './money';
import { isCollectedBooking, isPaidPaymentStatus } from './payment-states';
import { displayListingTitleFromPurchase } from './purchase-snapshot';

export type AnalyticsSection = 'summary' | 'sales' | 'bookings' | 'customers' | 'score';
export type AnalyticsDateBasis = 'booking' | 'service';
export type AnalyticsProductType = 'all' | 'tour' | 'stay';
export type AnalyticsRangeKey =
  | '7d'
  | '30d'
  | '90d'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'all'
  | 'custom';

export const ANALYTICS_SECTIONS: { id: AnalyticsSection; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'sales', label: 'Sales' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'customers', label: 'Customers' },
  { id: 'score', label: 'Supplier Score' },
];

export const ANALYTICS_RANGE_OPTIONS: { id: AnalyticsRangeKey; label: string }[] = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_year', label: 'This year' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom range' },
];

export type AnalyticsBookingInput = {
  id: string;
  listing_id: string;
  guests?: number | null;
  booking_date?: string | null;
  check_out?: string | null;
  created_at?: string | null;
  status?: string | null;
  payment_status?: string | null;
  amount_paid?: number | string | null;
  currency?: string | null;
  refund_choice?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  purchase_snapshot?: unknown;
};

export type AnalyticsSnapshotInput = {
  booking_id: string;
  currency: string;
  remaining_gross_minor: number;
  remaining_commission_minor: number;
  remaining_supplier_minor: number;
  commission_bps: number;
};

export type AnalyticsListingMeta = {
  id: string;
  title: string;
  family: 'tour' | 'stay' | 'other';
};

export type AnalyticsMoneySplit = {
  currency: string;
  gross: number;
  commission: number;
  net: number;
  bookings: number;
  guests: number;
};

export type AnalyticsListingRow = {
  listingId: string;
  title: string;
  productType: 'Tour' | 'Stay' | 'Listing';
  currency: string;
  bookings: number;
  guests: number;
  gross: number;
  commission: number;
  net: number;
  shareOfNet: number;
  cancellations: number;
  cancellationRate: number | null;
};

export type AnalyticsSeriesPoint = {
  key: string;
  label: string;
  gross: number;
  commission: number;
  net: number;
  bookings: number;
};

export type LeadTimeBucket =
  | 'same_day'
  | '1_3'
  | '4_7'
  | '8_14'
  | '15_30'
  | '30_plus'
  | 'unknown';

export const LEAD_TIME_LABELS: Record<LeadTimeBucket, string> = {
  same_day: 'Same day',
  '1_3': '1–3 days',
  '4_7': '4–7 days',
  '8_14': '8–14 days',
  '15_30': '15–30 days',
  '30_plus': 'More than 30 days',
  unknown: 'Unknown',
};

export type PartySizeBucket = '1' | '2' | '3_4' | '5_8' | '9_plus';

export const PARTY_SIZE_LABELS: Record<PartySizeBucket, string> = {
  '1': '1 guest',
  '2': '2 guests',
  '3_4': '3–4 guests',
  '5_8': '5–8 guests',
  '9_plus': '9+ guests',
};

export function parseAnalyticsSection(raw: string | null): AnalyticsSection {
  if (raw === 'sales' || raw === 'bookings' || raw === 'customers' || raw === 'score') return raw;
  if (raw === 'summary' || raw === 'overview') return 'summary';
  return 'summary';
}

export function parseAnalyticsRange(raw: string | null): AnalyticsRangeKey {
  const keys: AnalyticsRangeKey[] = [
    '7d',
    '30d',
    '90d',
    'this_month',
    'last_month',
    'this_year',
    'all',
    'custom',
  ];
  return keys.includes(raw as AnalyticsRangeKey) ? (raw as AnalyticsRangeKey) : '30d';
}

export function parseAnalyticsBasis(raw: string | null): AnalyticsDateBasis {
  return raw === 'service' ? 'service' : 'booking';
}

export function parseAnalyticsProductType(raw: string | null): AnalyticsProductType {
  if (raw === 'tour' || raw === 'stay') return raw;
  return 'all';
}

/** Inclusive local calendar range as ISO date strings (YYYY-MM-DD). */
export function resolveAnalyticsDateRange(
  key: AnalyticsRangeKey,
  customFrom: string | null,
  customTo: string | null,
  now = new Date()
): { from: string | null; to: string | null; label: string } {
  const ymd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const labelOf = ANALYTICS_RANGE_OPTIONS.find((o) => o.id === key)?.label ?? 'Selected range';

  if (key === 'all') return { from: null, to: null, label: labelOf };
  if (key === 'custom') {
    const from = customFrom && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) ? customFrom : null;
    const to = customTo && /^\d{4}-\d{2}-\d{2}$/.test(customTo) ? customTo : null;
    return { from, to, label: from && to ? `${from} → ${to}` : 'Custom range' };
  }
  if (key === 'this_month') {
    const from = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
    return { from, to: ymd(today), label: labelOf };
  }
  if (key === 'last_month') {
    const from = ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    const to = ymd(new Date(today.getFullYear(), today.getMonth(), 0));
    return { from, to, label: labelOf };
  }
  if (key === 'this_year') {
    const from = ymd(new Date(today.getFullYear(), 0, 1));
    return { from, to: ymd(today), label: labelOf };
  }
  const days = key === '7d' ? 7 : key === '90d' ? 90 : 30;
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  return { from: ymd(fromDate), to: ymd(today), label: labelOf };
}

/** Previous period of equal length ending the day before `from`. */
export function previousAnalyticsRange(from: string | null, to: string | null): {
  from: string | null;
  to: string | null;
} {
  if (!from || !to) return { from: null, to: null };
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { from: null, to: null };
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return { from: ymd(prevStart), to: ymd(prevEnd) };
}

export function bookingAttributionDate(
  booking: AnalyticsBookingInput,
  basis: AnalyticsDateBasis
): string | null {
  if (basis === 'service') {
    const service = (booking.booking_date ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(service) ? service : null;
  }
  const created = (booking.created_at ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(created) ? created : null;
}

export function bookingInDateRange(
  booking: AnalyticsBookingInput,
  basis: AnalyticsDateBasis,
  from: string | null,
  to: string | null
): boolean {
  const day = bookingAttributionDate(booking, basis);
  if (!day) return from == null && to == null;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function moneyForBooking(
  booking: AnalyticsBookingInput,
  snapshot: AnalyticsSnapshotInput | null | undefined
): { currency: string; gross: number; commission: number; net: number } {
  const currency = normalizeCurrency(snapshot?.currency || booking.currency);
  if (snapshot) {
    return {
      currency,
      gross: fromMinorUnits(Number(snapshot.remaining_gross_minor) || 0),
      commission: fromMinorUnits(Number(snapshot.remaining_commission_minor) || 0),
      net: fromMinorUnits(Number(snapshot.remaining_supplier_minor) || 0),
    };
  }
  const paid = Number(booking.amount_paid ?? 0);
  const legacy = Number.isFinite(paid) && paid > 0 ? paid : 0;
  return { currency, gross: legacy, commission: 0, net: legacy };
}

export function listingFamilyLabel(
  listing: AnalyticsListingMeta | undefined
): 'Tour' | 'Stay' | 'Listing' {
  if (!listing) return 'Listing';
  if (listing.family === 'stay') return 'Stay';
  if (listing.family === 'tour') return 'Tour';
  return 'Listing';
}

export function listingMetaFromPackage(listing: {
  id: string;
  title?: string | null;
  experience_kind?: string | null;
  inventory_family?: string | null;
  listing_type?: string | null;
}): AnalyticsListingMeta {
  const familyRaw = inventoryFamilyFromListing(listing as never);
  const family = familyRaw === 'stay' ? 'stay' : familyRaw === 'tour' ? 'tour' : 'other';
  return {
    id: listing.id,
    title: (listing.title ?? '').trim() || 'Untitled listing',
    family,
  };
}

export function filterAnalyticsBookings(input: {
  bookings: AnalyticsBookingInput[];
  listingsById: Record<string, AnalyticsListingMeta>;
  from: string | null;
  to: string | null;
  basis: AnalyticsDateBasis;
  productType: AnalyticsProductType;
  listingId: string | null;
  collectedOnly?: boolean;
}): AnalyticsBookingInput[] {
  const collectedOnly = input.collectedOnly !== false;
  return input.bookings.filter((booking) => {
    if (collectedOnly && !isCollectedBooking(booking)) return false;
    if (input.listingId && booking.listing_id !== input.listingId) return false;
    if (input.productType !== 'all') {
      const meta = input.listingsById[booking.listing_id];
      if (!meta || meta.family !== input.productType) return false;
    }
    return bookingInDateRange(booking, input.basis, input.from, input.to);
  });
}

export function aggregateMoneyByCurrency(
  bookings: AnalyticsBookingInput[],
  snapshotsByBookingId: Record<string, AnalyticsSnapshotInput>
): AnalyticsMoneySplit[] {
  const map = new Map<string, AnalyticsMoneySplit>();
  for (const booking of bookings) {
    const money = moneyForBooking(booking, snapshotsByBookingId[booking.id]);
    const cur = map.get(money.currency) ?? {
      currency: money.currency,
      gross: 0,
      commission: 0,
      net: 0,
      bookings: 0,
      guests: 0,
    };
    cur.gross += money.gross;
    cur.commission += money.commission;
    cur.net += money.net;
    cur.bookings += 1;
    const guests = Number(booking.guests);
    cur.guests += Number.isFinite(guests) && guests > 0 ? guests : 0;
    map.set(money.currency, cur);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

export function aggregateListingRows(input: {
  bookings: AnalyticsBookingInput[];
  snapshotsByBookingId: Record<string, AnalyticsSnapshotInput>;
  listingsById: Record<string, AnalyticsListingMeta>;
  cancelledInWindow?: AnalyticsBookingInput[];
}): AnalyticsListingRow[] {
  type Acc = Omit<AnalyticsListingRow, 'shareOfNet' | 'cancellationRate'> & {
    cancellations: number;
  };
  const map = new Map<string, Acc>();
  for (const booking of input.bookings) {
    const money = moneyForBooking(booking, input.snapshotsByBookingId[booking.id]);
    const key = `${booking.listing_id}::${money.currency}`;
    const meta = input.listingsById[booking.listing_id];
    const title = displayListingTitleFromPurchase(
      booking.purchase_snapshot as never,
      meta?.title,
      'Removed listing'
    );
    const cur = map.get(key) ?? {
      listingId: booking.listing_id,
      title,
      productType: listingFamilyLabel(meta),
      currency: money.currency,
      bookings: 0,
      guests: 0,
      gross: 0,
      commission: 0,
      net: 0,
      cancellations: 0,
    };
    cur.bookings += 1;
    const guests = Number(booking.guests);
    cur.guests += Number.isFinite(guests) && guests > 0 ? guests : 0;
    cur.gross += money.gross;
    cur.commission += money.commission;
    cur.net += money.net;
    map.set(key, cur);
  }
  for (const booking of input.cancelledInWindow ?? []) {
    const currency = normalizeCurrency(booking.currency);
    const key = `${booking.listing_id}::${currency}`;
    const cur = map.get(key);
    if (cur) cur.cancellations += 1;
  }
  const rows = [...map.values()];
  const netByCurrency = new Map<string, number>();
  for (const row of rows) {
    netByCurrency.set(row.currency, (netByCurrency.get(row.currency) ?? 0) + row.net);
  }
  return rows
    .map((row) => {
      const total = netByCurrency.get(row.currency) ?? 0;
      const denom = row.bookings + row.cancellations;
      return {
        ...row,
        shareOfNet: total > 0 ? row.net / total : 0,
        cancellationRate: denom > 0 ? row.cancellations / denom : null,
      };
    })
    .sort((a, b) => b.net - a.net);
}

export type ChartGrain = 'day' | 'week' | 'month' | 'year';

function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Choose chart grain from the selected period and/or actual span.
 * All-time must adapt to real data span — never assume 365 days (that forced
 * monthly buckets and collapsed same-month history into one "Oct 26" = Oct 2026 label).
 */
export function chooseChartGrain(spanDays: number, rangeKey?: AnalyticsRangeKey | null): ChartGrain {
  if (rangeKey === '7d' || rangeKey === '30d' || rangeKey === 'this_month' || rangeKey === 'last_month') {
    return 'day';
  }
  if (rangeKey === '90d') return 'week';
  if (rangeKey === 'this_year') return 'month';
  if (spanDays <= 45) return 'day';
  if (spanDays <= 180) return 'week';
  if (spanDays <= 800) return 'month';
  return 'year';
}

export function chartBucketForDay(day: string, grain: ChartGrain): { key: string; label: string } {
  const d = new Date(`${day}T12:00:00`);
  if (grain === 'day') {
    return {
      key: day,
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    };
  }
  if (grain === 'week') {
    const weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    return {
      key: ymdLocal(weekStart),
      label: `Week of ${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
    };
  }
  if (grain === 'month') {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      key,
      label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
    };
  }
  const key = String(d.getFullYear());
  return { key, label: key };
}

function advanceBucketCursor(cursor: Date, grain: ChartGrain): void {
  if (grain === 'day') cursor.setDate(cursor.getDate() + 1);
  else if (grain === 'week') cursor.setDate(cursor.getDate() + 7);
  else if (grain === 'month') cursor.setMonth(cursor.getMonth() + 1);
  else cursor.setFullYear(cursor.getFullYear() + 1);
}

export function buildEarningsSeries(input: {
  bookings: AnalyticsBookingInput[];
  snapshotsByBookingId: Record<string, AnalyticsSnapshotInput>;
  basis: AnalyticsDateBasis;
  from: string | null;
  to: string | null;
  currency: string;
  rangeKey?: AnalyticsRangeKey | null;
  /** Fill zero-value buckets across the continuous range when bounds are known. */
  fillZeros?: boolean;
}): AnalyticsSeriesPoint[] {
  const currency = normalizeCurrency(input.currency);
  const buckets = new Map<string, AnalyticsSeriesPoint>();

  const attributedDays: string[] = [];
  for (const booking of input.bookings) {
    const money = moneyForBooking(booking, input.snapshotsByBookingId[booking.id]);
    if (money.currency !== currency) continue;
    const day = bookingAttributionDate(booking, input.basis);
    if (!day) continue;
    attributedDays.push(day);
  }

  attributedDays.sort();
  const dataFrom = attributedDays[0] ?? input.from;
  const dataTo = attributedDays[attributedDays.length - 1] ?? input.to;
  const boundFrom = input.from ?? dataFrom;
  const boundTo = input.to ?? dataTo;
  const spanDays =
    boundFrom && boundTo
      ? daysBetweenInclusive(boundFrom, boundTo)
      : attributedDays.length > 1
        ? daysBetweenInclusive(attributedDays[0], attributedDays[attributedDays.length - 1])
        : 1;
  const grain = chooseChartGrain(spanDays, input.rangeKey);

  for (const booking of input.bookings) {
    const money = moneyForBooking(booking, input.snapshotsByBookingId[booking.id]);
    if (money.currency !== currency) continue;
    const day = bookingAttributionDate(booking, input.basis);
    if (!day) continue;
    const { key, label } = chartBucketForDay(day, grain);
    const cur = buckets.get(key) ?? { key, label, gross: 0, commission: 0, net: 0, bookings: 0 };
    cur.gross += money.gross;
    cur.commission += money.commission;
    cur.net += money.net;
    cur.bookings += 1;
    buckets.set(key, cur);
  }

  if (buckets.size === 0) return [];

  const shouldFill =
    input.fillZeros !== false &&
    boundFrom &&
    boundTo &&
    /^\d{4}-\d{2}-\d{2}$/.test(boundFrom) &&
    /^\d{4}-\d{2}-\d{2}$/.test(boundTo);

  if (shouldFill) {
    const startMeta = chartBucketForDay(boundFrom, grain);
    const endMeta = chartBucketForDay(boundTo, grain);
    const cursor = new Date(`${startMeta.key.length === 4 ? `${startMeta.key}-01-01` : startMeta.key.length === 7 ? `${startMeta.key}-01` : startMeta.key}T12:00:00`);
    const end = new Date(`${endMeta.key.length === 4 ? `${endMeta.key}-01-01` : endMeta.key.length === 7 ? `${endMeta.key}-01` : endMeta.key}T12:00:00`);
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard < 800) {
      const day = ymdLocal(cursor);
      const { key, label } = chartBucketForDay(day, grain);
      if (!buckets.has(key)) {
        buckets.set(key, { key, label, gross: 0, commission: 0, net: 0, bookings: 0 });
      }
      advanceBucketCursor(cursor, grain);
      guard += 1;
    }
  }

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  if (!Number.isFinite(current)) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function leadTimeBucketDays(days: number | null): LeadTimeBucket {
  if (days == null || !Number.isFinite(days) || days < 0) return 'unknown';
  if (days < 1) return 'same_day';
  if (days <= 3) return '1_3';
  if (days <= 7) return '4_7';
  if (days <= 14) return '8_14';
  if (days <= 30) return '15_30';
  return '30_plus';
}

/** Days between booking created_at and service date (check-in / departure). */
export function bookingLeadTimeDays(booking: AnalyticsBookingInput): number | null {
  const created = booking.created_at ? new Date(booking.created_at) : null;
  const serviceRaw = (booking.booking_date ?? '').slice(0, 10);
  if (!created || !/^\d{4}-\d{2}-\d{2}$/.test(serviceRaw) || Number.isNaN(created.getTime())) {
    return null;
  }
  const service = new Date(`${serviceRaw}T12:00:00`);
  const createdDay = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const serviceDay = new Date(service.getFullYear(), service.getMonth(), service.getDate());
  return Math.round((serviceDay.getTime() - createdDay.getTime()) / 86_400_000);
}

export function aggregateLeadTimes(bookings: AnalyticsBookingInput[]): {
  bucket: LeadTimeBucket;
  label: string;
  count: number;
}[] {
  const counts: Record<LeadTimeBucket, number> = {
    same_day: 0,
    '1_3': 0,
    '4_7': 0,
    '8_14': 0,
    '15_30': 0,
    '30_plus': 0,
    unknown: 0,
  };
  for (const booking of bookings) {
    counts[leadTimeBucketDays(bookingLeadTimeDays(booking))] += 1;
  }
  return (Object.keys(LEAD_TIME_LABELS) as LeadTimeBucket[])
    .filter((bucket) => bucket !== 'unknown' || counts.unknown > 0)
    .map((bucket) => ({ bucket, label: LEAD_TIME_LABELS[bucket], count: counts[bucket] }));
}

export function partySizeBucket(guests: number): PartySizeBucket {
  if (guests <= 1) return '1';
  if (guests === 2) return '2';
  if (guests <= 4) return '3_4';
  if (guests <= 8) return '5_8';
  return '9_plus';
}

export function aggregatePartySizes(bookings: AnalyticsBookingInput[]): {
  bucket: PartySizeBucket;
  label: string;
  count: number;
}[] {
  const counts: Record<PartySizeBucket, number> = {
    '1': 0,
    '2': 0,
    '3_4': 0,
    '5_8': 0,
    '9_plus': 0,
  };
  for (const booking of bookings) {
    const g = Number(booking.guests);
    counts[partySizeBucket(Number.isFinite(g) && g > 0 ? g : 1)] += 1;
  }
  return (Object.keys(PARTY_SIZE_LABELS) as PartySizeBucket[]).map((bucket) => ({
    bucket,
    label: PARTY_SIZE_LABELS[bucket],
    count: counts[bucket],
  }));
}

export function isSupplierInitiatedCancel(booking: AnalyticsBookingInput): boolean {
  const reason = (booking.cancellation_reason ?? '').trim().toLowerCase();
  if (!reason) return false;
  return (
    reason.includes('supplier') ||
    reason.includes('host') ||
    reason.includes('operator') ||
    reason.startsWith('partner_') ||
    reason === 'unpaid_release'
  );
}

export function cancellationStats(input: {
  paidBookings: AnalyticsBookingInput[];
  allBookingsInWindow: AnalyticsBookingInput[];
}): {
  cancelled: number;
  supplierCancelled: number;
  customerCancelled: number;
  rate: number | null;
} {
  const cancelled = input.allBookingsInWindow.filter(
    (b) => (b.status ?? '').trim().toLowerCase() === 'cancelled' && isPaidPaymentStatus(b.payment_status)
  );
  const supplierCancelled = cancelled.filter(isSupplierInitiatedCancel).length;
  const customerCancelled = cancelled.length - supplierCancelled;
  const denom = input.paidBookings.length + cancelled.length;
  return {
    cancelled: cancelled.length,
    supplierCancelled,
    customerCancelled,
    rate: denom > 0 ? cancelled.length / denom : null,
  };
}

export function averageLeadTimeDays(bookings: AnalyticsBookingInput[]): number | null {
  const values = bookings
    .map(bookingLeadTimeDays)
    .filter((d): d is number => d != null && Number.isFinite(d) && d >= 0);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function busiestBookingDay(
  bookings: AnalyticsBookingInput[],
  basis: AnalyticsDateBasis
): { day: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const booking of bookings) {
    const day = bookingAttributionDate(booking, basis);
    if (!day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let best: { day: string; count: number } | null = null;
  for (const [day, count] of counts) {
    if (!best || count > best.count) best = { day, count };
  }
  return best;
}

export function completedServiceCount(
  bookings: AnalyticsBookingInput[],
  now = new Date()
): number {
  const today = now.toISOString().slice(0, 10);
  return bookings.filter((booking) => {
    if (!isCollectedBooking(booking)) return false;
    if ((booking.status ?? '').trim().toLowerCase() === 'cancelled') return false;
    const service = (booking.booking_date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(service)) return false;
    const end = (booking.check_out ?? service).slice(0, 10);
    return end <= today;
  }).length;
}
