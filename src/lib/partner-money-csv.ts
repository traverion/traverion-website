import { partnerPaymentLabel, type MoneyBookingRow } from './payment-states';
import { PARTNER_MONEY_PERIOD_NOT_PAID_OUT_LABEL } from './booking-confirmation-copy';
import { isStripeTestCheckoutSession } from './money';

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

export type PartnerMoneyCollectedCsvInput = MoneyBookingRow & {
  id: string;
  booking_number?: number | null;
  booking_date?: string | null;
  guest_name?: string | null;
  listing_title?: string | null;
  checkout_session_id?: string | null;
};

/** Unified Money export: payout periods + Refund due + collected bookings + ledger adjustments. */
export function buildPartnerMoneyCsvRows(input: {
  payouts: PartnerMoneyPayoutCsvInput[];
  refundDue: PartnerMoneyRefundDueCsvInput[];
  collected?: PartnerMoneyCollectedCsvInput[];
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
  for (const b of input.collected ?? []) {
    const who = (b.listing_title ?? b.guest_name ?? 'Guest').trim() || 'Guest';
    const detailBits = [
      who,
      b.booking_date ?? '',
      isStripeTestCheckoutSession(b.checkout_session_id) ? 'Stripe TEST' : '',
      'collected, not paid out',
    ].filter(Boolean);
    rows.push([
      'collected',
      '',
      '',
      b.id,
      typeof b.booking_number === 'number' ? String(b.booking_number) : '',
      b.amount_paid != null ? String(b.amount_paid) : '',
      b.currency ?? '',
      'Collected',
      detailBits.join(' · '),
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
  collected?: unknown[];
  ledger: unknown[];
}): boolean {
  return (
    input.payouts.length > 0 ||
    input.refundDue.length > 0 ||
    (input.collected?.length ?? 0) > 0 ||
    input.ledger.length > 0
  );
}
