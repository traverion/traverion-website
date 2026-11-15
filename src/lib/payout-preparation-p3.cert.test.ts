import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_PLANS } from './commercial-money';
import {
  nextPayoutPreparationLabel,
  payoutMaySayPaid,
  payoutPresentationStatus,
  selectAwaitingClearanceEarnings,
  selectUnallocatedEligibleEarnings,
  type IncomeEarningRow,
} from './supplier-income';

const root = resolve(__dirname, '../..');
const prepareMig = readFileSync(
  resolve(root, 'supabase/migrations/306_repair_stale_blocked_earning_items.sql'),
  'utf8'
);
const gatesMig = readFileSync(
  resolve(root, 'supabase/migrations/300_b2b94_payout_gates_and_tour_fulfillment.sql'),
  'utf8'
);
const connectFoundation = readFileSync(
  resolve(root, 'supabase/migrations/273_connect_payout_foundation.sql'),
  'utf8'
);
const transferEdge = readFileSync(
  resolve(root, 'supabase/functions/execute-supplier-transfers/index.ts'),
  'utf8'
);
const refreshEdge = readFileSync(
  resolve(root, 'supabase/functions/refresh-supplier-earnings/index.ts'),
  'utf8'
);
const refreshWorkflow = readFileSync(
  resolve(root, '.github/workflows/refresh-supplier-earnings.yml'),
  'utf8'
);

/** Production-shaped Royal Nordic eligible pool from P3 read-only cert (2026-11-15). */
const RN_ELIGIBLE: IncomeEarningRow[] = [
  {
    bookingId: 'a',
    reference: 'TV-5BX6P3WQ',
    experience: 'Tour',
    activityDate: '2026-10-27',
    purchaseDate: '2026-10-20',
    currency: 'EUR',
    netMinor: 7378,
    grossMinor: 8680,
    commissionMinor: 1302,
    commissionBps: 1500,
    status: 'eligible',
    bookingStatus: 'confirmed',
    paymentStatus: 'paid',
  },
  {
    bookingId: 'b',
    reference: 'TV-9NNEK3EZ',
    experience: 'Tour',
    activityDate: '2026-10-25',
    purchaseDate: '2026-10-18',
    currency: 'EUR',
    netMinor: 8500,
    grossMinor: 10000,
    commissionMinor: 1500,
    commissionBps: 1500,
    status: 'eligible',
    bookingStatus: 'confirmed',
    paymentStatus: 'paid',
  },
  {
    bookingId: 'c',
    reference: 'TV-ED3VFQYA',
    experience: 'Tour',
    activityDate: '2026-11-02',
    purchaseDate: '2026-10-28',
    currency: 'EUR',
    netMinor: 8500,
    grossMinor: 10000,
    commissionMinor: 1500,
    commissionBps: 1500,
    status: 'eligible',
    bookingStatus: 'confirmed',
    paymentStatus: 'paid',
  },
  {
    bookingId: 'd',
    reference: 'TV-FNFQEA87',
    experience: 'Tour',
    activityDate: '2026-10-31',
    purchaseDate: '2026-10-25',
    currency: 'EUR',
    netMinor: 8500,
    grossMinor: 10000,
    commissionMinor: 1500,
    commissionBps: 1500,
    status: 'eligible',
    bookingStatus: 'confirmed',
    paymentStatus: 'paid',
  },
  {
    bookingId: 'e',
    reference: 'TV-PDTAS6JD',
    experience: 'Tour',
    activityDate: '2026-10-23',
    purchaseDate: '2026-10-17',
    currency: 'EUR',
    netMinor: 10115,
    grossMinor: 11900,
    commissionMinor: 1785,
    commissionBps: 1500,
    status: 'eligible',
    bookingStatus: 'cancelled',
    paymentStatus: 'paid',
    refundChoice: 'no_refund',
  },
];

const RN_PENDING: IncomeEarningRow[] = [
  {
    bookingId: 'p1',
    reference: 'TV-EUX46NHT',
    experience: 'Tour',
    activityDate: '2026-11-20',
    purchaseDate: '2026-11-10',
    currency: 'EUR',
    netMinor: 25245,
    grossMinor: 29700,
    commissionMinor: 4455,
    commissionBps: 1500,
    status: 'pending',
    bookingStatus: 'confirmed',
    paymentStatus: 'paid',
  },
  {
    bookingId: 'p2',
    reference: 'TV-UJGGRK54',
    experience: 'Tour',
    activityDate: '2026-11-18',
    purchaseDate: '2026-11-08',
    currency: 'EUR',
    netMinor: 16994,
    grossMinor: 19993,
    commissionMinor: 2999,
    commissionBps: 1500,
    status: 'pending',
    bookingStatus: 'confirmed',
    paymentStatus: 'paid',
  },
];

