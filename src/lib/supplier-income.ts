import { fromMinorUnits, formatBpsAsPercent, splitGrossByCommissionBps } from './commercial-money';

/** Lifecycle of one booking's supplier entitlement. Paid means allocated as paid in records, not a bank receipt by itself. */
export type IncomeEarningStatus = 'pending' | 'eligible' | 'included' | 'paid' | 'reversed' | 'recorded';

export type IncomeEarningRow = {
  bookingId: string;
  reference: string;
  experience: string;
  activityDate: string | null;
  purchaseDate: string | null;
  currency: string;
  /** Net supplier entitlement in minor units. Never the customer gross. */
  netMinor: number;
  grossMinor: number | null;
  commissionMinor: number | null;
  commissionBps: number | null;
  status: IncomeEarningStatus;
  /** Active financial hold blocks automatic payout eligibility. */
  held?: boolean;
  holdReason?: string | null;
};

export type IncomeBookingInput = {
  id: string;
  currency?: string | null;
  amount_paid?: number | null;
  booking_date?: string | null;
  created_at?: string | null;
  listing_id?: string | null;
  guest_name?: string | null;
  public_reference?: string | null;
  booking_number?: number | null;
};

export type IncomeSnapshotInput = {
  booking_id: string;
  currency: string;
  gross_minor: number;
  commission_minor: number;
  supplier_minor: number;
  remaining_gross_minor: number;
  remaining_commission_minor: number;
  remaining_supplier_minor: number;
  commission_bps: number;
};

export type IncomeItemInput = {
  booking_id: string;
  currency: string;
  amount_minor: number;
  status: 'pending' | 'eligible' | 'included' | 'paid' | 'reversed';
  experience_at?: string | null;
  sold_at?: string | null;
  service_completed_at?: string | null;
  gross_minor?: number | null;
  commission_minor?: number | null;
  commission_bps?: number | null;
};

export function maskIban(iban: string | null | undefined): string {
  const compact = (iban ?? '').replace(/\s+/g, '').toUpperCase();
  if (!compact) return '';
  if (compact.length < 8) return '••••';
  return `•••• ${compact.slice(-4)}`;
}

export function earningStatusLabel(status: IncomeEarningStatus): string {
  if (status === 'pending') return 'Pending';
  if (status === 'eligible') return 'Available';
  if (status === 'included') return 'Processing';
  if (status === 'paid') return 'Paid out';
  if (status === 'reversed') return 'Reversed';
  return 'Recorded';
}

/**
 * Net the supplier sees. Uses the frozen remaining split when a snapshot exists.
 * Bookings from before the commercial engine have no snapshot and stay at the recorded 0% legacy entitlement.
 */
export function supplierNetMinor(input: {
  snapshot?: IncomeSnapshotInput | null;
  item?: IncomeItemInput | null;
  legacyAmountMajor?: number | null;
}): number {
  if (input.item?.status === 'reversed') return 0;
  if (input.snapshot) return Math.max(0, Number(input.snapshot.remaining_supplier_minor) || 0);
  if (input.item) return Math.max(0, Number(input.item.amount_minor) || 0);
  const major = Number(input.legacyAmountMajor ?? 0);
  if (!Number.isFinite(major) || major <= 0) return 0;
  return Math.round(major * 100);
}

export function buildIncomeEarningRows(input: {
  bookings: IncomeBookingInput[];
  snapshots: IncomeSnapshotInput[];
  items: IncomeItemInput[];
  experienceTitle: (booking: IncomeBookingInput) => string;
  referenceLabel: (booking: IncomeBookingInput) => string;
  holds?: Array<{ booking_id: string; reason_code?: string | null; active?: boolean }>;
}): IncomeEarningRow[] {
  const snaps = new Map(input.snapshots.map((row) => [row.booking_id, row]));
  const items = new Map(input.items.map((row) => [row.booking_id, row]));
  const holdByBooking = new Map(
    (input.holds ?? [])
      .filter((hold) => hold.active !== false)
      .map((hold) => [hold.booking_id, hold.reason_code ?? 'hold'])
  );
  const rows: IncomeEarningRow[] = [];
  for (const booking of input.bookings) {
    const snapshot = snaps.get(booking.id) ?? null;
    const item = items.get(booking.id) ?? null;
    if (!snapshot && !item && !(Number(booking.amount_paid) > 0)) continue;
    const status: IncomeEarningStatus = item?.status ?? 'recorded';
    const holdReason = holdByBooking.get(booking.id) ?? null;
    rows.push({
      bookingId: booking.id,
      reference: input.referenceLabel(booking),
      experience: input.experienceTitle(booking),
      activityDate:
        item?.service_completed_at?.slice(0, 10) ||
        item?.experience_at?.slice(0, 10) ||
        booking.booking_date ||
        null,
      purchaseDate: item?.sold_at?.slice(0, 10) || booking.created_at?.slice(0, 10) || null,
      currency: (snapshot?.currency || item?.currency || booking.currency || 'EUR').toUpperCase(),
      netMinor: supplierNetMinor({
        snapshot,
        item,
        legacyAmountMajor: booking.amount_paid,
      }),
      grossMinor: snapshot
        ? Number(snapshot.remaining_gross_minor) || 0
        : item?.gross_minor != null
          ? Number(item.gross_minor)
          : null,
      commissionMinor: snapshot
        ? Number(snapshot.remaining_commission_minor) || 0
        : item?.commission_minor != null
          ? Number(item.commission_minor)
          : null,
      commissionBps: snapshot
        ? Number(snapshot.commission_bps)
        : item?.commission_bps != null
          ? Number(item.commission_bps)
          : null,
      status,
      held: Boolean(holdReason),
      holdReason,
    });
  }
  return rows;
}

