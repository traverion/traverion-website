/**
 * Partner Money: collected traveler payments plus ledger adjustments.
 * booking_earnings is the journal copy of a paid booking; it must not be added
 * on top of collected or collected is counted twice.
 */

export type LedgerAmountRow = {
  kind: string;
  amount: number | string;
};

export function isCollectedEarningKind(kind: string): boolean {
  return kind.trim().toLowerCase() === 'booking_earnings';
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
