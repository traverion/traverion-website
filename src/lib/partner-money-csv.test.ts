import { describe, expect, it } from 'vitest';
import {
  PARTNER_MONEY_CSV_HEADER,
  buildPartnerMoneyCsvRows,
  partnerMoneyCsvHasExportableRows,
} from './partner-money-csv';

describe('partner money CSV', () => {
  it('includes Refund due rows so export matches Money UI honesty', () => {
    expect(PARTNER_MONEY_CSV_HEADER).toContain('row_kind');
    const rows = buildPartnerMoneyCsvRows({
      payouts: [],
      refundDue: [
        {
          id: 'b19',
          booking_number: 19,
          status: 'cancelled',
          payment_status: 'paid',
          amount_paid: 189,
          currency: 'EUR',
        },
      ],
      ledger: [
        {
          booking_id: 'b19',
          kind: 'cancellation_penalty',
          amount: -20,
          currency: 'EUR',
          reason: 'Staff unavailable fee',
          created_at: '2026-09-01T12:00:00Z',
        },
      ],
      ledgerKindLabel: (k) => (k === 'cancellation_penalty' ? 'Cancellation fee' : k),
    });
    expect(partnerMoneyCsvHasExportableRows({ payouts: [], refundDue: [{}], ledger: [] })).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0]![0]).toBe('refund_due');
    expect(rows[0]![7]).toBe('Refund due');
    expect(rows[0]![8].toLowerCase()).toContain('does not send stripe refunds automatically');
    expect(rows[1]![0]).toBe('ledger');
    expect(rows[1]![7]).toBe('Cancellation fee');
  });
});
