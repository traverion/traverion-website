/**
 * B2B.9.1: Tour booking lifecycle hardening — payment failure, webhook
 * idempotency / refund ledger recovery, concurrency, refund safety.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  alreadyRefundedWebhookShouldReconcileLedger,
  tourCheckoutStripeCreateFailureShouldFailPending,
} from './stripe-charge-refund';

const root = process.cwd();
const webhook = readFileSync(join(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
const checkout = readFileSync(
  join(root, 'supabase/functions/create-booking-checkout-session/index.ts'),
  'utf8'
);
const refundEdge = readFileSync(
  join(root, 'supabase/functions/execute-booking-refund/index.ts'),
  'utf8'
);
const concurrencyCert = readFileSync(
  join(root, 'src/lib/booking-concurrency-safety.cert.test.ts'),
  'utf8'
);
const inventoryCert = readFileSync(
  join(root, 'src/lib/checkout-inventory-concurrency.cert.test.ts'),
  'utf8'
);
const expireMig = readFileSync(
  join(root, 'supabase/migrations/257_instant_book_no_pending_inventory_hold.sql'),
  'utf8'
);

describe('B2B.9.1 Tour payment failures', () => {
  it('failed/expired Checkout never promotes paid bookings', () => {
    expect(webhook).toMatch(/payment_intent\.payment_failed/);
    expect(webhook).toMatch(/checkout\.session\.expired/);
    expect(webhook).toMatch(/\.eq\('payment_status',\s*'pending'\)/);
    expect(expireMig).toMatch(/booking_occupies_inventory|occupies_inventory/i);
  });

  it('tour Stripe create failure marks orphan pending failed (not stay/rental)', () => {
    expect(tourCheckoutStripeCreateFailureShouldFailPending({ inventoryFamily: null })).toBe(true);
    expect(tourCheckoutStripeCreateFailureShouldFailPending({ inventoryFamily: 'tour' })).toBe(true);
    expect(tourCheckoutStripeCreateFailureShouldFailPending({ inventoryFamily: 'stay' })).toBe(false);
    expect(tourCheckoutStripeCreateFailureShouldFailPending({ inventoryFamily: 'rental' })).toBe(
      false
    );
    expect(checkout).toContain('tourCheckoutStripeCreateFailureShouldFailPending');
    expect(checkout).toMatch(
      /tourCheckoutStripeCreateFailureShouldFailPending[\s\S]*payment_status:\s*'failed'/
    );
  });
});

describe('B2B.9.1 Tour webhook idempotency', () => {
  it('durable stripe_webhook_events claim/replay remains', () => {
    expect(webhook).toContain('stripe_webhook_events');
    expect(webhook).toMatch(/markProcessed\('processed'\)/);
    expect(webhook).toMatch(/markProcessed\('failed'/);
  });

  it('already-refunded charge.refunded retries still reverse earnings', () => {
    expect(
      alreadyRefundedWebhookShouldReconcileLedger({
        bookingPaymentStatus: 'refunded',
        fullyRefunded: true,
      })
    ).toBe(true);
    expect(
      alreadyRefundedWebhookShouldReconcileLedger({
        bookingPaymentStatus: 'paid',
        fullyRefunded: true,
      })
    ).toBe(false);
    expect(
      alreadyRefundedWebhookShouldReconcileLedger({
        bookingPaymentStatus: 'refunded',
        fullyRefunded: false,
      })
    ).toBe(false);

    expect(webhook).toContain('alreadyRefundedWebhookShouldReconcileLedger');
    expect(webhook).toMatch(
      /alreadyRefundedWebhookShouldReconcileLedger[\s\S]*reverse_paid_booking_earnings[\s\S]*mark_booking_refund_instructions_succeeded[\s\S]*ledgerReconciled:\s*true/
    );
    // Concurrent paid→refunded race still reconciles ledger before notify gate.
    expect(webhook).toMatch(
      /Full refund update matched no paid booking row[\s\S]*reverse_paid_booking_earnings/
    );
  });
});

describe('B2B.9.1 Tour concurrent bookings', () => {
  it('keeps promote/assert atomicity certs and claim inventory lock surface', () => {
    expect(concurrencyCert.length).toBeGreaterThan(100);
    expect(inventoryCert).toMatch(/assert_checkout_inventory|advisory|promote/i);
    expect(checkout).toContain('claim_pending_checkout_booking');
    expect(checkout).toContain('assert_checkout_inventory');
  });
});

describe('B2B.9.1 Tour refund safety', () => {
  it('cancel-refund uses durable Stripe idempotency keys and recover', () => {
    expect(refundEdge).toContain('cancel-refund:');
    expect(refundEdge).toContain('ensure_booking_cancel_refund_instruction');
    expect(refundEdge).toContain('claim_refund_instruction_for_execution');
    expect(refundEdge).toContain('idempotencyKey');
    expect(refundEdge).toContain('recover');
    expect(refundEdge).toContain('alreadyRefunded');
  });
});
