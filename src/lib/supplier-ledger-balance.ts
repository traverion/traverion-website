/**
 * Partner Money: collected traveler payments plus ledger adjustments.
 * booking_earnings / refund are journal mirrors of paid (then reversed) bookings —
 * already reflected in Collected — so they must not be added again as adjustments.
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

export function ledgerNetTotal(rows: LedgerAmountRow[]): number {
  return rows.reduce((sum, row) => sum + Number(row.amount), 0);
}

export function ledgerAdjustmentTotal(rows: LedgerAmountRow[]): number {
  return rows.filter((row) => !isCollectedEarningKind(row.kind)).reduce((sum, row) => sum + Number(row.amount), 0);
}

export function supplierAvailableBalance(params: {
  collected: number;
  ledger: LedgerAmountRow[];
  paidOut?: number;
}): number {
  return params.collected + ledgerAdjustmentTotal(params.ledger) - (params.paidOut ?? 0);
}
