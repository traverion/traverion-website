import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatIncomeMoney, formatMoney } from './money';
import {
  buildIncomeEarningRows,
  earningStatusLabel,
  payoutMaySayPaid,
  payoutPresentationStatus,
  selectAwaitingClearanceEarnings,
  selectLastCompletedPayout,
  selectUnallocatedEligibleEarnings,
  sumIncomeRowsNetMinor,
  type IncomeEarningRow,
} from './supplier-income';

const root = resolve(__dirname, '../..');

/** Authorized non-production shape from partner-demo Aurora earning_items (staging). */
const auroraDemoItems = [
  {
    booking_id: 'b91931a1-9a97-4ad3-8928-790557fa69af',
    currency: 'EUR',
    amount_minor: 0,
    status: 'reversed' as const,
    gross_minor: 4500,
    commission_minor: 675,
    commission_bps: 1500,
  },
  {
    booking_id: 'c08c34ce-c3be-45b1-898d-d56bdc7601ad',
    currency: 'EUR',
    amount_minor: 3825,
    status: 'pending' as const,
    gross_minor: 4500,
    commission_minor: 675,
    commission_bps: 1500,
  },
  {
    booking_id: 'f51dac1a-255e-42f1-bc50-714f58858938',
    currency: 'EUR',
    amount_minor: 3825,
    status: 'pending' as const,
    gross_minor: 4500,
    commission_minor: 675,
    commission_bps: 1500,
  },
];

const auroraSnapshots = auroraDemoItems.map((item) => ({
  booking_id: item.booking_id,
  currency: 'EUR',
  gross_minor: 4500,
  commission_minor: 675,
  supplier_minor: 3825,
  remaining_gross_minor: item.status === 'reversed' ? 0 : 4500,
  remaining_commission_minor: item.status === 'reversed' ? 0 : 675,
  remaining_supplier_minor: item.status === 'reversed' ? 0 : 3825,
  commission_bps: 1500,
}));

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
  };
}

describe('P9.25 Income & Payouts populated-branch certification', () => {
  const page = readFileSync(resolve(root, 'src/pages/supplier/SupplierEarnings.tsx'), 'utf8');
  const settings = readFileSync(
    resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
    'utf8'
  );

  it('formats Income amounts with two fraction digits without inventing growth rates', () => {
    expect(formatIncomeMoney(0, 'EUR')).toMatch(/0\.00/);
    expect(formatIncomeMoney(38.25, 'EUR')).toMatch(/38\.25/);
    expect(formatIncomeMoney(Number.NaN, 'EUR')).toMatch(/0\.00/);
    // Traveler/catalog formatMoney stays free to drop .00 for integers.
    expect(formatMoney(0, 'EUR')).not.toMatch(/0\.00/);
    expect(page).toContain('formatIncomeMoney');
    expect(page).not.toMatch(/growth\s*%|%\s*growth/i);
  });

  it('builds populated Earnings rows from authorized partner-demo Aurora shape', () => {
    const bookings = auroraDemoItems.map((item) => ({
      id: item.booking_id,
      currency: 'EUR',
      amount_paid: 45,
      booking_date: '2026-11-17',
      created_at: '2026-11-07T22:30:00Z',
    }));
    const rows = buildIncomeEarningRows({
      bookings,
      snapshots: auroraSnapshots,
      items: auroraDemoItems,
      experienceTitle: () => 'Arctic Fatbike Day Hire',
      referenceLabel: (b) => b.id.slice(0, 8),
    });
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.status === 'pending')).toHaveLength(2);
    expect(rows.filter((r) => r.status === 'reversed')).toHaveLength(1);
    expect(earningStatusLabel('pending')).toBe('Pending');
    expect(earningStatusLabel('reversed')).toBe('Reversed');
    expect(sumIncomeRowsNetMinor(rows)).toBe(7650);
    expect(selectAwaitingClearanceEarnings(rows)).toHaveLength(2);
    expect(selectUnallocatedEligibleEarnings(rows)).toHaveLength(0);
  });

  it('keeps populated Overview / Payouts / Documents presentation rules', () => {
    const eligible = [
      row({ bookingId: 'e1', status: 'eligible', netMinor: 10115 }),
      row({ bookingId: 'e2', status: 'eligible', netMinor: 25245 }),
    ];
    expect(sumIncomeRowsNetMinor(eligible)).toBe(35360);
    expect(formatIncomeMoney(35360 / 100, 'EUR')).toMatch(/353\.60/);

    expect(payoutPresentationStatus('ready', null)).toBe('Prepared');
    expect(payoutMaySayPaid('ready', null)).toBe(false);
    expect(payoutMaySayPaid('paid', '2026-11-01T00:00:00Z', 'bank_payout_paid')).toBe(true);
    expect(
      selectLastCompletedPayout([
        { status: 'ready', paid_at: null },
        { status: 'paid', paid_at: '2026-10-15T00:00:00Z', connect_lifecycle: 'bank_payout_paid' },
      ])?.paid_at
    ).toBe('2026-10-15T00:00:00Z');

    expect(page).toContain('pageRows.map');
    expect(page).toContain('payoutPeriods.map');
    expect(page).toContain('payoutMaySayPaid(period.status, period.paid_at, period.connect_lifecycle)');
    expect(page).toContain('setEarningPage');
    expect(page).toContain('earningQuery');
    expect(page).toContain('SupplierListSkeleton');
    expect(page).toContain('PARTNER_MONEY_LOAD_ERROR_TITLE');
  });

  it('keeps Settings chrome coherent with Income tabs (no payouts-enabled copy)', () => {
    expect(settings).toContain('Payout account');
    expect(settings).toContain('Payout preferences');
    expect(settings).toContain('Set up payouts');
    expect(settings).not.toMatch(/>\s*Payouts enabled\s*</i);
    expect(settings).not.toMatch(/['"`]Payouts enabled['"`]/);
    expect(page).toContain('IncomeFinancialSettings');
    expect(page).toContain('connectOnboardingLabel(profile?.connect_onboarding_status');
    expect(page).not.toContain("payout_verification_status === 'verified'");
  });
});
