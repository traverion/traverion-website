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
const mig = readFileSync(
  resolve(root, 'supabase/migrations/305_supplier_retained_cancel_earnings_eligibility.sql'),
  'utf8'
);

function row(partial: Partial<IncomeEarningRow>): IncomeEarningRow {
  return {
    bookingId: partial.bookingId ?? 'b1',
    reference: partial.reference ?? 'TV-1',
    experience: partial.experience ?? 'Tour',
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
  };
}

describe('supplier-retained cancel earnings lifecycle', () => {
  it('migration keeps no_refund cancels payable and blocks refund-due cancels', () => {
    expect(mig).toContain('booking_is_supplier_retained_cancel');
    expect(mig).toContain("v_choice = 'no_refund'");
    expect(mig).toContain('retained_cancel_touched');
    expect(mig).toContain('not coalesce(v_retained, false)');
  });

  it('Overview includes retained cancels and excludes refund-due cancels', () => {
    const retained = row({
      bookingId: 'retained',
      bookingStatus: 'cancelled',
      paymentStatus: 'paid',
      refundChoice: 'no_refund',
      status: 'eligible',
    });
    const refundDue = row({
      bookingId: 'due',
      bookingStatus: 'cancelled',
      paymentStatus: 'paid',
      refundChoice: 'full_refund',
      status: 'pending',
    });
    expect(isSupplierRetainedCancel(retained)).toBe(true);
    expect(isIncomeRowOpenForPayoutPools(retained)).toBe(true);
    expect(isIncomeRowOpenForPayoutPools(refundDue)).toBe(false);
    expect(selectUnallocatedEligibleEarnings([retained, refundDue]).map((r) => r.bookingId)).toEqual([
      'retained',
    ]);
    expect(selectAwaitingClearanceEarnings([retained, refundDue]).map((r) => r.bookingId)).toEqual([]);
  });

  it('migration 306 repair + prepare exclude non-retained cancels from allocation', () => {
    const repair = readFileSync(
      resolve(root, 'supabase/migrations/306_repair_stale_blocked_earning_items.sql'),
      'utf8'
    );
    expect(repair).toContain('booking_requires_earning_reversal');
    expect(repair).toContain('repair_stale_blocked_supplier_earning_items');
    expect(repair).toContain('supplier_earning_repair_audit');
    expect(repair).toContain('not public.booking_requires_earning_reversal');
    expect(repair).toContain('stale_blocked_reversed');
    // Retained path must remain payable.
    expect(mig).toContain('booking_is_supplier_retained_cancel');
  });

  it('stale eligible refund-due rows never enter Overview eligible pool', () => {
    const staleEligibleRefundDue = row({
      bookingId: 'stale',
      bookingStatus: 'cancelled',
      paymentStatus: 'paid',
      refundChoice: 'full_refund',
      status: 'eligible',
      netMinor: 10115,
    });
    expect(selectUnallocatedEligibleEarnings([staleEligibleRefundDue])).toEqual([]);
  });
});
