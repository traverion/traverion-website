import { describe, expect, it } from 'vitest';
import { splitGrossByCommissionBps } from './commercial-money';
import {
  buildIncomeEarningRows,
  maskIban,
  payoutMaySayPaid,
  payoutPresentationStatus,
  sumNetMinor,
  supplierNetMinor,
} from './supplier-income';
import { earningsStatementLines, payoutStatementLines } from './supplier-finance-pdf';

describe('supplier net earnings', () => {
  it('splits the €119 and €297 examples with the stored 15% rate', () => {
    const a = splitGrossByCommissionBps(11900, 1500);
    const b = splitGrossByCommissionBps(29700, 1500);
    expect(a).toMatchObject({ commissionMinor: 1785, supplierMinor: 10115 });
    expect(b).toMatchObject({ commissionMinor: 4455, supplierMinor: 25245 });
    expect(a.supplierMinor + b.supplierMinor).toBe(35360);
    expect(a.commissionMinor + a.supplierMinor).toBe(11900);
    expect(b.commissionMinor + b.supplierMinor).toBe(29700);
  });

  it('uses the frozen remaining net, not a later commission rate', () => {
    const historical = splitGrossByCommissionBps(11900, 1800);
    expect(historical.supplierMinor).toBe(9758);
    const net = supplierNetMinor({
      snapshot: {
        booking_id: 'b1',
        currency: 'EUR',
        gross_minor: 11900,
        commission_minor: 2142,
        supplier_minor: 9758,
        remaining_gross_minor: 11900,
        remaining_commission_minor: 2142,
        remaining_supplier_minor: 9758,
        commission_bps: 1800,
      },
    });
    expect(net).toBe(9758);
    expect(net).not.toBe(splitGrossByCommissionBps(11900, 1500).supplierMinor);
  });

  it('shows zero net after a full reversal and the remaining net after a partial refund', () => {
    expect(
      supplierNetMinor({
        item: { booking_id: 'b', currency: 'EUR', amount_minor: 10115, status: 'reversed' },
        snapshot: {
          booking_id: 'b',
          currency: 'EUR',
          gross_minor: 11900,
          commission_minor: 1785,
          supplier_minor: 10115,
          remaining_gross_minor: 0,
          remaining_commission_minor: 0,
          remaining_supplier_minor: 0,
          commission_bps: 1500,
        },
      })
    ).toBe(0);
    expect(
      supplierNetMinor({
        snapshot: {
          booking_id: 'b',
          currency: 'EUR',
          gross_minor: 11900,
          commission_minor: 1785,
          supplier_minor: 10115,
          remaining_gross_minor: 5950,
          remaining_commission_minor: 892,
          remaining_supplier_minor: 5058,
          commission_bps: 1500,
        },
      })
    ).toBe(5058);
  });

  it('sums only the requested currency and status', () => {
    const rows = buildIncomeEarningRows({
      bookings: [
        { id: 'a', currency: 'EUR', amount_paid: 119, booking_date: '2026-10-23', created_at: '2026-10-16' },
        { id: 'b', currency: 'EUR', amount_paid: 297, booking_date: '2026-11-01', created_at: '2026-10-16' },
      ],
      snapshots: [
        {
          booking_id: 'a',
          currency: 'EUR',
          gross_minor: 11900,
          commission_minor: 1785,
          supplier_minor: 10115,
          remaining_gross_minor: 11900,
          remaining_commission_minor: 1785,
          remaining_supplier_minor: 10115,
          commission_bps: 1500,
        },
        {
          booking_id: 'b',
          currency: 'EUR',
          gross_minor: 29700,
          commission_minor: 4455,
          supplier_minor: 25245,
          remaining_gross_minor: 29700,
          remaining_commission_minor: 4455,
          remaining_supplier_minor: 25245,
          commission_bps: 1500,
        },
      ],
      items: [
        { booking_id: 'a', currency: 'EUR', amount_minor: 10115, status: 'pending' },
        { booking_id: 'b', currency: 'EUR', amount_minor: 25245, status: 'eligible' },
      ],
      experienceTitle: () => 'Northern Lights',
      referenceLabel: (booking) => booking.id,
    });
    expect(sumNetMinor(rows, 'EUR')).toBe(35360);
    expect(sumNetMinor(rows, 'EUR', ['pending'])).toBe(10115);
    expect(sumNetMinor(rows, 'EUR', ['eligible'])).toBe(25245);
    expect(rows[0]?.grossMinor).toBe(11900);
  });

  it('does not call a payout paid without a completion time', () => {
    expect(payoutMaySayPaid('paid', null)).toBe(false);
    expect(payoutMaySayPaid('paid', '2026-11-01T00:00:00Z')).toBe(true);
    expect(payoutPresentationStatus('paid', null)).toBe('Recorded');
    expect(payoutPresentationStatus('ready', null)).toBe('Scheduled');
    expect(maskIban('FI2112345600000785')).toBe('•••• 0785');
  });

  it('puts gross, commission, and net on the statement and keeps the payout statement from claiming a transfer', () => {
    const lines = earningsStatementLines({
      reference: 'ES-TV-PDTAS6JD',
      issueDate: '2026-10-17',
      supplierName: 'Royal Nordic',
      supplierAddress: 'Rovaniemi',
      businessId: null,
      vatId: null,
      bookingReference: 'TV-PDTAS6JD',
      experience: 'Northern Lights Guarantee',
      activityDate: '2026-10-23',
      purchaseDate: '2026-10-16',
      currency: 'EUR',
      grossMinor: 11900,
      commissionMinor: 1785,
      commissionBps: 1500,
      netMinor: 10115,
      payoutStatus: 'Pending',
    });
    expect(lines.join('\n')).toContain('Customer booking amount: EUR 119.00');
    expect(lines.join('\n')).toContain('Traverion commission (15%): -EUR 17.85');
    expect(lines.join('\n')).toContain('Net supplier earnings: EUR 101.15');
    expect(lines.join('\n')).toContain('not proof that money was transferred');
    const payout = payoutStatementLines({
      reference: 'PS-1',
      issueDate: '2026-11-01',
      supplierName: 'Royal Nordic',
      currency: 'EUR',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      statusLabel: 'Scheduled',
      paidAt: null,
      totalNetMinor: 35360,
      lines: [
        { reference: 'TV-1', experience: 'A', grossMinor: 11900, commissionMinor: 1785, commissionBps: 1500, netMinor: 10115 },
        { reference: 'TV-2', experience: 'B', grossMinor: 29700, commissionMinor: 4455, commissionBps: 1500, netMinor: 25245 },
      ],
    });
    expect(payout.join('\n')).toContain('Net amount payable to supplier: EUR 353.60');
    expect(payout.join('\n')).toContain('not proof of transfer');
  });
});
