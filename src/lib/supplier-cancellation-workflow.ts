import {
  isForceMajeureReason,
  supplierCancellationFeeEur,
  supplierPaidCancellationBlock,
  type SupplierPaidCancellationBlock,
} from './cancellation-policy';
import { isPaidPaymentStatus } from './payment-states';
import { partnerBookingIsUnpaidCheckout } from './trip-views';

export const CANCELLATION_BATCH_LIMIT = 40;

export type CancellationFamily = 'tour' | 'stay' | 'rental';

export type CancellationCandidate = {
  id: string;
  reference: string;
  guestName: string;
  guestEmail: string;
  guests: number;
  status: string;
  paymentStatus: string;
  amountPaid: number;
  currency: string;
  listingId: string;
  listingTitle: string;
  optionId: string;
  optionLabel: string;
  family: CancellationFamily;
  date: string;
  startHm: string;
  bookingNumber: number | null;
  /** Paid supplier cancellation is allowed by the existing rule. */
  eligiblePaid: boolean;
  /** Unpaid hold can be released one at a time. Not part of the paid batch. */
  eligibleUnpaid: boolean;
  blockReason: string;
};

export type CancellationFilters = {
  query: string;
  family: '' | CancellationFamily;
  listingId: string;
  optionId: string;
  dateFrom: string;
  dateTo: string;
  startHm: string;
  status: '' | 'paid' | 'unpaid' | 'confirmed' | 'pending';
};

export const EMPTY_CANCELLATION_FILTERS: CancellationFilters = {
  query: '',
  family: '',
  listingId: '',
  optionId: '',
  dateFrom: '',
  dateTo: '',
  startHm: '',
  status: '',
};

export function supplierCancellationExplanationMin(reasonCode: string): number {
  return isForceMajeureReason(reasonCode) ? 24 : 12;
}

export function supplierCancellationExplanationReady(reasonCode: string, explanation: string): boolean {
  return explanation.trim().length >= supplierCancellationExplanationMin(reasonCode);
}

export function cancellationDepartureKey(row: Pick<
  CancellationCandidate,
  'listingId' | 'optionId' | 'date' | 'startHm'
>): string {
  return [row.listingId, row.optionId, row.date, row.startHm].join('|');
}

export function cancellationBlockReason(row: {
  status?: string | null;
  payment_status?: string | null;
}): string {
  const block: SupplierPaidCancellationBlock = supplierPaidCancellationBlock(row);
  if (block === 'refunded') return 'Already refunded';
  if (block === 'cancelled') return 'Already cancelled';
  if (partnerBookingIsUnpaidCheckout(row)) return '';
  if (block === 'unpaid') return 'Not a paid booking';
  return '';
}

export function buildCancellationCandidate(input: {
  id: string;
  reference: string;
  guestName?: string | null;
  guestEmail?: string | null;
  guests?: number | null;
  status?: string | null;
  paymentStatus?: string | null;
  amountPaid?: number | null;
  currency?: string | null;
  listingId: string;
  listingTitle: string;
  optionId?: string | null;
  optionLabel?: string | null;
  family: CancellationFamily;
  date?: string | null;
  startHm?: string | null;
  bookingNumber?: number | null;
}): CancellationCandidate {
  const paymentStatus = String(input.paymentStatus ?? '');
  const status = String(input.status ?? '');
  const paidBlock = supplierPaidCancellationBlock({ status, payment_status: paymentStatus });
  const eligiblePaid = paidBlock === 'none' && isPaidPaymentStatus(paymentStatus);
  const eligibleUnpaid = partnerBookingIsUnpaidCheckout({ status, payment_status: paymentStatus });
  const amount = Number(input.amountPaid);
  return {
    id: input.id,
    reference: input.reference,
    guestName: (input.guestName ?? '').trim() || 'Guest',
    guestEmail: (input.guestEmail ?? '').trim(),
    guests: Number.isFinite(Number(input.guests)) ? Math.max(0, Math.floor(Number(input.guests))) : 0,
    status,
    paymentStatus,
    amountPaid: Number.isFinite(amount) ? amount : 0,
    currency: (input.currency ?? 'EUR').trim() || 'EUR',
    listingId: input.listingId,
    listingTitle: input.listingTitle,
    optionId: (input.optionId ?? '').trim(),
    optionLabel: (input.optionLabel ?? '').trim(),
    family: input.family,
    date: (input.date ?? '').slice(0, 10),
    startHm: (input.startHm ?? '').slice(0, 5),
    bookingNumber: typeof input.bookingNumber === 'number' ? input.bookingNumber : null,
    eligiblePaid,
    eligibleUnpaid,
    blockReason: eligiblePaid || eligibleUnpaid
      ? ''
      : cancellationBlockReason({ status, payment_status: paymentStatus }) || 'Not eligible',
  };
}

