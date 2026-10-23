import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildIncomeReportPeriods,
  earningStatusExplanation,
  payoutMaySayPaid,
  payoutPresentationStatus,
} from './supplier-income';

const root = resolve(__dirname, '../..');

describe('Phase 6: supplier income experience', () => {
  const page = readFileSync(resolve(root, 'src/pages/supplier/SupplierEarnings.tsx'), 'utf8');
  const earningsData = readFileSync(resolve(root, 'src/data/supabase-earnings.ts'), 'utf8');
  const settings = readFileSync(
    resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
    'utf8'
  );
  const mig = readFileSync(
    resolve(root, 'supabase/migrations/271_supplier_income_reporting_phase6.sql'),
    'utf8'
  );
  const adminEdge = readFileSync(
    resolve(root, 'supabase/functions/admin-supplier-verification/index.ts'),
    'utf8'
  );

  it('Overview uses exactly two primary cards from Phase 5 period RPCs', () => {
    expect(page).toContain('data-testid="income-overview-primary-cards"');
    expect(page).toContain('Period sales');
    expect(page).toContain('Period earnings');
    expect(page).toContain('fetchSupplierPeriodSales');
    expect(page).toContain('fetchSupplierPeriodEarnings');
    expect(page).not.toMatch(/Total earnings[\s\S]*Pending[\s\S]*Available[\s\S]*Paid out/);
    expect(earningsData).toContain("rpc('supplier_period_sales'");
    expect(earningsData).toContain("rpc('supplier_period_earnings'");
  });

  it('keeps Income navigation tabs and period selector', () => {
    expect(page).toContain("['overview', 'Overview']");
    expect(page).toContain("['earnings', 'Earnings']");
    expect(page).toContain("['payouts', 'Payouts']");
    expect(page).toContain("['documents', 'Documents']");
    expect(page).toContain("['settings', 'Settings']");
    expect(page).toContain('Reporting period');
    expect(page).toContain('buildIncomeReportPeriods');
  });

  it('never labels READY as Paid and gates completed statements', () => {
    expect(payoutPresentationStatus('ready', null)).toBe('Prepared');
    expect(payoutMaySayPaid('ready', null)).toBe(false);
    expect(payoutMaySayPaid('paid', null)).toBe(false);
    expect(payoutMaySayPaid('paid', '2026-11-01T00:00:00Z')).toBe(true);
    expect(page).toContain('Connect payout statuses (TEST)');
    expect(page).toContain('payoutMaySayPaid(period.status, period.paid_at)');
    expect(page).toContain('A completed payout statement is available only after payment is confirmed');
  });

  it('surfaces holds, recovery debt, and status explanations on Earnings', () => {
    expect(page).toContain('Outstanding recovery balance');
    expect(page).toContain('fetchSupplierActiveFinancialHolds');
    expect(page).toContain('earningStatusExplanation');
    expect(earningStatusExplanation('pending')).toMatch(/awaiting service completion/i);
    expect(settings).toContain('Business & Payouts');
    expect(settings).toContain('Live automatic payouts remain');
    expect(settings).toContain('separately authorizes production money movement');
  });

  it('hardens period RPC access, paid-mark confirmation, and missing durations', () => {
    expect(mig).toContain('is_supplier_account_side');
    expect(mig).toContain('payment_reference_required');
    expect(mig).toContain('p_payment_reference');
    expect(mig).toContain('unknown duration → no automatic completion');
    expect(mig).toContain('pending verification until duration is known');
    expect(adminEdge).toContain('payoutPaymentReference');
    expect(adminEdge).toContain('p_payment_reference');
  });

  it('builds historical monthly and semimonthly periods with exact ranges', () => {
    const monthly = buildIncomeReportPeriods('monthly', new Date('2026-11-15T12:00:00Z'), 3);
    expect(monthly).toHaveLength(3);
    expect(monthly[0]?.id).toBe('2026-11');
    expect(monthly[0]?.rangeLabel).toContain('2026-11-01');
    expect(monthly[1]?.id).toBe('2026-10');
    const semi = buildIncomeReportPeriods('semimonthly', new Date('2026-11-20T12:00:00Z'), 2);
    expect(semi[0]?.label).toContain('15–end');
    expect(semi[1]?.label).toContain('1–14');
  });
});