describe('P3 payout preparation certification', () => {
  it('catalog locks monthly 15% and twice-monthly 18%', () => {
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

  it('prepare enforces cadence cutoffs, include gates, reversal gate, and advisory lock', () => {
    expect(prepareMig).toContain("v_terms.payout_cadence = 'monthly' and v_day <> 1");
    expect(prepareMig).toContain("v_terms.payout_cadence = 'semimonthly' and v_day not in (1, 15)");
    expect(prepareMig).toContain('booking_payout_include_allowed');
    expect(prepareMig).toContain('booking_requires_earning_reversal');
    expect(prepareMig).toContain("pg_advisory_xact_lock(hashtext('prepare_due_supplier_payouts'))");
    expect(prepareMig).toContain('on conflict (earning_item_id) do nothing');
    expect(prepareMig).toMatch(/'ready'/);
    expect(prepareMig).toContain("'payout_execution_enabled', false");
    expect(prepareMig).toContain("'stripe_transfer', false");
  });

  it('P3 noted threshold gap; P4 migration 307 enforces payout_threshold_min', () => {
    const p4 = readFileSync(
      resolve(root, 'supabase/migrations/307_p4_payout_hardening.sql'),
      'utf8'
    );
    expect(p4).toContain('supplier_payout_threshold_minor');
    expect(p4).toContain('skipped_below_threshold');
    expect(prepareMig).not.toMatch(/payout_threshold_min/);
  });

  it('admin mark-paid and Connect preflight stay behind payout_execution_enabled', () => {
    expect(gatesMig).toContain("key = 'payout_execution_enabled'");
    expect(gatesMig).toContain('admin_mark_payout_period_paid');
    expect(gatesMig).toContain('payout_execution_disabled');
  });

  it('Connect transfer edge is TEST-only and requires env kill switch', () => {
    expect(transferEdge).toContain('STRIPE_CONNECT_TRANSFERS_ENABLED');
    expect(transferEdge).toContain('must equal exactly "test"');
    expect(connectFoundation).toContain('stripe_connect_transfers_enabled');
    expect(connectFoundation).toMatch(/live_money_enabled\s*=\s*false/i);
  });

  it('hourly cron refreshes eligibility only — scheduled prepare is a separate workflow', () => {
    expect(refreshWorkflow).toContain("-d '{}'");
    expect(refreshWorkflow).not.toContain('prepare_payouts');
    expect(refreshEdge).toContain("prepMode === 'scheduled'");
    expect(refreshEdge).toContain('wantManual');
    expect(refreshEdge).toContain('never bank transfer');
  });

  it('partner Overview shows eligible pool and awaiting clearance without implying paid', () => {
    const all = [...RN_ELIGIBLE, ...RN_PENDING];
    const eligible = selectUnallocatedEligibleEarnings(all);
    const awaiting = selectAwaitingClearanceEarnings(all);
    expect(eligible.map((r) => r.reference).sort()).toEqual([
      'TV-5BX6P3WQ',
      'TV-9NNEK3EZ',
      'TV-ED3VFQYA',
      'TV-FNFQEA87',
      'TV-PDTAS6JD',
    ]);
    expect(eligible.reduce((s, r) => s + r.netMinor, 0)).toBe(42993);
    expect(awaiting.map((r) => r.reference).sort()).toEqual(['TV-EUX46NHT', 'TV-UJGGRK54']);
    expect(payoutMaySayPaid('ready', null)).toBe(false);
    expect(payoutPresentationStatus('ready', null)).toBe('Prepared');
    expect(nextPayoutPreparationLabel({ eligibleCount: 5 })).toMatch(/payout|allocated|cycle/i);
    expect(
      nextPayoutPreparationLabel({ eligibleCount: 5, periodStatus: 'ready' })
    ).toMatch(/preparation only/i);
  });

  it('Documents never treat READY periods as paid statements', () => {
    expect(payoutMaySayPaid('ready', null)).toBe(false);
    expect(payoutMaySayPaid('paid', null)).toBe(false);
    expect(payoutMaySayPaid('paid', '2026-12-01T00:00:00Z')).toBe(true);
  });

  it('frozen booking commission is snapshot-driven; prepare uses live terms only for cadence', () => {
    // prepare reads supplier_active_commercial_terms for cadence only — no re-split of amount_minor
    expect(prepareMig).toContain('supplier_active_commercial_terms');
    expect(prepareMig).not.toMatch(/commission_bps\s*=/);
    expect(prepareMig).not.toContain('commercial_split_minor');
  });
});