export function filterCancellationCandidates(
  pool: readonly CancellationCandidate[],
  filters: CancellationFilters
): CancellationCandidate[] {
  const q = filters.query.trim().toLowerCase();
  return pool.filter((row) => {
    if (filters.family && row.family !== filters.family) return false;
    if (filters.listingId && row.listingId !== filters.listingId) return false;
    if (filters.optionId && row.optionId !== filters.optionId) return false;
    if (filters.dateFrom && row.date && row.date < filters.dateFrom) return false;
    if (filters.dateFrom && !row.date) return false;
    if (filters.dateTo && row.date && row.date > filters.dateTo) return false;
    if (filters.dateTo && !row.date) return false;
    if (filters.startHm && row.startHm !== filters.startHm) return false;
    if (filters.status === 'paid' && !row.eligiblePaid) return false;
    if (filters.status === 'unpaid' && !row.eligibleUnpaid) return false;
    if (filters.status === 'confirmed' && row.status.toLowerCase() !== 'confirmed') return false;
    if (filters.status === 'pending' && row.status.toLowerCase() !== 'pending') return false;
    if (!q) return true;
    const hay = [row.reference, row.guestName, row.guestEmail, row.listingTitle, row.optionLabel]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Ids the supplier checked. Unknown and ineligible ids are dropped. Order follows the pool. */
export function explicitCancellationSelection(
  pool: readonly CancellationCandidate[],
  selectedIds: readonly string[]
): string[] {
  const wanted = new Set(selectedIds);
  return pool.filter((row) => wanted.has(row.id) && (row.eligiblePaid || row.eligibleUnpaid)).map((row) => row.id);
}

/**
 * All eligible paid bookings that share one departure in the current filter.
 * Null when the visible paid rows cover more than one departure, or none.
 */
export function entireDepartureSelection(
  visible: readonly CancellationCandidate[]
): { key: string; ids: string[] } | null {
  const paid = visible.filter((row) => row.eligiblePaid);
  if (paid.length === 0) return null;
  const key = cancellationDepartureKey(paid[0]);
  if (paid.some((row) => cancellationDepartureKey(row) !== key)) return null;
  return { key, ids: paid.map((row) => row.id) };
}

/**
 * After the supplier confirms a selection, later pool arrivals stay out.
 * The confirmed id list is the snapshot.
 */
export function frozenCancellationSelection(
  confirmedIds: readonly string[],
  laterPool: readonly CancellationCandidate[]
): string[] {
  const allowed = new Set(laterPool.map((row) => row.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of confirmedIds) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function candidatesByIds(
  pool: readonly CancellationCandidate[],
  ids: readonly string[]
): CancellationCandidate[] {
  const byId = new Map(pool.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is CancellationCandidate => Boolean(row));
}

export type CancellationSelectionKind = 'paid' | 'unpaid' | 'unpaid_many' | 'mixed' | 'empty' | 'too_many';

export function classifyCancellationSelection(rows: readonly CancellationCandidate[]): CancellationSelectionKind {
  if (rows.length === 0) return 'empty';
  if (rows.length > CANCELLATION_BATCH_LIMIT) return 'too_many';
  const paid = rows.some((row) => row.eligiblePaid);
  const unpaid = rows.some((row) => row.eligibleUnpaid);
  if (paid && unpaid) return 'mixed';
  if (unpaid) return rows.length === 1 ? 'unpaid' : 'unpaid_many';
  return 'paid';
}

export type CancellationMoneyPreview = {
  refundAmount: number;
  feeAmount: number;
  currency: string;
};

/** Full refund entitlement for a paid supplier cancellation. Unpaid holds refund nothing. */
export function cancellationMoneyPreview(
  row: CancellationCandidate,
  reasonCode: string
): CancellationMoneyPreview {
  if (!row.eligiblePaid) {
    return { refundAmount: 0, feeAmount: 0, currency: row.currency };
  }
  return {
    refundAmount: row.amountPaid,
    feeAmount: supplierCancellationFeeEur(reasonCode),
    currency: row.currency,
  };
}

export function cancellationTotals(
  rows: readonly CancellationCandidate[],
  reasonCode: string
): { customers: number; bookings: number; paid: number; refunds: number; fees: number; guests: number; currency: string } {
  const emails = new Set<string>();
  let paid = 0;
  let refunds = 0;
  let fees = 0;
  let guests = 0;
  const currency = rows.find((row) => row.currency)?.currency || 'EUR';
  for (const row of rows) {
    const person = row.guestEmail || row.guestName;
    if (person) emails.add(person.toLowerCase());
    const money = cancellationMoneyPreview(row, reasonCode);
    paid += row.eligiblePaid ? row.amountPaid : 0;
    refunds += money.refundAmount;
    fees += money.feeAmount;
    guests += row.guests;
  }
  return {
    customers: emails.size,
    bookings: rows.length,
    paid,
    refunds,
    fees,
    guests,
    currency,
  };
}

export type CancellationBatchRow = {
  bookingId: string;
  ok: boolean;
  replayed: boolean;
  error?: string;
  requestId?: string;
  autoRefundQueued: boolean;
  needsCustomerChoice: boolean;
  appliedFee?: number;
};

export function parseCancellationBatchResults(results: unknown): CancellationBatchRow[] {
  if (!Array.isArray(results)) return [];
  return results.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const bookingId = typeof row.booking_id === 'string' ? row.booking_id : '';
    if (!bookingId) return [];
    return [{
      bookingId,
      ok: row.ok === true,
      replayed: row.replayed === true,
      error: typeof row.error === 'string' ? row.error : undefined,
      requestId: typeof row.id === 'string' ? row.id : undefined,
      autoRefundQueued: row.auto_refund_queued === true,
      needsCustomerChoice: row.needs_customer_choice === true,
      appliedFee: typeof row.applied_fee === 'number' ? row.applied_fee : undefined,
    }];
  });
}

export const SUPPLIER_CANCELLATION_UNAUTHORIZED = 'You can only cancel bookings for your own listings.';
export const SUPPLIER_CANCELLATION_NONE = 'No booking in this selection was cancelled.';

export function cancellationRunPhase(rows: readonly { ok: boolean }[]): 'success' | 'partial' | 'failure' {
  const ok = rows.filter((row) => row.ok).length;
  if (ok === 0) return 'failure';
  if (ok === rows.length) return 'success';
  return 'partial';
}

export function cancellationResultCounts(rows: readonly { ok: boolean }[]): {
  cancelled: number;
  notCancelled: number;
  total: number;
} {
  const cancelled = rows.filter((row) => row.ok).length;
  return { cancelled, notCancelled: rows.length - cancelled, total: rows.length };
}

/** A row with an error is not a cancellation, even if a payload also says ok. */
export function cancellationRowSucceeded(row: { ok?: boolean; error?: string | null }): boolean {
  return row.ok === true && !row.error?.trim();
}

export function cancellationFailureSummary(
  rows: readonly { ok: boolean; error?: string }[],
  fallback?: string | null
): string {
  const errors = [...new Set(
    rows
      .filter((row) => !row.ok)
      .map((row) => row.error?.trim())
      .filter((error): error is string => Boolean(error))
  )];
  if (errors.length === 1) return errors[0];
  return fallback?.trim() || SUPPLIER_CANCELLATION_NONE;
}

export function cancellationStatusMessage(
  rows: readonly { ok: boolean; error?: string }[],
  failureDetail?: string | null
): string {
  const counts = cancellationResultCounts(rows);
  if (counts.total === 0) return failureDetail?.trim() || SUPPLIER_CANCELLATION_NONE;
  if (counts.cancelled === 0) {
    const reason = cancellationFailureSummary(rows, failureDetail);
    if (reason && reason !== SUPPLIER_CANCELLATION_NONE) {
      return `Cancelled 0 of ${counts.total}. ${reason}`;
    }
    return `Cancelled 0 of ${counts.total}.`;
  }
  if (counts.notCancelled === 0) return `Cancelled ${counts.cancelled} of ${counts.total}.`;
  return `Cancelled ${counts.cancelled} of ${counts.total}. ${counts.notCancelled} could not be cancelled.`;
}

/**
 * Batch success follows the booking results.
 * A top-level ok flag is ignored when every booking failed or was refused.
 */
export function classifyCancellationBatchResponse(input: {
  ok?: unknown;
  error?: unknown;
  results?: unknown;
}): {
  ok: boolean;
  outcome: 'success' | 'partial' | 'failure';
  partial: boolean;
  succeeded: number;
  failed: number;
  error?: string;
  results: CancellationBatchRow[];
} {
  const results = parseCancellationBatchResults(input.results).map((row) => (
    cancellationRowSucceeded(row) ? row : { ...row, ok: false }
  ));
  const succeeded = results.filter((row) => row.ok).length;
  const failed = results.length - succeeded;
  if (results.length === 0 || succeeded === 0) {
    const transportError = typeof input.error === 'string' ? input.error : undefined;
    return {
      ok: false,
      outcome: 'failure',
      partial: false,
      succeeded: 0,
      failed,
      error: cancellationFailureSummary(results, transportError || SUPPLIER_CANCELLATION_NONE),
      results,
    };
  }
  if (failed > 0) {
    return { ok: true, outcome: 'partial', partial: true, succeeded, failed, results };
  }
  return { ok: true, outcome: 'success', partial: false, succeeded, failed: 0, results };
}
