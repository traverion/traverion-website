import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  travelerPaymentLabel,
  isRefundDueBooking,
  isRefundProcessingBooking,
  isRefundDelayedBooking,
  REFUND_PROCESSING_COPY,
  REFUND_DELAYED_COPY,
} from './payment-states';

const root = join(__dirname, '../..');

describe('Step 2.3 stay auto-refund', () => {
  const mig = readFileSync(
    join(root, 'supabase/migrations/264_stay_auto_cancellation_refunds.sql'),
    'utf8'
  );
  const edge = readFileSync(
    join(root, 'supabase/functions/execute-booking-refund/index.ts'),
    'utf8'
  );
  const webhook = readFileSync(join(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
  const cancelClient = readFileSync(join(root, 'src/data/supabase-bookings.ts'), 'utf8');

  it('migration queues durable instruction before Stripe and patches cancel paths', () => {
    expect(mig).toContain('ensure_stay_cancel_refund_instruction');
    expect(mig).toContain('claim_refund_instruction_for_execution');
    expect(mig).toContain('mark_refund_instruction_submitted');
    expect(mig).toContain('stay-cancel-refund:');
    expect(mig).toContain('auto_refund_status');
    expect(mig).toContain('ensure_stay_cancel_refund_instruction');
    expect(mig).toContain('respond_cancellation_request');
    expect(mig).toContain('cancel_booking_as_traveler');
  });

  it('edge executes Stripe refund with stable idempotency and never flips payment_status alone', () => {
    expect(edge).toContain('stripe.refunds.create');
    expect(edge).toContain('idempotencyKey');
    expect(edge).toContain('stay-cancel-refund:');
    expect(edge).toContain('paymentStatusPendingWebhook');
    expect(edge).not.toContain("payment_status: 'refunded'");
    expect(edge).toContain('isStripeTestSecretKey');
  });

  it('webhook marks instructions succeeded when charge is fully refunded', () => {
    expect(webhook).toContain('mark_booking_refund_instructions_succeeded');
  });

  it('client cancel invokes execute-booking-refund after full_refund', () => {
    expect(cancelClient).toContain('executeBookingRefund');
    expect(cancelClient).toContain('execute-booking-refund');
  });

  it('payment labels distinguish processing, delayed, due, and refunded', () => {
    const base = {
      status: 'cancelled',
      payment_status: 'paid',
      amount_paid: 120,
      refund_choice: 'full_refund',
    };
    expect(travelerPaymentLabel({ ...base, auto_refund_status: 'submitted' })).toBe(
      'Refund processing'
    );
    expect(travelerPaymentLabel({ ...base, auto_refund_status: 'failed' })).toBe('Refund delayed');
    expect(travelerPaymentLabel({ ...base, auto_refund_status: null })).toBe('Refund due');
    expect(
      travelerPaymentLabel({
        ...base,
        payment_status: 'refunded',
        auto_refund_status: 'submitted',
      })
    ).toBe('Refunded');
    expect(isRefundProcessingBooking({ ...base, auto_refund_status: 'processing' })).toBe(true);
    expect(isRefundDelayedBooking({ ...base, auto_refund_status: 'failed' })).toBe(true);
    expect(isRefundDueBooking({ ...base, auto_refund_status: 'queued' })).toBe(true);
    expect(REFUND_PROCESSING_COPY.toLowerCase()).toContain('stripe');
    expect(REFUND_DELAYED_COPY.toLowerCase()).toContain('retry');
  });

  it('non-refundable cancel stays No refund', () => {
    expect(
      travelerPaymentLabel({
        status: 'cancelled',
        payment_status: 'paid',
        amount_paid: 90,
        refund_choice: 'no_refund',
        auto_refund_status: 'queued',
      })
    ).toBe('No refund');
  });
});
