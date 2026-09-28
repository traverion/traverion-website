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
      payouts: [
        {
          period_start: '2026-09-01',
          period_end: '2026-09-07',
          amount: 100,
          currency: 'EUR',
          status: 'pending',
        },
      ],
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
    expect(rows).toHaveLength(3);
    expect(rows[0]![0]).toBe('payout_period');
    expect(rows[0]![7]).toBe('Not paid out');
    expect(rows[0]![7].toLowerCase()).not.toBe('pending');
    expect(rows[1]![0]).toBe('refund_due');
    expect(rows[1]![7]).toBe('Refund due');
    expect(rows[1]![8].toLowerCase()).toContain('does not send stripe refunds automatically');
    expect(rows[2]![0]).toBe('ledger');
    expect(rows[2]![7]).toBe('Cancellation fee');
  });

  it('exports collected bookings when payout periods are empty so Export matches the UI list', () => {
    expect(
      partnerMoneyCsvHasExportableRows({
        payouts: [],
        refundDue: [],
        collected: [{ id: 'b5' }],
        ledger: [],
      })
    ).toBe(true);
    const rows = buildPartnerMoneyCsvRows({
      payouts: [],
      refundDue: [],
      collected: [
        {
          id: 'b5',
          booking_number: 5,
          status: 'confirmed',
          payment_status: 'paid',
          amount_paid: 189,
          currency: 'EUR',
          booking_date: '2026-09-11',
          guest_name: 'Ada',
          listing_title: 'Aurora tour',
          checkout_session_id: 'cs_test_abc',
        },
      ],
      ledger: [],
      ledgerKindLabel: (k) => k,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toBe('collected');
    expect(rows[0]![4]).toBe('5');
    expect(rows[0]![5]).toBe('189');
    expect(rows[0]![7]).toBe('Collected');
    expect(rows[0]![8].toLowerCase()).toContain('collected, not paid out');
    expect(rows[0]![8].toLowerCase()).toContain('stripe test');
  });

  it('Phase 1575: collected stay detail uses exclusive purchased range not check-in alone', () => {
    const rows = buildPartnerMoneyCsvRows({
      payouts: [],
      refundDue: [],
      collected: [
        {
          id: 'stay1',
          booking_number: 8,
          status: 'confirmed',
          payment_status: 'paid',
          amount_paid: 400,
          currency: 'EUR',
          booking_date: '2026-12-01',
          check_out: '2026-12-03',
          nights: 2,
          purchase_snapshot: { checkOut: '2026-12-06' },
          guest_name: 'Mira',
          listing_title: 'Cabin',
        },
      ],
      ledger: [],
      ledgerKindLabel: (k) => k,
    });
    expect(rows[0]![8]).toContain('2026-12-01 → 2026-12-06');
  });
});
