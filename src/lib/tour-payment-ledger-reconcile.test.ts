import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyTourPaymentLedgerRow,
  tourInventoryFamilyIsTour,
  tourReconcileMajorToMinor,
} from './tour-payment-ledger-reconcile';

const root = process.cwd();
const mig = readFileSync(
  join(root, 'supabase/migrations/298_admin_tour_payment_ledger_reconcile.sql'),
  'utf8'
);
const edge = readFileSync(
  join(root, 'supabase/functions/admin-supplier-verification/index.ts'),
  'utf8'
);
const panel = readFileSync(
  join(root, 'src/components/admin/AdminCommercialPanel.tsx'),
  'utf8'
);

describe('tourReconcileMajorToMinor', () => {
  it('rounds major EUR to minor', () => {
    expect(tourReconcileMajorToMinor(0.5)).toBe(50);
    expect(tourReconcileMajorToMinor(10)).toBe(1000);
    expect(tourReconcileMajorToMinor(null)).toBeNull();
  });
});

describe('tourInventoryFamilyIsTour', () => {
  it('treats empty and tour as tour; excludes stay/rental', () => {
    expect(tourInventoryFamilyIsTour(null)).toBe(true);
    expect(tourInventoryFamilyIsTour('')).toBe(true);
    expect(tourInventoryFamilyIsTour('tour')).toBe(true);
    expect(tourInventoryFamilyIsTour('stay')).toBe(false);
    expect(tourInventoryFamilyIsTour('rental')).toBe(false);
  });
});

describe('classifyTourPaymentLedgerRow', () => {
  it('passes a consistent paid Tour split', () => {
    const r = classifyTourPaymentLedgerRow({
      paymentStatus: 'paid',
      amountPaidMajor: 0.5,
      grossMinor: 50,
      commissionMinor: 7,
      supplierMinor: 43,
      earningCount: 1,
      earningStatus: 'pending',
      earningAmountMinor: 43,
      paymentIntentBookingCount: 1,
      checkoutSessionBookingCount: 1,
    });
    expect(r.reconciliationStatus).toBe('ok');
    expect(r.flags).toEqual([]);
  });

  it('flags missing snapshot/earning on paid', () => {
    const r = classifyTourPaymentLedgerRow({
      paymentStatus: 'paid',
      amountPaidMajor: 10,
      earningCount: 0,
      paymentIntentBookingCount: 1,
    });
    expect(r.flags).toContain('missing_snapshot');
    expect(r.flags).toContain('missing_earning');
    expect(r.reconciliationStatus).toBe('discrepancy');
  });

  it('flags amount and split mismatches', () => {
    const r = classifyTourPaymentLedgerRow({
      paymentStatus: 'paid',
      amountPaidMajor: 1,
      grossMinor: 50,
      commissionMinor: 10,
      supplierMinor: 40,
      earningCount: 1,
      earningStatus: 'pending',
      earningAmountMinor: 40,
    });
    expect(r.flags).toContain('amount_mismatch');
    expect(r.flags).not.toContain('split_mismatch');
  });

  it('flags split_mismatch when gross != commission + supplier', () => {
    const r = classifyTourPaymentLedgerRow({
      paymentStatus: 'paid',
      amountPaidMajor: 0.5,
      grossMinor: 50,
      commissionMinor: 10,
      supplierMinor: 30,
      earningCount: 1,
      earningStatus: 'pending',
      earningAmountMinor: 30,
    });
    expect(r.flags).toContain('split_mismatch');
  });

  it('flags duplicate earnings and PI collisions', () => {
    const r = classifyTourPaymentLedgerRow({
      paymentStatus: 'paid',
      amountPaidMajor: 0.5,
      grossMinor: 50,
      commissionMinor: 7,
      supplierMinor: 43,
      earningCount: 2,
      earningStatus: 'pending',
      earningAmountMinor: 43,
      paymentIntentBookingCount: 2,
      checkoutSessionBookingCount: 1,
    });
    expect(r.flags).toContain('duplicate_earning');
    expect(r.flags).toContain('duplicate_payment_intent');
  });

  it('flags failed payments that somehow have earnings', () => {
    const r = classifyTourPaymentLedgerRow({
      paymentStatus: 'failed',
      earningCount: 1,
      earningStatus: 'pending',
      earningAmountMinor: 43,
    });
    expect(r.flags).toContain('failed_or_pending_has_earnings');
  });

  it('flags refunded bookings that still show payable earnings', () => {
    const r = classifyTourPaymentLedgerRow({
      paymentStatus: 'refunded',
      amountPaidMajor: 0.5,
      grossMinor: 50,
      commissionMinor: 7,
      supplierMinor: 43,
      earningCount: 1,
      earningStatus: 'pending',
      earningAmountMinor: 43,
    });
    expect(r.flags).toContain('refunded_still_payable');
  });

  it('accepts refunded + reversed earnings', () => {
    const r = classifyTourPaymentLedgerRow({
      paymentStatus: 'refunded',
      amountPaidMajor: 0.5,
      grossMinor: 50,
      commissionMinor: 7,
      supplierMinor: 43,
      earningCount: 1,
      earningStatus: 'reversed',
      earningAmountMinor: 0,
      paymentIntentBookingCount: 1,
      checkoutSessionBookingCount: 1,
    });
    expect(r.reconciliationStatus).toBe('ok');
  });

  it('flags paid_but_reversed', () => {
    const r = classifyTourPaymentLedgerRow({
      paymentStatus: 'paid',
      amountPaidMajor: 0.5,
      grossMinor: 50,
      commissionMinor: 7,
      supplierMinor: 43,
      earningCount: 1,
      earningStatus: 'reversed',
      earningAmountMinor: 0,
    });
    expect(r.flags).toContain('paid_but_reversed');
  });
});

