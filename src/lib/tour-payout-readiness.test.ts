import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TOUR_PAYOUT_MISSING_POLICIES,
  aggregateTourPayoutBalances,
  classifyTourPayoutReadiness,
} from './tour-payout-readiness';

const root = process.cwd();
const mig = readFileSync(
  join(root, 'supabase/migrations/299_admin_tour_payout_readiness.sql'),
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

const basePaid = {
  inventoryFamily: 'tour',
  supplierId: '11111111-1111-4111-8111-111111111111',
  supplierExists: true,
  paymentStatus: 'paid',
  bookingStatus: 'confirmed',
  amountPaidMajor: 10,
  grossMinor: 1000,
  commissionMinor: 150,
  supplierMinor: 850,
  earningCount: 1,
  earningStatus: 'pending',
  earningAmountMinor: 850,
  paymentIntentBookingCount: 1,
  checkoutSessionBookingCount: 1,
  serviceCompletedAt: '2020-01-01T12:00:00.000Z',
  eligibleAt: '2020-01-01T12:00:00.000Z',
  blocksPayout: false,
  nowIso: '2026-11-10T00:00:00.000Z',
};

describe('classifyTourPayoutReadiness', () => {
  it('marks completed reconciled Tour as eligible', () => {
    const r = classifyTourPayoutReadiness(basePaid);
    expect(r.ready).toBe(true);
    expect(r.bucket).toBe('eligible');
    expect(r.blockingReasons).toEqual([]);
  });

  it('keeps future Tour in pending_not_eligible', () => {
    const r = classifyTourPayoutReadiness({
      ...basePaid,
      serviceCompletedAt: '2099-01-01T12:00:00.000Z',
      eligibleAt: '2099-01-02T12:00:00.000Z',
    });
    expect(r.ready).toBe(false);
    expect(r.bucket).toBe('pending_not_eligible');
    expect(r.blockingReasons).toContain('service_not_completed');
    expect(r.blockingReasons).toContain('hold_period_active');
  });

  it('blocks cancelled/refunded Tours', () => {
    const refunded = classifyTourPayoutReadiness({
      ...basePaid,
      paymentStatus: 'refunded',
      bookingStatus: 'cancelled',
      earningStatus: 'reversed',
      earningAmountMinor: 0,
    });
    expect(refunded.ready).toBe(false);
    expect(refunded.bucket).toBe('reversed');
    expect(refunded.blockingReasons).toContain('payment_refunded');
    expect(refunded.blockingReasons).toContain('booking_cancelled');
  });

  it('blocks disputed and policy-held bookings', () => {
    const r = classifyTourPayoutReadiness({
      ...basePaid,
      disputeStatus: 'open',
      blocksPayout: true,
    });
    expect(r.bucket).toBe('held');
    expect(r.blockingReasons).toContain('disputed');
    expect(r.blockingReasons).toContain('blocked_by_policy');
  });

  it('blocks missing ledger/snapshot (B2B.9.2 fixtures)', () => {
    const r = classifyTourPayoutReadiness({
      ...basePaid,
      grossMinor: null,
      commissionMinor: null,
      supplierMinor: null,
      earningCount: 0,
      earningStatus: null,
      earningAmountMinor: null,
    });
    expect(r.ready).toBe(false);
    expect(r.bucket).toBe('held');
    expect(r.blockingReasons).toContain('missing_snapshot');
    expect(r.blockingReasons).toContain('missing_earning');
    expect(r.blockingReasons).toContain('unreconciled');
  });

  it('blocks duplicate earnings', () => {
    const r = classifyTourPayoutReadiness({
      ...basePaid,
      earningCount: 2,
    });
    expect(r.bucket).toBe('held');
    expect(r.blockingReasons).toContain('duplicate_earning');
  });

  it('classifies already-paid earnings', () => {
    const r = classifyTourPayoutReadiness({
      ...basePaid,
      earningStatus: 'paid',
    });
    expect(r.bucket).toBe('already_paid');
    expect(r.blockingReasons).toContain('already_paid');
  });

  it('fails closed on unknown payment/booking states', () => {
    const r = classifyTourPayoutReadiness({
      ...basePaid,
      paymentStatus: 'weird',
      bookingStatus: 'mystery',
    });
    expect(r.ready).toBe(false);
    expect(r.blockingReasons).toContain('payment_unknown');
    expect(r.blockingReasons).toContain('booking_status_unknown');
  });

  it('excludes non-tour inventory', () => {
    const r = classifyTourPayoutReadiness({
      ...basePaid,
      inventoryFamily: 'rental',
    });
    expect(r.blockingReasons).toContain('not_tour');
  });
});

describe('aggregateTourPayoutBalances', () => {
  it('aggregates one currency and refuses mixes', () => {
    const bal = aggregateTourPayoutBalances([
      { currency: 'EUR', amountMinor: 100, bucket: 'eligible' },
      { currency: 'EUR', amountMinor: 40, bucket: 'pending_not_eligible' },
      { currency: 'EUR', amountMinor: 25, bucket: 'held' },
      { currency: 'EUR', amountMinor: 200, bucket: 'already_paid' },
      { currency: 'EUR', amountMinor: 0, bucket: 'reversed' },
    ]);
    expect(bal).toEqual({
      currency: 'EUR',
      totalEarnedMinor: 365,
      pendingNotEligibleMinor: 40,
      eligibleForPayoutMinor: 100,
      heldDisputedMinor: 25,
      alreadyPaidMinor: 200,
    });
    expect(() =>
      aggregateTourPayoutBalances([
        { currency: 'EUR', amountMinor: 1, bucket: 'eligible' },
        { currency: 'USD', amountMinor: 1, bucket: 'eligible' },
      ])
    ).toThrow(/mixed currencies/);
  });
});

describe('B2B.9.3 wiring (cert)', () => {
  it('documents missing policies rather than inventing them', () => {
    expect(TOUR_PAYOUT_MISSING_POLICIES.length).toBeGreaterThan(0);
    expect(mig).toContain('missing_policies');
    for (const p of TOUR_PAYOUT_MISSING_POLICIES) {
      expect(mig).toContain(p);
    }
  });

  it('migration is read-only service_role Tour readiness RPC', () => {
    expect(mig).toContain('admin_tour_payout_readiness');
    expect(mig).toContain("scope', 'tour'");
    expect(mig).toContain('read_only');
    expect(mig).toContain('grant execute');
    expect(mig).toContain('service_role');
    expect(mig).toMatch(/revoke all[\s\S]*from anon, authenticated/);
    expect(mig).toContain('missing_snapshot');
    expect(mig).toContain('missing_earning');
    expect(mig).not.toMatch(/update public\.(bookings|supplier_earning_items|supplier_payout_periods)/i);
    expect(mig).not.toMatch(/insert into public\.(supplier_payout_periods|supplier_earning_items)/i);
    expect(mig).not.toMatch(/stripe\.(transfers|payouts|charges)/i);
    expect(mig).toMatch(/No Stripe transfers/i);
  });

  it('admin edge action is assertAdmin-gated and read-only', () => {
    expect(edge).toContain("tour_payout_readiness");
    expect(edge).toContain('admin_tour_payout_readiness');
    expect(edge).toContain('assertAdmin');
    const assertIdx = edge.indexOf('async function assertAdmin');
    const gateIdx = edge.indexOf('const gate = await assertAdmin');
    const actionIdx = edge.indexOf("body.action === 'tour_payout_readiness'");
    expect(assertIdx).toBeGreaterThan(0);
    expect(gateIdx).toBeGreaterThan(assertIdx);
    expect(actionIdx).toBeGreaterThan(gateIdx);
    const slice = edge.slice(actionIdx, actionIdx + 900);
    expect(slice).toContain("rpc('admin_tour_payout_readiness'");
    expect(slice).not.toContain('prepare_due_supplier_payouts');
    expect(slice).not.toContain('admin_mark_payout_period_paid');
  });

  it('commercial panel exposes read-only Tour payout readiness UI without payout buttons', () => {
    expect(panel).toContain('TourPayoutReadiness');
    expect(panel).toContain('tour_payout_readiness');
    expect(panel).toMatch(/Read-only Tour payout readiness|does not execute payouts/i);
    const start = panel.indexOf('function TourPayoutReadiness');
    expect(start).toBeGreaterThan(0);
    const slice = panel.slice(start, start + 4500);
    expect(slice).not.toMatch(/>\s*(Execute payout|Pay supplier|Transfer now)\s*</i);
    expect(slice).not.toContain("action: 'prepare_due_payouts'");
    expect(slice).not.toContain("action: 'mark_payout_period_paid'");
  });
});
