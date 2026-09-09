import { partnerPaymentLabel, type MoneyBookingRow } from './payment-states';
import { PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL } from './booking-confirmation-copy';

export const PARTNER_MONEY_CSV_HEADER = [
  'row_kind',
  'period_start',
  'period_end',
  'booking_id',
  'booking_number',
  'amount',
  'currency',
  'status_or_label',
  'detail',
  'created_at',
] as const;

export type PartnerMoneyPayoutCsvInput = {
  period_start: string;
  period_end: string;
  amount: number | string;
  currency: string;
  status: string;
  invoice_number?: string | null;
  payment_reference?: string | null;
};

export type PartnerMoneyLedgerCsvInput = {
  booking_id: string | null;
  kind: string;
  amount: number;
  currency: string;
  reason: string;
  created_at: string;
};

export type PartnerMoneyRefundDueCsvInput = MoneyBookingRow & {
  id: string;
  booking_number?: number | null;
};

/** Unified Money export: payout periods + Refund due bookings + ledger adjustments. */
export function buildPartnerMoneyCsvRows(input: {
  payouts: PartnerMoneyPayoutCsvInput[];
  refundDue: PartnerMoneyRefundDueCsvInput[];
  ledger: PartnerMoneyLedgerCsvInput[];
  ledgerKindLabel: (kind: string) => string;
}): string[][] {
  const rows: string[][] = [];
  for (const e of input.payouts) {
    const statusLabel =
      e.status === 'pending'
        ? PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL
        : e.status === 'paid'
          ? 'Paid'
          : e.status;
    rows.push([
      'payout_period',
      e.period_start,
      e.period_end,
      '',
      '',
      String(e.amount),
      e.currency,
      statusLabel,
      [e.invoice_number, e.payment_reference].filter(Boolean).join(' · '),
      '',
    ]);
  }
  for (const b of input.refundDue) {
    rows.push([
      'refund_due',
      '',
      '',
      b.id,
      typeof b.booking_number === 'number' ? String(b.booking_number) : '',
      b.amount_paid != null ? String(b.amount_paid) : '',
      b.currency ?? '',
      partnerPaymentLabel(b),
      'Not in Collected — Traverion does not send Stripe refunds automatically',
      '',
    ]);
  }
  for (const e of input.ledger) {
    rows.push([
      'ledger',
      '',
      '',
      e.booking_id ?? '',
      '',
      String(e.amount),
      e.currency,
      input.ledgerKindLabel(e.kind),
      e.reason,
      e.created_at,
    ]);
  }
  return rows;
}

export function partnerMoneyCsvHasExportableRows(input: {
  payouts: unknown[];
  refundDue: unknown[];
  ledger: unknown[];
}): boolean {
  return input.payouts.length > 0 || input.refundDue.length > 0 || input.ledger.length > 0;
}
