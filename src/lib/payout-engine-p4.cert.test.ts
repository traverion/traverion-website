import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_PLANS } from './commercial-money';
import {
  nextPayoutPreparationLabel,
  payoutMaySayPaid,
  payoutPresentationStatus,
  selectUnallocatedEligibleEarnings,
  type IncomeEarningRow,
} from './supplier-income';
import { connectPayoutPresentationStatus } from './connect-payout-status';

const root = resolve(__dirname, '../..');
const mig = readFileSync(resolve(root, 'supabase/migrations/307_p4_payout_hardening.sql'), 'utf8');
const refreshEdge = readFileSync(
  resolve(root, 'supabase/functions/refresh-supplier-earnings/index.ts'),
  'utf8'
);
const reversalEdge = readFileSync(
  resolve(root, 'supabase/functions/execute-supplier-transfer-reversals/index.ts'),
  'utf8'
);
const webhook = readFileSync(resolve(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
const prepareWorkflow = readFileSync(
  resolve(root, '.github/workflows/prepare-supplier-payouts.yml'),
  'utf8'
);
const reversalWorkflow = readFileSync(
  resolve(root, '.github/workflows/execute-supplier-transfer-reversals.yml'),
  'utf8'
);
const adminEdge = readFileSync(
  resolve(root, 'supabase/functions/admin-supplier-verification/index.ts'),
  'utf8'
);

function earning(partial: Partial<IncomeEarningRow>): IncomeEarningRow {
  return {
    bookingId: partial.bookingId ?? 'b1',
    reference: partial.reference ?? 'TV-1',
    experience: 'Tour',
    activityDate: '2026-10-01',
    purchaseDate: '2026-09-20',
    currency: 'EUR',
    netMinor: partial.netMinor ?? 10000,
    grossMinor: 11765,
    commissionMinor: 1765,
    commissionBps: partial.commissionBps ?? 1500,
    status: partial.status ?? 'eligible',
    bookingStatus: partial.bookingStatus ?? 'confirmed',
    paymentStatus: partial.paymentStatus ?? 'paid',
    refundChoice: partial.refundChoice,
  };
}

describe('P4 payout engine hardening', () => {
  it('catalog still locks 15% monthly and 18% twice-monthly', () => {
    expect(COMMERCIAL_PLANS.standard).toMatchObject({
      commissionBps: 1500,
      payoutCadence: 'monthly',
      payoutRunDays: [1],
    });
    expect(COMMERCIAL_PLANS.fast).toMatchObject({
      commissionBps: 1800,
      payoutCadence: 'semimonthly',
      payoutRunDays: [1, 15],
    });
  });

  it('4.1 enforces threshold, blocks empty READY, snapshots threshold', () => {
    expect(mig).toContain('supplier_payout_threshold_minor');
    expect(mig).toContain('skipped_below_threshold');
    expect(mig).toContain('cancelled empty READY');
    expect(mig).toContain('threshold_snapshot_minor');
    expect(mig).toContain('Never rewrite threshold snapshot');
    expect(mig).toMatch(/v_net < v_threshold_minor/);
  });

  it('4.2 auto-prepare is flag-gated OFF with audit trail and cadence days', () => {
    expect(mig).toContain("'payout_auto_prepare_enabled'");
    expect(mig).toMatch(/'payout_auto_prepare_enabled'[\s\S]{0,80}0/);
    expect(mig).toContain('run_scheduled_supplier_payout_prepare');
    expect(mig).toContain('supplier_payout_prepare_runs');
    expect(mig).toContain('auto_prepare_disabled');
    expect(mig).toContain('not_cadence_day');
    expect(mig).toContain("'prepare_due_supplier_payouts'");
    expect(refreshEdge).toContain("prepMode === 'scheduled'");
    expect(prepareWorkflow).toContain('prepare_payouts');
    expect(prepareWorkflow).toContain('scheduled');
    expect(adminEdge).toContain('prepare_runs_list');
  });

  it('4.2 preparation never initiates a bank transfer', () => {
    expect(mig).toContain("'stripe_transfer', false");
    expect(mig).toContain('no bank transfer');
    expect(refreshEdge).toContain('stripe_transfer: false');
    expect(prepareWorkflow).toMatch(/never bank transfer|No bank transfer|no bank transfer/i);
  });

  it('4.3 transfer reversal queue is idempotent and recovers only after Stripe confirm', () => {
    expect(mig).toContain('supplier_transfer_reversal_attempts');
    expect(mig).toContain('queue_connect_transfer_reversal_for_booking');
    expect(mig).toContain('confirm_connect_transfer_reversal');
    expect(mig).toContain('recovered_confirmed_at');
    expect(mig).toContain('reversal-confirm:');
    expect(mig).toContain('unique (idempotency_key)');
    expect(mig).toContain('reversal_cap_exhausted');
    expect(reversalEdge).toContain('createReversal');
    expect(reversalEdge).toContain('must equal exactly "test"');
    expect(reversalEdge).toContain('confirm_connect_transfer_reversal');
    expect(reversalWorkflow).toContain('dry_run');
    expect(webhook).toContain('confirm_connect_transfer_reversal');
  });

  it('4.3 reverse_paid_booking_earnings queues reversal when Connect transfer exists', () => {
    expect(mig).toContain('payout_period_has_connect_transfer');
    expect(mig).toContain('was_transferred');
    expect(mig).toContain('queue_connect_transfer_reversal_for_booking');
  });

  it('4.4 lifecycle keeps transfer confirmation separate from bank paid', () => {
    expect(mig).toContain('mark_payout_period_bank_paid');
    expect(webhook).toContain('mark_payout_period_bank_paid');
    expect(connectPayoutPresentationStatus({
      periodStatus: 'ready',
      connectLifecycle: 'transfer_completed',
    })).toBe('Sent to payout account');
    expect(connectPayoutPresentationStatus({
      periodStatus: 'paid',
      paidAt: '2026-12-01',
      connectLifecycle: 'bank_payout_paid',
    })).toBe('Paid to bank');
    expect(payoutMaySayPaid('paid', '2026-12-01', 'transfer_completed')).toBe(false);
    expect(payoutMaySayPaid('paid', '2026-12-01', 'bank_payout_paid')).toBe(true);
    expect(payoutMaySayPaid('paid', '2026-12-01', 'reversed')).toBe(false);
    expect(payoutPresentationStatus('ready', null)).toBe('Prepared');
  });

  it('4.4 unlink skips periods that already transferred', () => {
    expect(mig).toContain('not public.payout_period_has_connect_transfer(p.id)');
  });

  it('partner Overview still separates eligible vs prepared copy', () => {
    const rows = [
      earning({ reference: 'TV-A', netMinor: 5000, commissionBps: 1500 }),
      earning({ reference: 'TV-B', netMinor: 5000, commissionBps: 1800, status: 'pending' }),
    ];
    expect(selectUnallocatedEligibleEarnings(rows).map((r) => r.reference)).toEqual(['TV-A']);
    expect(nextPayoutPreparationLabel({ eligibleCount: 1 })).toMatch(/cycle|payout/i);
    expect(nextPayoutPreparationLabel({ eligibleCount: 1, periodStatus: 'ready' })).toMatch(
      /preparation only/i
    );
  });

  it('kill switches for execution are not flipped by P4 migration', () => {
    expect(mig).not.toMatch(/payout_execution_enabled',\s*1/);
    expect(mig).not.toMatch(/stripe_connect_transfers_enabled',\s*1/);
    expect(mig).toContain('payout_auto_prepare_enabled');
    expect(mig).toMatch(/'payout_auto_prepare_enabled'[\s\S]{0,80}0/);
  });
});
