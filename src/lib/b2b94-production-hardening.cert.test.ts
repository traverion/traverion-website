/**
 * B2B.9.4 certification — static + pure classifier coverage.
 * No live Stripe charges/refunds/payouts. No production mutations.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyTourPayoutReadiness,
  TOUR_PAYOUT_MISSING_POLICIES,
} from './tour-payout-readiness';
import { classifyTourPaymentLedgerRow } from './tour-payment-ledger-reconcile';

const root = process.cwd();
const mig300 = readFileSync(
  join(root, 'supabase/migrations/300_b2b94_payout_gates_and_tour_fulfillment.sql'),
  'utf8'
);
const edgeAdmin = readFileSync(
  join(root, 'supabase/functions/admin-supplier-verification/index.ts'),
  'utf8'
);
const edgeCheckout = readFileSync(
  join(root, 'supabase/functions/create-booking-checkout-session/index.ts'),
  'utf8'
);
const edgeTransfers = existsSync(
  join(root, 'supabase/functions/execute-supplier-transfers/index.ts')
)
  ? readFileSync(join(root, 'supabase/functions/execute-supplier-transfers/index.ts'), 'utf8')
  : '';

const paidBase = {
  inventoryFamily: 'tour' as const,
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
  serviceFulfillmentStatus: 'completed',
  blocksPayout: false,
  nowIso: '2026-11-12T00:00:00.000Z',
};

describe('B2B.9.4 P0 payout gates (SQL)', () => {
  it('prepare_due requires booking_payout_include_allowed + reconcile + attestation', () => {
    expect(mig300).toContain('booking_payout_include_allowed');
    expect(mig300).toContain('booking_ledger_reconcile_flags');
    expect(mig300).toContain('prepare_due_supplier_payouts');
    expect(mig300).toMatch(
      /prepare_due_supplier_payouts[\s\S]*booking_payout_include_allowed/
    );
    expect(mig300).toContain('pg_advisory_xact_lock');
    expect(mig300).toContain('for update skip locked');
    expect(mig300).toContain('tour_fulfillment_not_attested');
    expect(mig300).toContain('requires_ledger_reconcile_ok');
  });

  it('keeps payout execution disabled by default and revalidates before mark-paid', () => {
    expect(mig300).toMatch(/payout_execution_enabled[\s\S]*0/);
    expect(mig300).toContain('payout_execution_disabled');
    expect(mig300).toContain('included_items_no_longer_eligible');
    expect(mig300).toContain('admin_mark_payout_period_paid');
    expect(mig300).toContain('supplier_connect_transfer_preflight');
  });

  it('tour fulfillment attestation is audited and server-controlled', () => {
    expect(mig300).toContain('service_fulfillment_status');
    expect(mig300).toContain("'scheduled', 'in_progress', 'completed', 'no_show', 'disputed'");
    expect(mig300).toContain('supplier_attest_booking_service_fulfillment');
    expect(mig300).toContain('admin_set_booking_service_fulfillment');
    expect(mig300).toContain('booking_service_fulfillment_events');
    expect(mig300).toContain('financial_audit_log');
    expect(mig300).not.toMatch(/update public\.bookings[\s\S]{0,200}updated_at/);
  });
});

describe('B2B.9.4 certification scenarios (pure)', () => {
  it('1. successful Tour booking payment → earning classify ok when attested', () => {
    const r = classifyTourPayoutReadiness(paidBase);
    expect(r.ready).toBe(true);
    expect(r.reconciliationStatus).toBe('ok');
  });

  it('2. duplicate payment webhook / PI collision held', () => {
    const r = classifyTourPaymentLedgerRow({
      ...paidBase,
      paymentIntentBookingCount: 2,
    });
    expect(r.flags).toContain('duplicate_payment_intent');
  });

  it('3. failed payment cannot retain payable earnings', () => {
    const r = classifyTourPayoutReadiness({
      ...paidBase,
      paymentStatus: 'failed',
    });
    expect(r.ready).toBe(false);
    expect(r.blockingReasons).toContain('payment_not_confirmed');
  });

  it('4–5. cancelled / refunded / partial mismatch held', () => {
    const refunded = classifyTourPayoutReadiness({
      ...paidBase,
      paymentStatus: 'refunded',
      bookingStatus: 'cancelled',
      earningStatus: 'reversed',
      earningAmountMinor: 0,
      serviceFulfillmentStatus: 'completed',
    });
    expect(refunded.ready).toBe(false);
    expect(refunded.blockingReasons).toContain('payment_refunded');

    const partial = classifyTourPaymentLedgerRow({
      paymentStatus: 'paid',
      amountPaidMajor: 10,
      grossMinor: 500,
      commissionMinor: 75,
      supplierMinor: 425,
      earningCount: 1,
      earningStatus: 'pending',
      earningAmountMinor: 425,
    });
    expect(partial.flags).toContain('amount_mismatch');
  });

  it('6–8. supplier earning + reconcile mismatch + eligibility', () => {
    const mismatch = classifyTourPayoutReadiness({
      ...paidBase,
      earningAmountMinor: 100,
    });
    expect(mismatch.ready).toBe(false);
    expect(mismatch.blockingReasons).toContain('earning_net_mismatch');

    const ready = classifyTourPayoutReadiness(paidBase);
    expect(ready.ready).toBe(true);
  });

  it('9. held payout for historical missing ledger', () => {
    const r = classifyTourPayoutReadiness({
      ...paidBase,
      grossMinor: null,
      commissionMinor: null,
      supplierMinor: null,
      earningCount: 0,
      earningStatus: null,
      earningAmountMinor: null,
    });
    expect(r.bucket).toBe('held');
    expect(r.blockingReasons).toContain('missing_snapshot');
    expect(r.blockingReasons).toContain('missing_earning');
  });

  it('10–11. completion attestation required; no-show/disputed held', () => {
    const unattested = classifyTourPayoutReadiness({
      ...paidBase,
      serviceFulfillmentStatus: 'scheduled',
    });
    expect(unattested.blockingReasons).toContain('tour_fulfillment_not_attested');

    const noShow = classifyTourPayoutReadiness({
      ...paidBase,
      serviceFulfillmentStatus: 'no_show',
    });
    expect(noShow.blockingReasons).toContain('no_show');
  });

  it('12–14. concurrent PI collision, supplier isolation, admin auth wiring', () => {
    expect(
      classifyTourPaymentLedgerRow({
        ...paidBase,
        checkoutSessionBookingCount: 2,
      }).flags
    ).toContain('duplicate_checkout_session');

    expect(mig300).toContain('is_supplier_account_side');
    expect(edgeAdmin).toContain('assertAdmin');
    expect(edgeAdmin).toContain("tour_payout_readiness");
  });

  it('15–16. Stays untouched by tour attestation; Rentals checkout remains kill-switched', () => {
    // Stay inventory is out of tour readiness classifier scope.
    const stay = classifyTourPayoutReadiness({
      ...paidBase,
      inventoryFamily: 'stay',
      serviceFulfillmentStatus: null,
    });
    expect(stay.blockingReasons).toContain('not_tour');

    expect(edgeCheckout).toMatch(/RENTAL_CHECKOUT_ENABLED/);
    expect(edgeCheckout).toMatch(/\.trim\(\)\s*===\s*'1'/);
    if (edgeTransfers) {
      expect(edgeTransfers).toMatch(/STRIPE_CONNECT_TRANSFERS_ENABLED|TEST|kill/i);
    }
  });
});

describe('B2B.9.4 missing policies surfaced', () => {
  it('does not invent no-show settlement or enable execution silently', () => {
    expect(TOUR_PAYOUT_MISSING_POLICIES).toContain(
      'no_show_and_dispute_commercial_settlement_policy_undefined_payouts_remain_held'
    );
    expect(TOUR_PAYOUT_MISSING_POLICIES).toContain(
      'payout_execution_disabled_until_separately_authorized'
    );
    expect(mig300).toContain(
      'no_show_and_dispute_commercial_settlement_policy_undefined_payouts_remain_held'
    );
  });
});