export function sumNetMinor(rows: IncomeEarningRow[], currency: string, statuses?: IncomeEarningStatus[]): number {
  const cur = currency.toUpperCase();
  return rows.reduce((sum, row) => {
    if (row.currency !== cur) return sum;
    if (statuses && !statuses.includes(row.status)) return sum;
    return sum + row.netMinor;
  }, 0);
}

/** Documented floor split. Used by tests and statement checks, not as a replacement for a stored snapshot. */
export function expectedSplit(grossMinor: number, commissionBps: number) {
  return splitGrossByCommissionBps(grossMinor, commissionBps);
}

export function formatMinorMoney(minor: number, currency: string): string {
  return `${currency.toUpperCase()} ${fromMinorUnits(minor).toFixed(2)}`;
}

export function commissionPercentLabel(bps: number | null): string | null {
  if (bps == null || !Number.isInteger(bps)) return null;
  return formatBpsAsPercent(bps);
}

/**
 * A payout may be described as paid only when the record has a completion timestamp.
 * Status text alone is not transfer evidence.
 */
export function payoutMaySayPaid(status: string, paidAt: string | null | undefined): boolean {
  return status === 'paid' && Boolean(paidAt);
}

export function payoutPresentationStatus(status: string, paidAt: string | null | undefined): string {
  // READY/drafting are internal preparation — never imply a bank transfer completed.
  if (status === 'paid') return paidAt ? 'Paid' : 'Recorded (unconfirmed)';
  if (status === 'processing') return 'Processing';
  if (status === 'failed') return 'Failed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'ready') return 'Prepared';
  if (status === 'drafting') return 'Drafting';
  if (status === 'pending') return 'Not paid out';
  return status;
}

/** Financial reporting period aligned to supplier cadence (sale or earnings window). */
export type IncomeReportPeriod = {
  id: string;
  label: string;
  fromIso: string;
  toIso: string;
  rangeLabel: string;
};

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

function addUtcMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

/**
 * Build historical + current periods for the Overview selector.
 * Monthly: calendar months. Semimonthly: 1–14 and 15–end.
 */
export function buildIncomeReportPeriods(
  cadence: string | null | undefined,
  now: Date = new Date(),
  count = 18
): IncomeReportPeriod[] {
  const monthly = (cadence ?? 'monthly').toLowerCase() !== 'semimonthly';
  const periods: IncomeReportPeriod[] = [];
  const cursor = startOfUtcMonth(now.getUTCFullYear(), now.getUTCMonth());

  if (monthly) {
    for (let i = 0; i < count; i += 1) {
      const start = addUtcMonths(cursor, -i);
      const end = addUtcMonths(start, 1);
      const id = ymdUtc(start).slice(0, 7);
      const label = start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      periods.push({
        id,
        label,
        fromIso: start.toISOString(),
        toIso: end.toISOString(),
        rangeLabel: `${ymdUtc(start)} – ${ymdUtc(new Date(end.getTime() - 86400000))}`,
      });
    }
    return periods;
  }

  // Semimonthly: walk half-months backward from the current half.
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let half: 0 | 1 = now.getUTCDate() < 15 ? 0 : 1;
  for (let i = 0; i < count; i += 1) {
    const start =
      half === 0
        ? new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
        : new Date(Date.UTC(year, month, 15, 0, 0, 0, 0));
    const end =
      half === 0
        ? new Date(Date.UTC(year, month, 15, 0, 0, 0, 0))
        : addUtcMonths(new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)), 1);
    const id = `${ymdUtc(start)}_${half === 0 ? 'a' : 'b'}`;
    const label =
      half === 0
        ? `${start.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })} · 1–14`
        : `${start.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })} · 15–end`;
    periods.push({
      id,
      label,
      fromIso: start.toISOString(),
      toIso: end.toISOString(),
      rangeLabel: `${ymdUtc(start)} – ${ymdUtc(new Date(end.getTime() - 86400000))}`,
    });
    if (half === 0) {
      half = 1;
      month -= 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
    } else {
      half = 0;
    }
  }
  return periods;
}

/** Status explanation for earnings drawer / table. */
export function earningStatusExplanation(status: IncomeEarningStatus): string {
  if (status === 'pending') {
    return 'Sold or awaiting service completion and clearance. Not yet eligible for a payout period.';
  }
  if (status === 'eligible') {
    return 'Service completed and cleared. Eligible to be included in the next prepared payout period.';
  }
  if (status === 'included') {
    return 'Included in a prepared payout period. Not a bank transfer confirmation.';
  }
  if (status === 'paid') {
    return 'Recorded as paid in Traverion records when a confirmation reference exists.';
  }
  if (status === 'reversed') {
    return 'Reversed after cancellation or refund. No longer payable.';
  }
  return 'Recorded from booking history. A frozen commercial split may still be missing.';
}
