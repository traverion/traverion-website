import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isIncomeRowOpenForPayoutPools,
  isSupplierRetainedCancel,
  selectAwaitingClearanceEarnings,
  selectUnallocatedEligibleEarnings,
  type IncomeEarningRow,
} from './supplier-income';

const root = resolve(__dirname, '../..');
const repairMig = readFileSync(
  resolve(root, 'supabase/migrations/306_repair_stale_blocked_earning_items.sql'),
  'utf8'
);
const retainedMig = readFileSync(
  resolve(root, 'supabase/migrations/305_supplier_retained_cancel_earnings_eligibility.sql'),
  'utf8'
);
const workflow = readFileSync(resolve(root, '.github/workflows/refresh-supplier-earnings.yml'), 'utf8');

function row(partial: Partial<IncomeEarningRow>): IncomeEarningRow {
  return {
    bookingId: partial.bookingId ?? 'b1',
    reference: partial.reference ?? 'TV-1',
    experience: 'Tour',
    activityDate: '2026-10-23',
    purchaseDate: '2026-10-17',
    currency: 'EUR',
    netMinor: partial.netMinor ?? 10115,
    grossMinor: 11900,
    commissionMinor: 1785,
    commissionBps: 1500,
    status: partial.status ?? 'eligible',
    bookingStatus: partial.bookingStatus,
    paymentStatus: partial.paymentStatus,
    refundChoice: partial.refundChoice,
    held: partial.held,
  };
}

describe('supplier payout integrity (P2)', () => {
  it('TV-PDTAS6JD-shaped retained cancel stays in eligible Overview pool', () => {
    const pdtas = row({
      reference: 'TV-PDTAS6JD',
      bookingStatus: 'cancelled',
      paymentStatus: 'paid',
      refundChoice: 'no_refund',
      status: 'eligible',
      netMinor: 10115,
    });
    expect(isSupplierRetainedCancel(pdtas)).toBe(true);
    expect(isIncomeRowOpenForPayoutPools(pdtas)).toBe(true);
    expect(selectUnallocatedEligibleEarnings([pdtas]).map((r) => r.reference)).toEqual(['TV-PDTAS6JD']);
  });

  it('refunded and refund-due cancels are excluded from Overview pools even if item says eligible', () => {
    const refunded = row({
      bookingId: 'rf',
      bookingStatus: 'cancelled',
      paymentStatus: 'refunded',
      refundChoice: 'full_refund',
      status: 'eligible',
    });
    const refundDue = row({
      bookingId: 'rd',
      bookingStatus: 'cancelled',
      paymentStatus: 'paid',
      refundChoice: 'full_refund',
      status: 'eligible',
    });
    expect(selectUnallocatedEligibleEarnings([refunded, refundDue])).toEqual([]);
    expect(selectAwaitingClearanceEarnings([refunded, refundDue])).toEqual([]);
  });

  it('SQL repair is audited, idempotent, and skips retained cancels', () => {
    expect(repairMig).toContain('repair_stale_blocked_supplier_earning_items');
    expect(repairMig).toContain('supplier_earning_repair_audit');
    expect(repairMig).toContain('booking_requires_earning_reversal');
    expect(repairMig).toContain('Does not reverse supplier-retained no_refund cancels');
    expect(repairMig).toContain('reverse_paid_booking_earnings');
    expect(retainedMig).toContain("v_choice = 'no_refund'");
  });

  it('prepare_due also gates on booking_requires_earning_reversal', () => {
    expect(repairMig).toContain('prepare_due_supplier_payouts');
    expect(repairMig).toMatch(/booking_requires_earning_reversal\(e\.booking_id\)/g);
  });

  it('hourly eligibility workflow retries transient outages', () => {
    expect(workflow).toContain('MAX_ATTEMPTS=3');
    expect(workflow).toContain('refresh-supplier-earnings');
    expect(workflow).toContain('521|502|503|504');
  });
});
