/**
 * Partner Money balance helpers.
 *
 * Commercial V1: supplier entitlement lives on booking_earnings (net of commission).
 * platform_commission rows are Traverion revenue — never part of supplier Available.
 * booking_earnings / refund journal mirrors are excluded when Available is derived from GMV;
 * prefer supplier_earning_items for pending/eligible/paid when present.
 */

export type LedgerAmountRow = {
  kind: string;
  amount: number | string;
};

/** Journal rows that mirror Collected (paid booking or its full reversal). */
export function isCollectedEarningKind(kind: string): boolean {
  const k = kind.trim().toLowerCase();
  return k === 'booking_earnings' || k === 'refund';
}

/** Traverion take — must not inflate supplier available balance. */
export function isPlatformCommissionKind(kind: string): boolean {
  const k = kind.trim().toLowerCase();
  return k === 'platform_commission';
}

export function isSupplierAdjustmentKind(kind: string): boolean {
  const k = kind.trim().toLowerCase();
  if (isCollectedEarningKind(k) || isPlatformCommissionKind(k)) return false;
  // Commission reversals are adjustments with reason in DB; kind is adjustment —
  // exclude source pattern via optional reason when available. Amount sign handles economics.
  return true;
}

export function ledgerNetTotal(rows: LedgerAmountRow[]): number {
  return rows.reduce((sum, row) => sum + Number(row.amount), 0);
}

export function ledgerAdjustmentTotal(rows: LedgerAmountRow[]): number {
  return rows
    .filter((row) => isSupplierAdjustmentKind(row.kind))
    .reduce((sum, row) => sum + Number(row.amount), 0);
}

export function ledgerPlatformCommissionTotal(rows: LedgerAmountRow[]): number {
  return rows
    .filter((row) => isPlatformCommissionKind(row.kind))
    .reduce((sum, row) => sum + Number(row.amount), 0);
}

/**
 * Legacy Available = collected GMV + supplier adjustments − recorded payouts.
 * Does NOT add platform_commission. Prefer earning-item breakdown in UI when available.
 */
export function supplierAvailableBalance(params: {
  collected: number;
  ledger: LedgerAmountRow[];
  paidOut?: number;
}): number {
  return params.collected + ledgerAdjustmentTotal(params.ledger) - (params.paidOut ?? 0);
}

/** Commercial V1: available-to-include ≈ eligible earning items (major units). */
export function supplierEligibleAvailable(eligibleMajor: number): number {
  return Number.isFinite(eligibleMajor) ? eligibleMajor : 0;
}
