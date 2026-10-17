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
}): IncomeEarningRow[] {
  const snaps = new Map(input.snapshots.map((row) => [row.booking_id, row]));
  const items = new Map(input.items.map((row) => [row.booking_id, row]));
  const rows: IncomeEarningRow[] = [];
  for (const booking of input.bookings) {
    const snapshot = snaps.get(booking.id) ?? null;
    const item = items.get(booking.id) ?? null;
    if (!snapshot && !item && !(Number(booking.amount_paid) > 0)) continue;
    const status: IncomeEarningStatus = item?.status ?? 'recorded';
    rows.push({
      bookingId: booking.id,
      reference: input.referenceLabel(booking),
      experience: input.experienceTitle(booking),
      activityDate: item?.experience_at?.slice(0, 10) || booking.booking_date || null,
      purchaseDate: booking.created_at?.slice(0, 10) || null,
      currency: (snapshot?.currency || item?.currency || booking.currency || 'EUR').toUpperCase(),
      netMinor: supplierNetMinor({
        snapshot,
        item,
        legacyAmountMajor: booking.amount_paid,
      }),
      grossMinor: snapshot ? Number(snapshot.remaining_gross_minor) || 0 : null,
      commissionMinor: snapshot ? Number(snapshot.remaining_commission_minor) || 0 : null,
      commissionBps: snapshot ? Number(snapshot.commission_bps) : null,
      status,
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
  if (status === 'paid') return paidAt ? 'Paid' : 'Recorded';
  if (status === 'processing') return 'Processing';
  if (status === 'failed') return 'Failed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'ready' || status === 'drafting') return 'Scheduled';
  if (status === 'pending') return 'Not paid out';
  return status;
}