describe('B2B.9.2 wiring (cert)', () => {
  it('migration is read-only service_role Tour reconcile RPC', () => {
    expect(mig).toContain('admin_tour_payment_ledger_reconcile');
    expect(mig).toContain("scope', 'tour'");
    expect(mig).toContain('read_only');
    expect(mig).toContain('grant execute');
    expect(mig).toContain('service_role');
    expect(mig).toMatch(/revoke all[\s\S]*from anon, authenticated/);
    expect(mig).not.toMatch(/update public\.(bookings|supplier_earning_items)/i);
    expect(mig).not.toMatch(/insert into public\.(bookings|supplier_earning_items)/i);
  });

  it('admin edge action is assertAdmin-gated and read-only', () => {
    expect(edge).toContain("tour_payment_ledger_reconcile");
    expect(edge).toContain('admin_tour_payment_ledger_reconcile');
    expect(edge).toContain('assertAdmin');
    const assertIdx = edge.indexOf('async function assertAdmin');
    const gateIdx = edge.indexOf('const gate = await assertAdmin');
    const actionIdx = edge.indexOf("body.action === 'tour_payment_ledger_reconcile'");
    expect(assertIdx).toBeGreaterThan(0);
    expect(gateIdx).toBeGreaterThan(assertIdx);
    expect(actionIdx).toBeGreaterThan(gateIdx);
    const slice = edge.slice(actionIdx, actionIdx + 900);
    expect(slice).toContain("rpc('admin_tour_payment_ledger_reconcile'");
    expect(slice).not.toContain('reverse_paid_booking_earnings');
    expect(slice).not.toContain('record_paid_booking_earnings');
  });

  it('commercial panel exposes read-only Tour reconcile UI', () => {
    expect(panel).toContain('TourPaymentLedgerReconcile');
    expect(panel).toContain('tour_payment_ledger_reconcile');
    expect(panel).toMatch(/Read-only Tour check|does not change financial records/i);
  });
});
