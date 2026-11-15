import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  nextPayoutPreparationLabel,
  payoutConfirmedScheduleDate,
  payoutMaySayPaid,
  payoutPreferenceLabel,
  selectAwaitingClearanceEarnings,
  selectLastCompletedPayout,
  selectUnallocatedEligibleEarnings,
  sumIncomeRowsNetMinor,
  type IncomeEarningRow,
} from './supplier-income';

const root = resolve(__dirname, '../..');

function row(partial: Partial<IncomeEarningRow>): IncomeEarningRow {
  return {
    bookingId: partial.bookingId ?? 'b1',
    reference: partial.reference ?? 'TV-1',
    experience: partial.experience ?? 'Aurora',
    activityDate: partial.activityDate ?? '2026-11-01',
    purchaseDate: partial.purchaseDate ?? '2026-10-20',
    currency: partial.currency ?? 'EUR',
    netMinor: partial.netMinor ?? 10115,
    grossMinor: partial.grossMinor ?? 11900,
    commissionMinor: partial.commissionMinor ?? 1785,
    commissionBps: partial.commissionBps ?? 1500,
    status: partial.status ?? 'eligible',
    held: partial.held,
    holdReason: partial.holdReason,
    bookingStatus: partial.bookingStatus,
    paymentStatus: partial.paymentStatus,
  };
}

describe('Partner Income Overview payout redesign', () => {
  const page = readFileSync(resolve(root, 'src/pages/supplier/SupplierEarnings.tsx'), 'utf8');
  const mig270 = readFileSync(
    resolve(root, 'supabase/migrations/270_supplier_earnings_payout_eligibility_phase5.sql'),
    'utf8'
  );

  it('Overview shows eligible / awaiting / details / last payout — not Period sales cards', () => {
    expect(page).toContain('data-testid="income-overview-primary-cards"');
    expect(page).toContain('Next payout — eligible');
    expect(page).toContain('Awaiting clearance');
    expect(page).toContain('Eligible for next payout');
    expect(page).toContain('Last completed payout');
    expect(page).toContain('View all earnings');
    expect(page).not.toContain('Period sales');
    expect(page).not.toContain('Period earnings');
    expect(page).not.toContain('Reporting period');
    expect(page).not.toContain('fetchSupplierPeriodSales');
    expect(page).not.toContain('fetchSupplierPeriodEarnings');
  });

  it('Documents list period statements and confirmations only after confirmation', () => {
    expect(page).toContain('Payout statements');
    expect(page).toContain('Payment confirmations');
    expect(page).not.toContain('Earnings statements');
    expect(page).toContain('payoutMaySayPaid(period.status, period.paid_at)');
    expect(page).toContain('One payout statement per confirmed payout period');
  });

  it('keeps Earnings / Payouts / Settings tabs and never equates READY with bank paid', () => {
    expect(page).toContain("['earnings', 'Earnings']");
    expect(page).toContain("['payouts', 'Payouts']");
    expect(page).toContain("['settings', 'Settings']");
    expect(payoutMaySayPaid('ready', null)).toBe(false);
    expect(payoutConfirmedScheduleDate({ status: 'ready', scheduled_for: '2026-11-20' })).toBeNull();
    expect(
      payoutConfirmedScheduleDate({
        status: 'paid',
        paid_at: '2026-11-15T10:00:00Z',
        connect_lifecycle: 'bank_payout_paid',
      })
    ).toBe('2026-11-15');
  });

  it('eligible pool excludes held, allocated, cancelled, and refunded rows', () => {
    const rows = [
      row({ bookingId: 'a', status: 'eligible', netMinor: 1000 }),
      row({ bookingId: 'b', status: 'eligible', held: true, netMinor: 2000 }),
      row({ bookingId: 'c', status: 'included', netMinor: 3000 }),
      row({ bookingId: 'd', status: 'pending', netMinor: 4000 }),
      row({
        bookingId: 'e',
        status: 'pending',
        netMinor: 10115,
        bookingStatus: 'cancelled',
        paymentStatus: 'paid',
      }),
      row({
        bookingId: 'f',
        status: 'eligible',
        netMinor: 5000,
        bookingStatus: 'confirmed',
        paymentStatus: 'refunded',
      }),
    ];
    const eligible = selectUnallocatedEligibleEarnings(rows);
    expect(eligible.map((r) => r.bookingId)).toEqual(['a']);
    expect(sumIncomeRowsNetMinor(eligible)).toBe(1000);
    expect(selectAwaitingClearanceEarnings(rows).map((r) => r.bookingId)).toEqual(['d']);
    expect(payoutPreferenceLabel({ payout_cadence: 'monthly', commission_bps: 1500 })).toBe(
      'Monthly (15%)'
    );
    expect(payoutPreferenceLabel({ payout_cadence: 'semimonthly', commission_bps: 1800 })).toBe(
      'Twice monthly (18%)'
    );
    expect(
      nextPayoutPreparationLabel({ eligibleCount: 2, periodStatus: null })
    ).toMatch(/Available for the next payout/i);
    expect(
      selectLastCompletedPayout([
        { status: 'ready', paid_at: null },
        { status: 'paid', paid_at: '2026-10-01T00:00:00Z' },
        { status: 'paid', paid_at: '2026-11-01T00:00:00Z' },
      ])?.paid_at
    ).toBe('2026-11-01T00:00:00Z');
  });

  it('DB still enforces one allocation per earning item (idempotent)', () => {
    expect(mig270).toContain('on conflict (earning_item_id) do nothing');
    expect(mig270).toContain('payout_period_id is null');
    expect(mig270).toContain('READY periods only — no Stripe Connect transfer or bank payout');
  });
});
